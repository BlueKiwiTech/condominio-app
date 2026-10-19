import { createServiceClient } from '@/lib/supabase/service';
import type { ExchangeRateType } from '@/lib/exchangeRate';
import { releaseHeldTransactions, type ReleaseSummary } from '@/lib/payments/releaseHeld';

// Vercel Cron hits this once a day at 06:00 VET (vercel.json: "0 10 * * *",
// UTC -- Venezuela has no DST, always UTC-4). Two independent sources:
//   - bcv + eur: rates.dolarvzla.com/bcv/current.json (free, no API key).
//     The BCV publishes the NEXT business day's rate on Friday afternoon and
//     dolarvzla exposes it right away: `current.date` is that rate's validity
//     date. So the Saturday/Sunday/holiday runs already insert Monday's (or
//     Tuesday's) rate and weekend-dated payments convert with it through the
//     existing "rate as of a date" lookup (by `updated_at`) + 24h freshness.
//   - binance: cotizave.com's aggregator (market `binance`, field `mid`).
//     dolarvzla's USDT endpoint needs an API key that expires in 4 days.
// There is deliberately NO cotizave fallback for bcv/eur: on weekends it
// serves Friday's value, so a payment would silently convert at the wrong
// rate. If dolarvzla fails, bcv/eur are skipped and reported (success:false);
// payments needing them block after 24h and the admin can set a manual rate.
//
// Run this ONCE a day, at 10:00 UTC. An extra Friday-afternoon run would insert
// Monday's rate with a Friday `updated_at`, and Friday-dated payments would
// pick it up instead of Friday's rate.
//
// Admin can also set a rate manually (lib/actions/exchangeRate.ts) -- both
// write to the same append-only condo_exchange_rates table, just with a
// different `source`.
//
// Not `export const runtime = 'edge'` -- default Node.js (Fluid Compute)
// is correct here per Vercel's own current guidance; there's nothing
// edge-specific about outbound fetches + a Supabase insert, and Node
// keeps this on the same runtime as every other Server Action/service-role
// write in the app.
export const dynamic = 'force-dynamic';

const DOLARVZLA_BCV_URL = 'https://rates.dolarvzla.com/bcv/current.json';
const COTIZAVE_RATES_URL = 'https://api.cotizave.com/v1/fx/rates';
// A hung source must not eat the whole function: give up and report it.
const FETCH_TIMEOUT_MS = 10_000;

type DolarvzlaResponse = { current?: { date?: string; usd?: number; eur?: number } };

type CotizaveRate = {
  market: string;
  type: string;
  mid: number;
  updated_at?: string;
};
type CotizaveResponse = { rates?: CotizaveRate[] };

type RateCandidate = {
  rateType: ExchangeRateType;
  rate: number;
  effectiveDate: string | null;
  sourceUpdatedAt: string | null;
};

// What one source contributed: the rates it can insert plus, for the types it
// could not provide, why (reported as `skipped: ...`).
type SourceOutcome = {
  candidates: RateCandidate[];
  skipped: Partial<Record<ExchangeRateType, string>>;
  warnings: string[];
};

async function fetchJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return (await res.json()) as T;
}

// Audit-only provider dates (change tasa-bcv-calendario): freshness keeps
// using `updated_at` (insertion time), so a missing/invalid date must never
// stop a valid rate from being stored -- it just lands as NULL and is reported.
function parseEffectiveDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Rejects well-formed but impossible dates (2026-02-30), without touching timezones.
  return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value) ? value : null;
}

function parseSourceTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

// condo_exchange_rates.rate is decimal(14,4) and dolarvzla's euro has 8
// decimals: round here so the value we report is the one actually stored.
function roundRate(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function isUsableRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

async function readBcvFromDolarvzla(): Promise<SourceOutcome> {
  const outcome: SourceOutcome = { candidates: [], skipped: {}, warnings: [] };
  let current: NonNullable<DolarvzlaResponse['current']> | undefined;
  try {
    current = (await fetchJson<DolarvzlaResponse>(DOLARVZLA_BCV_URL)).current;
  } catch (err) {
    console.error('[cron/exchange-rate] dolarvzla fetch failed:', err);
    const reason = `skipped: dolarvzla unavailable (${(err as Error).message})`;
    outcome.skipped = { bcv: reason, eur: reason };
    return outcome;
  }

  const effectiveDate = parseEffectiveDate(current?.date);
  for (const [rateType, field] of [
    ['bcv', 'usd'],
    ['eur', 'eur'],
  ] as const) {
    const value = current?.[field];
    if (!isUsableRate(value)) {
      outcome.skipped[rateType] = `skipped: missing or invalid "current.${field}" in dolarvzla response`;
      continue;
    }
    // dolarvzla gives a date but no time, so source_updated_at stays NULL.
    outcome.candidates.push({ rateType, rate: roundRate(value), effectiveDate, sourceUpdatedAt: null });
    if (!effectiveDate) {
      outcome.warnings.push(`${rateType}: missing or invalid current.date in dolarvzla response, stored as NULL`);
    }
  }
  return outcome;
}

async function readBinanceFromCotizave(): Promise<SourceOutcome> {
  const outcome: SourceOutcome = { candidates: [], skipped: {}, warnings: [] };
  const apiKey = process.env.COTIZAVE_API_KEY;
  if (!apiKey) {
    outcome.skipped.binance = 'skipped: COTIZAVE_API_KEY is not set';
    return outcome;
  }

  let rates: CotizaveRate[] | undefined;
  try {
    rates = (await fetchJson<CotizaveResponse>(COTIZAVE_RATES_URL, { 'X-API-Key': apiKey })).rates;
  } catch (err) {
    console.error('[cron/exchange-rate] cotizave fetch failed:', err);
    outcome.skipped.binance = `skipped: cotizave unavailable (${(err as Error).message})`;
    return outcome;
  }

  // The BCV markets (`reference`, `eur_reference`) are ignored on purpose: see
  // the no-fallback note at the top.
  const entry = rates?.find((r) => r.market === 'binance');
  if (!isUsableRate(entry?.mid)) {
    outcome.skipped.binance = 'skipped: missing or invalid "binance" market in response';
    return outcome;
  }
  // P2P has no validity date: effective_date stays NULL by design.
  outcome.candidates.push({
    rateType: 'binance',
    rate: roundRate(entry.mid),
    effectiveDate: null,
    sourceUpdatedAt: parseSourceTimestamp(entry.updated_at),
  });
  return outcome;
}

async function insertRate(
  service: ReturnType<typeof createServiceClient>,
  { rateType, rate, effectiveDate, sourceUpdatedAt }: RateCandidate,
): Promise<{ error: string | null }> {
  const { error } = await service.from('condo_exchange_rates').insert({
    rate_type: rateType,
    rate,
    source: 'cron',
    effective_date: effectiveDate,
    source_updated_at: sourceUpdatedAt,
  });
  return { error: error?.message ?? null };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // The two sources are independent: one failing never blocks the other.
  const [bcvSource, binanceSource] = await Promise.all([readBcvFromDolarvzla(), readBinanceFromCotizave()]);
  const candidates = [...bcvSource.candidates, ...binanceSource.candidates];
  const results: Record<string, string> = { ...bcvSource.skipped, ...binanceSource.skipped };
  const effectiveDates: Record<string, string | null> = {};
  const warnings = [...bcvSource.warnings, ...binanceSource.warnings];

  // Nothing to store from either source: 502 and no inserts.
  if (candidates.length === 0) {
    console.error('[cron/exchange-rate] no source produced a rate:', results);
    return Response.json({ success: false, error: 'No rate source responded', results, effective_dates: effectiveDates, warnings }, { status: 502 });
  }

  const service = createServiceClient();
  for (const candidate of candidates) {
    const { error } = await insertRate(service, candidate);
    results[candidate.rateType] = error ? `error: ${error}` : `ok: ${candidate.rate}`;
    effectiveDates[candidate.rateType] = error ? null : candidate.effectiveDate;
  }

  // New rates may unblock payments/expenses that were parked "en espera de
  // tasa". Strictly after the inserts and inside its own try/catch: the rates
  // are already stored, so a failing release must never undo or hide that.
  let released: ReleaseSummary | null = null;
  let releaseError: string | null = null;
  try {
    released = await releaseHeldTransactions(service);
  } catch (err) {
    releaseError = (err as Error).message;
    console.error('[cron/exchange-rate] releasing held transactions failed:', err);
  }

  const hadFailure = Object.values(results).some((v) => !v.startsWith('ok')) || releaseError !== null;
  if (hadFailure) console.error('[cron/exchange-rate] partial failure:', results);
  if (warnings.length) console.warn('[cron/exchange-rate] warnings:', warnings);

  return Response.json({
    success: !hadFailure,
    results,
    effective_dates: effectiveDates,
    warnings,
    released,
    ...(releaseError ? { release_error: releaseError } : {}),
  });
}

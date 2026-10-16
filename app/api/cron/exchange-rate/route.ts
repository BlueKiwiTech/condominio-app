import { createServiceClient } from '@/lib/supabase/service';
import type { ExchangeRateType } from '@/lib/exchangeRate';

// Vercel Cron hits this once a day at 06:00 VET (vercel.json: "0 10 * * *",
// UTC -- Venezuela has no DST, always UTC-4). Sources the BCV (USD and EUR)
// and Binance rates from cotizave.com's aggregator API in one call, chosen over scraping
// bcv.org.ve and Binance's own P2P endpoint directly: BCV's page is stable
// enough to scrape, but Binance's P2P endpoint is undocumented/unofficial
// and known to be unstable (see chat history) -- cotizave.com already
// solves that scraping problem, so one reliable call replaces two fragile
// ones. Admin can also set either rate manually (lib/actions/
// exchangeRate.ts) -- both write to the same append-only
// condo_exchange_rates table, just with a different `source`.
//
// Not `export const runtime = 'edge'` -- default Node.js (Fluid Compute)
// is correct here per Vercel's own current guidance; there's nothing
// edge-specific about one outbound fetch + a Supabase insert, and Node
// keeps this on the same runtime as every other Server Action/service-role
// write in the app.
export const dynamic = 'force-dynamic';

type CotizaveRate = {
  market: string;
  type: string;
  mid: number;
  // Only the BCV/EUR reference markets carry a validity date; P2P (binance) doesn't.
  effective_date?: string;
  updated_at?: string;
};

type CotizaveResponse = { rates: CotizaveRate[] };

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

async function insertRate(
  service: ReturnType<typeof createServiceClient>,
  rateType: ExchangeRateType,
  rate: number,
  effectiveDate: string | null,
  sourceUpdatedAt: string | null,
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

  const apiKey = process.env.COTIZAVE_API_KEY;
  if (!apiKey) {
    return Response.json({ success: false, error: 'COTIZAVE_API_KEY is not set' }, { status: 500 });
  }

  let payload: CotizaveResponse;
  try {
    const res = await fetch('https://api.cotizave.com/v1/fx/rates', {
      headers: { 'X-API-Key': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`cotizave.com responded ${res.status}`);
    payload = await res.json();
  } catch (err) {
    console.error('[cron/exchange-rate] fetch failed:', err);
    return Response.json({ success: false, error: (err as Error).message }, { status: 502 });
  }

  const service = createServiceClient();
  const results: Record<string, string> = {};
  const effectiveDates: Record<string, string | null> = {};
  const warnings: string[] = [];

  // Each rate is inserted independently -- a malformed/missing field for
  // one (e.g. cotizave.com renames a market key) shouldn't block updating
  // the others. `hasEffectiveDate`: only the BCV/EUR reference markets
  // publish one; binance is stored with a NULL date by design.
  const sources: { rateType: ExchangeRateType; market: string; hasEffectiveDate: boolean }[] = [
    { rateType: 'bcv', market: 'reference', hasEffectiveDate: true },
    { rateType: 'eur', market: 'eur_reference', hasEffectiveDate: true },
    { rateType: 'binance', market: 'binance', hasEffectiveDate: false },
  ];

  for (const { rateType, market, hasEffectiveDate } of sources) {
    const entry = payload.rates?.find((r) => r.market === market);
    const rate = entry?.mid;
    if (typeof rate !== 'number' || !(rate > 0)) {
      results[rateType] = `skipped: missing or invalid "${market}" market in response`;
      continue;
    }

    const effectiveDate = hasEffectiveDate ? parseEffectiveDate(entry?.effective_date) : null;
    if (hasEffectiveDate && !effectiveDate) {
      warnings.push(`${rateType}: missing or invalid effective_date in "${market}" market, stored as NULL`);
    }

    const { error } = await insertRate(service, rateType, rate, effectiveDate, parseSourceTimestamp(entry?.updated_at));
    results[rateType] = error ? `error: ${error}` : `ok: ${rate}`;
    effectiveDates[rateType] = error ? null : effectiveDate;
  }

  const hadFailure = Object.values(results).some((v) => !v.startsWith('ok'));
  if (hadFailure) console.error('[cron/exchange-rate] partial failure:', results);
  if (warnings.length) console.warn('[cron/exchange-rate] warnings:', warnings);

  return Response.json({ success: !hadFailure, results, effective_dates: effectiveDates, warnings });
}

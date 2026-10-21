'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { subMonths } from 'date-fns';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getResidentSession } from '@/lib/auth/residentSession';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';
import { RATE_COLUMNS, RATE_TYPES, fetchRatesAsOf } from '@/lib/rates/asOf';
import { releaseHeldTransactions } from '@/lib/payments/releaseHeld';

type ActionResult = { error: string } | { success: true };

/** Network-verified — never getSession() as an authorization gate (CLAUDE.md). */
async function requireAdmin(tc: Awaited<ReturnType<typeof getTranslations>>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: tc('sessionExpired'), supabase: null, userId: null };
  }
  return { error: null, supabase, userId: data.user.id };
}

/** Latest row for each rate_type ('bcv', 'eur', 'binance') — null entries mean no row exists yet at all. */
export async function getLatestExchangeRates(): Promise<Record<ExchangeRateType, ExchangeRateRow | null>> {
  const supabase = await createClient();
  const [{ data: bcv }, { data: eur }, { data: binance }] = await Promise.all(
    RATE_TYPES.map((rateType) =>
      supabase
        .from('condo_exchange_rates')
        .select(RATE_COLUMNS)
        .eq('rate_type', rateType)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  );
  return {
    bcv: (bcv as ExchangeRateRow | null) ?? null,
    eur: (eur as ExchangeRateRow | null) ?? null,
    binance: (binance as ExchangeRateRow | null) ?? null,
  };
}

/**
 * Latest row for each rate_type AS OF a given calendar date (its own
 * `updated_at`, not "now") — 2026-09-29 user decision: a payment's
 * cross-currency conversion (lib/payments/allocate.ts's allocateFunds) must
 * use the rate that was in effect on the payment's own "Fecha de abono", not
 * whatever the rate happens to be when the admin clicks submit (which could
 * be days later for a backdated entry). `dateStr` is a `YYYY-MM-DD` date-only
 * string (see lib/cuotas/generate.ts's toDateOnly) — the cutoff is that
 * date's end-of-day UTC, so same-day rate updates still count. Returns null
 * for a rate_type with no row at or before that date at all (never existed
 * yet) — same shape as getLatestExchangeRates, so callers plug it into the
 * same `toUsd`/`fromUsd`/`convertAmount` helpers (which separately gate on
 * `isRateFresh` relative to whatever `referenceDate` the caller passes them).
 */
export async function getExchangeRatesAsOf(dateStr: string): Promise<Record<ExchangeRateType, ExchangeRateRow | null>> {
  const supabase = await createClient();
  return fetchRatesAsOf(supabase, dateStr);
}

/**
 * Same as getExchangeRatesAsOf, but callable from a resident-facing client
 * component: condo_exchange_rates' RLS is admin-only and residents never get
 * a Supabase Auth session (Pattern A), so this goes through the service-role
 * client instead, gated by the resident's own signed session cookie rather
 * than getUser() -- used to keep "Reportar un pago"'s USD-reference hint
 * (lib/exchangeRate.ts's referenceUsdAmount) tied to whatever "Fecha de
 * abono" the resident picks, not always today's rate (2026-09-29 user
 * correction).
 */
export async function getExchangeRatesAsOfForResident(dateStr: string): Promise<Record<ExchangeRateType, ExchangeRateRow | null> | null> {
  const session = await getResidentSession();
  if (!session) return null;
  const supabase = createServiceClient();
  return fetchRatesAsOf(supabase, dateStr);
}

/**
 * Full history for the "Tasa de Cambio" report (RPRT — 2026-09-29 addition):
 * every condo_exchange_rates row from the last `monthsBack` calendar months,
 * fetched once and filtered/aggregated client-side by
 * lib/reporting/exchangeRate.ts's pure helpers — same "fetch a wide window
 * once" trade-off already accepted by the dashboard and monthly report.
 */
export async function getExchangeRateHistory(monthsBack = 12): Promise<ExchangeRateRow[]> {
  const supabase = await createClient();
  const since = subMonths(new Date(), monthsBack).toISOString();
  const { data } = await supabase
    .from('condo_exchange_rates')
    .select(RATE_COLUMNS)
    .gte('updated_at', since)
    .order('updated_at', { ascending: false });
  return (data as ExchangeRateRow[] | null) ?? [];
}

/** Admin manual override — inserts a new row (source: 'admin'), same append-only history the cron uses. */
export async function setExchangeRate(rateType: ExchangeRateType, rate: number, locale: string): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  // 1.000.000 is far above any real Bs/USD rate and keeps the value inside numeric(12,4).
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000) return { error: tc('invalidData') };

  const { error } = await supabase
    .from('condo_exchange_rates')
    .insert({ rate_type: rateType, rate, source: 'admin', updated_by: userId });
  if (error) return { error: await friendlyError(error) };

  // A manual rate can unblock payments/expenses that were parked "en espera de
  // tasa" (service role: the release isn't tied to this admin's session). The
  // rate is already saved, so a failing release is logged, never surfaced as
  // if the rate itself had failed.
  try {
    await releaseHeldTransactions(createServiceClient());
  } catch (err) {
    console.error('[setExchangeRate] releasing held transactions failed:', err);
  }

  revalidatePath('/dashboard');
  return { success: true };
}

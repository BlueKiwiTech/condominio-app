'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';

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

/** Latest row for each rate_type ('bcv', 'binance') — null entries mean no row exists yet at all. */
export async function getLatestExchangeRates(): Promise<Record<ExchangeRateType, ExchangeRateRow | null>> {
  const supabase = await createClient();
  const [{ data: bcv }, { data: binance }] = await Promise.all([
    supabase
      .from('condo_exchange_rates')
      .select('rate_type, rate, source, updated_at')
      .eq('rate_type', 'bcv')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('condo_exchange_rates')
      .select('rate_type, rate, source, updated_at')
      .eq('rate_type', 'binance')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    bcv: (bcv as ExchangeRateRow | null) ?? null,
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
  const cutoff = `${dateStr}T23:59:59.999Z`;
  const [{ data: bcv }, { data: binance }] = await Promise.all([
    supabase
      .from('condo_exchange_rates')
      .select('rate_type, rate, source, updated_at')
      .eq('rate_type', 'bcv')
      .lte('updated_at', cutoff)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('condo_exchange_rates')
      .select('rate_type, rate, source, updated_at')
      .eq('rate_type', 'binance')
      .lte('updated_at', cutoff)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    bcv: (bcv as ExchangeRateRow | null) ?? null,
    binance: (binance as ExchangeRateRow | null) ?? null,
  };
}

/** Admin manual override — inserts a new row (source: 'admin'), same append-only history the cron uses. */
export async function setExchangeRate(rateType: ExchangeRateType, rate: number, locale: string): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  if (!Number.isFinite(rate) || rate <= 0) return { error: tc('invalidData') };

  const { error } = await supabase
    .from('condo_exchange_rates')
    .insert({ rate_type: rateType, rate, source: 'admin', updated_by: userId });
  if (error) return { error: error.message };

  revalidatePath('/dashboard');
  return { success: true };
}

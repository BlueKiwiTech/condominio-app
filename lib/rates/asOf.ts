// "Latest rate of each type as of a calendar date" -- the one query behind
// getExchangeRatesAsOf / getExchangeRatesAsOfForResident
// (lib/actions/exchangeRate.ts) and behind releasing held payments with the
// service role. Deliberately NOT in a 'use server' file: everything exported
// from one of those becomes a callable Server Action, and a variant that runs
// with the service role must never be one.
import type { DbClient } from '@/lib/supabase/dbClient';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';

// Order matters: destructured positionally as [bcv, eur, binance].
export const RATE_TYPES = ['bcv', 'eur', 'binance'] as const satisfies readonly ExchangeRateType[];
// effective_date/source_updated_at are audit-only (change tasa-bcv-calendario); freshness and the as-of cut use updated_at.
export const RATE_COLUMNS = 'rate_type, rate, source, updated_at, effective_date, source_updated_at';

/** Only the client (and therefore the RLS path) differs between callers. */
export async function fetchRatesAsOf(supabase: DbClient, dateStr: string): Promise<Record<ExchangeRateType, ExchangeRateRow | null>> {
  const cutoff = `${dateStr}T23:59:59.999Z`;
  const [{ data: bcv }, { data: eur }, { data: binance }] = await Promise.all(
    RATE_TYPES.map((rateType) =>
      supabase
        .from('condo_exchange_rates')
        .select(RATE_COLUMNS)
        .eq('rate_type', rateType)
        .lte('updated_at', cutoff)
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

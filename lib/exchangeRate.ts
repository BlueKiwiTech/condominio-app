// Shared types/helpers for the USD/Bs reference rates (condo_exchange_rates).
// Pure, no Supabase import — safe to use from both the cron Route Handler
// and admin Server Components/Actions.

export type ExchangeRateType = 'bcv' | 'binance';
export type ExchangeRateSource = 'cron' | 'admin';
export type Currency = 'USD' | 'Bs' | 'USDT';

export type ExchangeRateRow = {
  rate_type: ExchangeRateType;
  rate: number;
  source: ExchangeRateSource;
  updated_at: string;
};

// User decision (2026-09-08): once a rate is more than 24h old, treat it as
// stale and hide the VALUE from any consumer rather than risk showing a
// number nobody can trust anymore -- callers should render an explicit
// "needs updating" state instead of silently falling back to old data.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export function isRateFresh(updatedAt: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(updatedAt).getTime() < STALE_AFTER_MS;
}

// Bs amounts are reference-converted against the official BCV rate; USDT
// ("Binance" in the UI, see lib/currency.ts) against the Binance P2P rate.
// USD needs no conversion -- it's already the reference currency.
export function rateTypeForCurrency(currency: string): ExchangeRateType | null {
  if (currency === 'Bs') return 'bcv';
  if (currency === 'USDT') return 'binance';
  return null;
}

/**
 * Reference-only USD equivalent for a Bs/USDT amount (PLAN.md's "cada quien
 * saca la cuenta" decision -- never auto-converts or gets stored, purely a
 * display hint while entering a payment). Null whenever there's nothing
 * trustworthy to show: no rate row yet, the rate is stale (isRateFresh),
 * or the amount itself isn't a usable positive number.
 */
export function referenceUsdAmount(
  amount: number,
  currency: string,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
): number | null {
  const rateType = rateTypeForCurrency(currency);
  if (!rateType) return null;
  const row = rates[rateType];
  if (!row || !isRateFresh(row.updated_at)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount / row.rate;
}

/**
 * USD-equivalent of `amount` in `currency` using a fresh (<24h relative to
 * `referenceDate`) rate, or null if unavailable/stale. `referenceDate`
 * defaults to "now" (the live-rate case), but callers converting a payment
 * retroactively should pass that payment's own date instead (see
 * lib/payments/allocate.ts's allocateFunds) — a rate is judged fresh or
 * stale relative to WHEN the money was actually received, not relative to
 * whenever the allocation code happens to run.
 */
export function toUsd(
  amount: number,
  currency: Currency,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
  referenceDate: Date = new Date(),
): number | null {
  if (currency === 'USD') return amount;
  const rateType = rateTypeForCurrency(currency);
  if (!rateType) return null;
  const row = rates[rateType];
  if (!row || !isRateFresh(row.updated_at, referenceDate)) return null;
  return amount / row.rate;
}

export function fromUsd(
  usdAmount: number,
  currency: Currency,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
  referenceDate: Date = new Date(),
): number | null {
  if (currency === 'USD') return usdAmount;
  const rateType = rateTypeForCurrency(currency);
  if (!rateType) return null;
  const row = rates[rateType];
  if (!row || !isRateFresh(row.updated_at, referenceDate)) return null;
  return usdAmount * row.rate;
}

/** Converts `amount` from `from` to `to`, pivoting through USD (the system's one reference currency). See toUsd's `referenceDate` note. */
export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
  referenceDate: Date = new Date(),
): number | null {
  if (from === to) return amount;
  const usd = toUsd(amount, from, rates, referenceDate);
  if (usd === null) return null;
  return fromUsd(usd, to, rates, referenceDate);
}

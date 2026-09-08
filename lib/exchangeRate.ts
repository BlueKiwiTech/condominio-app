// Shared types/helpers for the USD/Bs reference rates (condo_exchange_rates).
// Pure, no Supabase import — safe to use from both the cron Route Handler
// and admin Server Components/Actions.

export type ExchangeRateType = 'bcv' | 'binance';
export type ExchangeRateSource = 'cron' | 'admin';

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

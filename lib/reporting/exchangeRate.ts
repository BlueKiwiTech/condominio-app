// Tasa de Cambio report — pure helpers building on condo_exchange_rates'
// append-only history (lib/exchangeRate.ts's ExchangeRateRow). Mirrors the
// same "fetch a wide window once, filter/aggregate client-side" split used by
// lib/reporting/dashboard.ts and lib/reporting/monthlyReport.ts.
import { endOfMonth, format, isWithinInterval, parseISO, startOfMonth } from 'date-fns';
import type { ExchangeRateRow, ExchangeRateType } from '@/lib/exchangeRate';

export type ExchangeRateSeriesPoint = { date: string; label: string } & Partial<Record<ExchangeRateType, number>>;

export function exchangeRatesInMonth(rows: ExchangeRateRow[], monthDate: Date): ExchangeRateRow[] {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return rows.filter((r) => isWithinInterval(parseISO(r.updated_at), { start, end }));
}

// One point per calendar day that has at least one rate update, each type
// pinned to that day's LAST value (multiple cron/admin updates can land on
// the same day) — combined single-axis line chart (2026-09-29 user decision:
// BCV and Binance are both Bs-per-USD, similar order of magnitude, so unlike
// the dashboard's per-currency income charts a shared axis doesn't flatten
// either line).
export function exchangeRateSeriesForMonth(rows: ExchangeRateRow[], monthDate: Date): ExchangeRateSeriesPoint[] {
  const inMonth = exchangeRatesInMonth(rows, monthDate);
  const byDay = new Map<string, ExchangeRateSeriesPoint>();
  for (const row of [...inMonth].sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
    const dayKey = format(parseISO(row.updated_at), 'yyyy-MM-dd');
    const point = byDay.get(dayKey) ?? { date: dayKey, label: format(parseISO(row.updated_at), 'dd/MM') };
    point[row.rate_type] = row.rate;
    byDay.set(dayKey, point);
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Raw rows for the month, most recent first — the table below the chart.
export function exchangeRateRowsForMonth(rows: ExchangeRateRow[], monthDate: Date): ExchangeRateRow[] {
  return exchangeRatesInMonth(rows, monthDate).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

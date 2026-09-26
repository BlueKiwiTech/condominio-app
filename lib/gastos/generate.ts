// Pure date/amount math for gasto (expense) generation — no Supabase calls,
// no next/* imports. Mirrors lib/cuotas/generate.ts's split (pure lib/*, DB
// writes happen in lib/actions/gastos.ts and app/api/cron/generate-expenses)
// so both the create-form's live preview and the actual writers build
// identical rows from the same functions.
import { addWeeks, addMonths } from 'date-fns';
import { splitAmount, toDateOnly, parseDateOnly, computeHorizonEnd } from '@/lib/cuotas/generate';

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type Currency = 'USD' | 'Bs' | 'USDT';

export { splitAmount, toDateOnly, parseDateOnly, computeHorizonEnd };

// Next occurrence of a fixed expense's cadence, from its last generated
// period_date (or start_date if none exist yet — see the cron in
// app/api/cron/generate-expenses/route.ts). Unlike cuotas' recurring
// monthly/annual rule, this does NOT force day-of-month to 1 — a fixed
// gasto's period_date is meant to track an actual vendor billing cycle
// (e.g. internet due the 15th of every month), so the admin's chosen
// start_date's day-of-month is preserved.
export function computeNextPeriodDate(cadence: Cadence, lastPeriodDate: Date): Date {
  switch (cadence) {
    case 'weekly':
      return addWeeks(lastPeriodDate, 1);
    case 'biweekly':
      return addWeeks(lastPeriodDate, 2);
    case 'monthly':
      return addMonths(lastPeriodDate, 1);
    case 'quarterly':
      return addMonths(lastPeriodDate, 3);
    case 'annual':
      return addMonths(lastPeriodDate, 12);
  }
}

// Staggered per the admin-chosen cadence, preserving day-of-month/weekday —
// same offset-from-startDate shape as lib/cuotas/generate.ts's
// 'special-divided' branch of computeDueDates (a variable gasto's
// installments are conceptually the same: "this total, split into N dated
// installments"). Computed directly from startDate (never chained
// period-to-period) so a day-31 start doesn't drift after a short month
// clamps it — same reasoning as computeDueDates.
export function computeVariablePeriodDates(startDate: Date, count: number, cadence: Cadence): Date[] {
  return Array.from({ length: count }, (_, n) => {
    switch (cadence) {
      case 'weekly':
        return addWeeks(startDate, n);
      case 'biweekly':
        return addWeeks(startDate, n * 2);
      case 'monthly':
        return addMonths(startDate, n);
      case 'quarterly':
        return addMonths(startDate, n * 3);
      case 'annual':
        return addMonths(startDate, n * 12);
    }
  });
}

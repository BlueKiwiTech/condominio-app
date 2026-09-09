// Pure date/amount math for gasto (expense) generation — no Supabase calls,
// no next/* imports. Mirrors lib/cuotas/generate.ts's split (pure lib/*, DB
// writes happen in lib/actions/gastos.ts and app/api/cron/generate-expenses)
// so both the create-form's live preview and the actual writers build
// identical rows from the same functions.
import { addWeeks, addMonths } from 'date-fns';
import { splitAmount, toDateOnly, parseDateOnly } from '@/lib/cuotas/generate';

export type Cadence = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
export type Currency = 'USD' | 'Bs' | 'USDT';

export { splitAmount, toDateOnly, parseDateOnly };

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

// Staggered one calendar month apart, preserving day-of-month — identical
// rule to special-divided cuotas (lib/cuotas/generate.ts's 'special-divided'
// branch of computeDueDates), since a variable gasto's installments are
// conceptually the same shape ("this total, split into N dated installments").
export function computeVariablePeriodDates(startDate: Date, count: number): Date[] {
  return Array.from({ length: count }, (_, n) => addMonths(startDate, n));
}

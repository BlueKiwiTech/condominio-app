// Shared calendar-day-safe month math for Phase 6's reporting screens
// (dashboard KPIs, monthly report) — RPRT-05's requirement, reusing the same
// date-fns approach already established in lib/cuotas/generate.ts and
// lib/cuotas/status.ts (never raw UTC string splitting).
import { differenceInCalendarDays, endOfMonth, format, startOfMonth } from 'date-fns';

export function monthRange(monthDate: Date): { start: Date; end: Date } {
  return { start: startOfMonth(monthDate), end: endOfMonth(monthDate) };
}

export function daysToCloseOfMonth(today: Date = new Date()): number {
  return differenceInCalendarDays(endOfMonth(today), today);
}

export function monthKey(date: Date): string {
  return format(date, 'yyyy-MM');
}

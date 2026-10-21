// Locale-ordered numeric date display -- dd/MM/yyyy (es) vs MM/dd/yyyy (en).
// A date-fns locale object (es/enUS from 'date-fns/locale') only affects
// things like month names ('MMMM'); it does NOT reorder a literal pattern
// string like 'dd/MM/yyyy', so every numeric-date display in the app needs
// its pattern picked by locale explicitly, not just a locale object passed
// to format().
import { format, parseISO } from 'date-fns';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A calendar day ("2026-10-20", as stored in `date` columns) is read as that day in
 * local time. `new Date("2026-10-20")` would be UTC midnight and, west of UTC,
 * display as the day BEFORE (QA round 1: dates one day early). Anything else (a
 * timestamp with time) goes through `new Date` as before.
 */
function toDate(date: Date | string): Date {
  if (typeof date !== 'string') return date;
  return DATE_ONLY.test(date) ? parseISO(date) : new Date(date);
}

export function formatShortDate(date: Date | string, locale: string): string {
  return format(toDate(date), locale === 'en' ? 'MM/dd/yyyy' : 'dd/MM/yyyy');
}

export function formatShortDateTime(date: Date | string, locale: string): string {
  return format(toDate(date), locale === 'en' ? 'MM/dd HH:mm' : 'dd/MM HH:mm');
}

// Same fix as above but for a full date + time (with year) display.
export function formatDateTime(date: Date | string, locale: string): string {
  return format(toDate(date), locale === 'en' ? 'MM/dd/yyyy HH:mm' : 'dd/MM/yyyy HH:mm');
}

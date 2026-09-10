// Locale-ordered numeric date display -- dd/MM/yyyy (es) vs MM/dd/yyyy (en).
// A date-fns locale object (es/enUS from 'date-fns/locale') only affects
// things like month names ('MMMM'); it does NOT reorder a literal pattern
// string like 'dd/MM/yyyy', so every numeric-date display in the app needs
// its pattern picked by locale explicitly, not just a locale object passed
// to format().
import { format } from 'date-fns';

export function formatShortDate(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, locale === 'en' ? 'MM/dd/yyyy' : 'dd/MM/yyyy');
}

export function formatShortDateTime(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, locale === 'en' ? 'MM/dd HH:mm' : 'dd/MM HH:mm');
}

// Same fix as above but for a full date + time (with year) display.
export function formatDateTime(date: Date | string, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, locale === 'en' ? 'MM/dd/yyyy HH:mm' : 'dd/MM/yyyy HH:mm');
}

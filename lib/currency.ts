// Display-only currency labels (user request, 2026-09-08). The underlying
// values stored in the database and used throughout validation/business
// logic ('USD' | 'Bs' | 'USDT') are UNCHANGED -- changing those would mean
// a data migration across every table with existing rows for no real
// benefit. This is purely how they're presented to admins and residents,
// matching how the community actually refers to each payment channel
// (cash dollars, bolívares, USDT sent via Binance).
type CurrencyCode = 'USD' | 'Bs' | 'USDT';

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  USD: '$ Efectivo',
  Bs: 'Bs.',
  USDT: 'Binance',
};

export function currencyLabel(code: string): string {
  return (CURRENCY_LABELS as Record<string, string>)[code] ?? code;
}

export const CURRENCY_SELECT_OPTIONS: { label: string; value: CurrencyCode }[] = (
  Object.keys(CURRENCY_LABELS) as CurrencyCode[]
).map((value) => ({ label: CURRENCY_LABELS[value], value }));

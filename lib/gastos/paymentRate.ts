// Rate chosen when paying an expense in Bs (change gastos-pago-multimoneda).
// Pure, no Supabase import -- shared by the pay dialog (live preview) and
// markExpensePaid (what actually gets stored), so both always agree.

export type ExpensePaymentRateType = 'bcv' | 'eur' | 'binance' | 'custom';
export type ExpenseReferenceCurrency = 'USD' | 'EUR' | 'USDT';

export const EXPENSE_PAYMENT_RATE_TYPES: ExpensePaymentRateType[] = ['bcv', 'eur', 'binance', 'custom'];

// The rates are "Bs per unit", so the equivalent is expressed in the unit of
// the rate that was picked -- no cross rate needed to turn euros or USDT into
// dollars. A custom rate is read as Bs per USD.
export function referenceCurrencyFor(type: ExpensePaymentRateType): ExpenseReferenceCurrency {
  switch (type) {
    case 'eur':
      return 'EUR';
    case 'binance':
      return 'USDT';
    default:
      return 'USD';
  }
}

/** `amount / rate` rounded to 2 decimals (half up on integer cents), or null when either input isn't usable. */
export function referenceAmount(amount: number, rate: number): number | null {
  if (!Number.isFinite(amount) || !Number.isFinite(rate) || amount <= 0 || rate <= 0) return null;
  return Math.round((amount / rate) * 100 + 1e-9) / 100;
}

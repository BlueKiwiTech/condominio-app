// Payment currency and rate when paying an expense (change
// gastos-pago-multimoneda). Pure, no Supabase import -- shared by the pay
// dialog (live preview) and markExpensePaid (what actually gets stored), so
// both always agree.

export type ExpensePaymentRateType = 'bcv' | 'eur' | 'custom';
export type ExpenseReferenceCurrency = 'USD' | 'EUR';
// What an expense can be paid in. USDT expenses are paid in USDT, untouched.
export type ExpensePaymentCurrency = 'USD' | 'Bs';

export const EXPENSE_PAYMENT_RATE_TYPES: ExpensePaymentRateType[] = ['bcv', 'eur', 'custom'];
export const EXPENSE_PAYMENT_CURRENCIES: ExpensePaymentCurrency[] = ['USD', 'Bs'];

// `x` rounded to 2 decimals, half up. The toPrecision(15) trims float noise
// (110 * 991.1645 * 100 is 10902809.499999998, not ...809.5) so exact halves
// round the way a person doing the sum by hand expects.
function roundTo2(x: number): number {
  return Math.round(Number((x * 100).toPrecision(15))) / 100;
}

function isUsable(amount: number, rate: number): boolean {
  return Number.isFinite(amount) && Number.isFinite(rate) && amount > 0 && rate > 0;
}

// The rates are "Bs per unit", so the equivalent of a Bs amount is expressed
// in the unit of the rate that was picked -- no cross rate needed to turn
// euros into dollars. A custom rate is read as Bs per USD.
export function referenceCurrencyFor(type: ExpensePaymentRateType): ExpenseReferenceCurrency {
  return type === 'eur' ? 'EUR' : 'USD';
}

/** `amount / rate` rounded to 2 decimals (half up), or null when either input isn't usable. */
export function referenceAmount(amount: number, rate: number): number | null {
  if (!isUsable(amount, rate)) return null;
  return roundTo2(amount / rate);
}

/**
 * What an expense's `amount` comes to in the payment currency. The chosen rate
 * is only the multiplier between the two currencies: USD -> Bs multiplies
 * ("a tasa euro" is just using the euro rate on a dollar amount), Bs -> USD
 * divides. Same currency returns the amount as is. Null when an input isn't
 * usable.
 */
export function convertExpenseAmount(
  amount: number,
  from: ExpensePaymentCurrency,
  to: ExpensePaymentCurrency,
  rate: number,
): number | null {
  if (from === to) return Number.isFinite(amount) && amount > 0 ? roundTo2(amount) : null;
  if (!isUsable(amount, rate)) return null;
  return from === 'USD' ? roundTo2(amount * rate) : roundTo2(amount / rate);
}

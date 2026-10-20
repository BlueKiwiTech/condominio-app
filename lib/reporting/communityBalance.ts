// Pure helpers around the community balance (change saldo-comunidad-libro). The
// balance itself is no longer computed here: it is stored per currency in
// condo_community_balances and only moves through the SQL functions that also
// write the ledger (see lib/reporting/communityBalanceQuery.ts for reading it).
// What stays here is what both the server action and the payment dialog need:
// how much an expense takes out of the till, and whether the balance covers it.
// Never summed or converted across currencies.
import type { Currency, CurrencyAmountMap } from './dashboard';

export type ExpenseCashFields = {
  currency: Currency;
  amount: number;
  paid_currency: 'USD' | 'Bs' | null;
  paid_amount: number | null;
};

/** What leaves the till when an expense is paid: how much, and in which currency. */
export type CashOut = { currency: Currency; amount: number };

export type BalanceCheck = {
  ok: boolean;
  currency: Currency;
  /** Available balance in the currency (can be negative). */
  available: number;
  needed: number;
  /** How much is missing; 0 when ok. */
  missing: number;
};

// Integer cents so comparing never drifts (same idea as lib/payments/allocate.ts).
const toCents = (amount: number): number => Math.round(Number((amount * 100).toPrecision(15)));
const fromCents = (cents: number): number => cents / 100;

/**
 * The money an expense payment takes out of the till, in the currency it was
 * actually paid in: paid_currency/paid_amount when the payment currency
 * differed from the expense's, otherwise the expense's own currency and final
 * amount (USDT included).
 */
export function expenseCashOut(expense: ExpenseCashFields): CashOut {
  if (expense.paid_currency !== null && expense.paid_amount !== null) {
    return { currency: expense.paid_currency, amount: expense.paid_amount };
  }
  return { currency: expense.currency, amount: expense.amount };
}

/** Can the community cover `cashOut` with its balance in that currency? Compared in cents. */
export function checkBalance(balance: CurrencyAmountMap, cashOut: CashOut): BalanceCheck {
  const availableCents = toCents(balance[cashOut.currency] ?? 0);
  const neededCents = toCents(cashOut.amount);
  const missingCents = Math.max(0, neededCents - availableCents);
  return {
    ok: missingCents === 0,
    currency: cashOut.currency,
    available: fromCents(availableCents),
    needed: fromCents(neededCents),
    missing: fromCents(missingCents),
  };
}

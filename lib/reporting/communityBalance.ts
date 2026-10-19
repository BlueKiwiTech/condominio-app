// "Saldo de la comunidad" (change saldo-comunidad-gastos): how much money the
// community has available, per currency, as received minus spent. Pure, no
// Supabase calls -- same "pure lib/*, fetch elsewhere" split as
// lib/reporting/dashboard.ts. Never summed or converted across currencies.
//
// Why this is NOT just the sum of condo_payments.amount_paid:
//  - each payment row is in the CUOTA's currency, while the money may have
//    arrived in another one (funding_breakdown says which, and how much);
//  - the leftover of a payment is written as an extra row with a null
//    installment_id AND added to the house's credit (saldo a favor), so
//    counting the row and the credit would count it twice;
//  - a payment can spend credit that was already counted when it arrived.
// Money received always ends up in one of two places -- applied to a cuota or
// waiting as credit -- so:
//     received[C] = (applied to cuotas, funded in C) + (house credits in C)
// where "applied" skips the null-installment deposit rows (that money is the
// credit) and, for a cross-currency row, uses funding_breakdown's own
// currency/amountDrawn instead of the cuota's.
import type { Currency, CurrencyAmountMap } from './dashboard';

export type FundingEntryForBalance = { currency: Currency; amountDrawn: number };

export type PaymentForBalance = {
  installment_id: string | null;
  amount_paid: number;
  currency: Currency;
  funding_breakdown: FundingEntryForBalance[] | null;
};

export type CreditForBalance = { currency: Currency; balance: number };

export type ExpenseForBalance = {
  status: 'pending' | 'on_hold' | 'paid';
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

// Integer cents so adding many rows never drifts (same idea as lib/payments/allocate.ts).
const toCents = (amount: number): number => Math.round(Number((amount * 100).toPrecision(15)));
const fromCents = (cents: number): number => cents / 100;
const isMoney = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

type CentsByCurrency = Partial<Record<Currency, number>>;
function add(map: CentsByCurrency, currency: Currency, cents: number) {
  map[currency] = (map[currency] ?? 0) + cents;
}

/**
 * The money an expense payment takes out of the till, in the currency it was
 * actually paid in: paid_currency/paid_amount when the payment currency
 * differed from the expense's, otherwise the expense's own currency and final
 * amount (USDT included).
 */
export function expenseCashOut(expense: Pick<ExpenseForBalance, 'currency' | 'amount' | 'paid_currency' | 'paid_amount'>): CashOut {
  if (expense.paid_currency !== null && expense.paid_amount !== null) {
    return { currency: expense.paid_currency, amount: expense.paid_amount };
  }
  return { currency: expense.currency, amount: expense.amount };
}

/** Money actually received per currency (see the formula at the top of the file). */
export function receivedByCurrency(payments: PaymentForBalance[], credits: CreditForBalance[]): CurrencyAmountMap {
  const cents: CentsByCurrency = {};
  for (const p of payments) {
    if (p.installment_id === null) continue; // deposit of the leftover: it is the credit, counted below
    const entries = p.funding_breakdown ?? [];
    if (entries.length > 0) {
      for (const f of entries) {
        if (isMoney(f.amountDrawn)) add(cents, f.currency, toCents(f.amountDrawn));
      }
    } else if (isMoney(p.amount_paid)) {
      add(cents, p.currency, toCents(p.amount_paid));
    }
  }
  for (const c of credits) {
    if (isMoney(c.balance)) add(cents, c.currency, toCents(c.balance));
  }
  return Object.fromEntries(Object.entries(cents).map(([k, v]) => [k, fromCents(v as number)])) as CurrencyAmountMap;
}

/** Money paid out for expenses per currency. An expense waiting for its rate (on_hold) is already paid. */
export function spentByCurrency(expenses: ExpenseForBalance[]): CurrencyAmountMap {
  const cents: CentsByCurrency = {};
  for (const e of expenses) {
    if (e.status !== 'paid' && e.status !== 'on_hold') continue;
    const out = expenseCashOut(e);
    if (isMoney(out.amount)) add(cents, out.currency, toCents(out.amount));
  }
  return Object.fromEntries(Object.entries(cents).map(([k, v]) => [k, fromCents(v as number)])) as CurrencyAmountMap;
}

/**
 * Community balance per currency: received minus spent, no opening balance.
 * Only currencies with some movement appear; the result can be negative.
 */
export function communityBalance(
  payments: PaymentForBalance[],
  credits: CreditForBalance[],
  expenses: ExpenseForBalance[],
): CurrencyAmountMap {
  const received = receivedByCurrency(payments, credits);
  const spent = spentByCurrency(expenses);
  const currencies = new Set<Currency>([...(Object.keys(received) as Currency[]), ...(Object.keys(spent) as Currency[])]);
  const out: CurrencyAmountMap = {};
  for (const c of currencies) {
    out[c] = fromCents(toCents(received[c] ?? 0) - toCents(spent[c] ?? 0));
  }
  return out;
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

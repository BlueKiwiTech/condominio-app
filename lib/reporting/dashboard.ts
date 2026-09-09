// A2 dashboard KPI math — pure functions, no Supabase calls (same "pure
// lib/*, fetch in the Server Component" split already established by
// lib/cuotas/generate.ts and lib/payments/allocate.ts). Every aggregate here
// is per-currency (RPRT-03) — never a single summed number across USD/Bs/USDT.
import { endOfMonth, isWithinInterval, parseISO, startOfMonth, subMonths, format } from 'date-fns';
import type { InstallmentStatus } from '@/lib/cuotas/status';

export type Currency = 'USD' | 'Bs' | 'USDT';
export type CurrencyAmountMap = Partial<Record<Currency, number>>;

export type PaymentForReport = {
  amount_paid: number;
  currency: Currency;
  payment_date: string;
};

export type InstallmentForOutstanding = {
  status: InstallmentStatus;
  amount: number;
  amount_paid: number;
  currency: Currency;
};

export type CreditForReport = {
  currency: Currency;
  balance: number;
};

function sumByCurrency<T extends { currency: Currency }>(rows: T[], amountOf: (r: T) => number): CurrencyAmountMap {
  const out: CurrencyAmountMap = {};
  for (const r of rows) {
    out[r.currency] = (out[r.currency] ?? 0) + amountOf(r);
  }
  return out;
}

// PLAN.md Phase 6 decision: "Total collected this month" is cash-basis, keyed
// off payment_date falling in the selected month — NOT the installment's own
// due date/month. A late payment for an old cuota counts toward the month it
// was actually paid.
export function collectedInMonth(payments: PaymentForReport[], monthDate: Date): CurrencyAmountMap {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const inMonth = payments.filter((p) => isWithinInterval(parseISO(p.payment_date), { start, end }));
  return sumByCurrency(inMonth, (p) => p.amount_paid);
}

/** null = "n/a" (can't express a meaningful % change from a zero base). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

// "Saldo pendiente": every non-paid installment's remaining balance
// (amount - amount_paid), regardless of whether it's overdue yet — this is
// the total still owed, distinct from the morosos-only (grace-period-gated)
// figure in lib/reporting/morosos.ts.
export function outstandingByCurrency(installments: InstallmentForOutstanding[]): CurrencyAmountMap {
  const unpaid = installments.filter((i) => i.status !== 'paid');
  return sumByCurrency(unpaid, (i) => i.amount - i.amount_paid);
}

export function creditsByCurrency(credits: CreditForReport[]): CurrencyAmountMap {
  const positive = credits.filter((c) => c.balance > 0);
  return sumByCurrency(positive, (c) => c.balance);
}

export type ExpenseForReport = {
  currency: Currency;
  amount: number;
  period_date: string;
  status: 'pending' | 'paid';
};

// "Gastos pendientes del mes": pending condo_expenses whose period_date
// falls in the given month — same cash/period-window shape as
// collectedInMonth, kept as its own function since income and outgoing
// expenses are conceptually different flows even though the per-currency
// math is identical.
export function pendingExpensesInMonth(expenses: ExpenseForReport[], monthDate: Date): CurrencyAmountMap {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const pendingInMonth = expenses.filter(
    (e) => e.status === 'pending' && isWithinInterval(parseISO(e.period_date), { start, end }),
  );
  return sumByCurrency(pendingInMonth, (e) => e.amount);
}

export type MonthlySeriesPoint = { month: string; label: string } & CurrencyAmountMap;

// 6-month per-currency income chart data. Each point carries one key per
// currency present (e.g. { month, label, USD: 120, Bs: 4500 }) — the caller
// renders one chart (or series) PER CURRENCY, never a combined/summed line
// (RPRT-03), matching the mockup's "3 separate scales" note.
export function monthlyIncomeSeries(payments: PaymentForReport[], monthsBack: number, today: Date = new Date()): MonthlySeriesPoint[] {
  const points: MonthlySeriesPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthDate = subMonths(today, i);
    const byCurrency = collectedInMonth(payments, monthDate);
    points.push({ month: format(monthDate, 'yyyy-MM'), label: format(monthDate, 'MMM'), ...byCurrency });
  }
  return points;
}

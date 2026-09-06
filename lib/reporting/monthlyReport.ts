// A6 · Reporte mensual (RPRT-04): expected vs. paid vs. balance vs. status,
// per house, per currency, for a single selected month — plus a
// per-currency totals row (RPRT-03: never a cross-currency sum). "Overdue"
// is computed live via lib/cuotas/status.ts's isOverdue, never stored.
import { endOfMonth, isWithinInterval, parseISO, startOfMonth } from 'date-fns';
import { isOverdue, type InstallmentStatus } from '@/lib/cuotas/status';

export type Currency = 'USD' | 'Bs' | 'USDT';

export type ReportInstallment = {
  house_id: string;
  amount: number;
  amount_paid: number;
  currency: Currency;
  due_date: string;
  status: InstallmentStatus;
};

export type HouseInfo = {
  id: string;
  house_number: string;
  house_name: string | null;
};

export type CreditForReport = {
  house_id: string;
  currency: Currency;
  balance: number;
};

export type MonthlyReportStatus = 'pending' | 'partial' | 'paid' | 'overdue';

export type MonthlyReportRow = {
  house_id: string;
  house_number: string;
  house_name: string | null;
  currency: Currency;
  expected: number;
  paid: number;
  pending: number;
  favor: number;
  status: MonthlyReportStatus;
};

export function buildMonthlyReport(
  installments: ReportInstallment[],
  houses: HouseInfo[],
  credits: CreditForReport[],
  monthDate: Date,
  today: Date = new Date(),
): MonthlyReportRow[] {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const inMonth = installments.filter((i) => isWithinInterval(parseISO(i.due_date), { start, end }));

  const houseById = new Map(houses.map((h) => [h.id, h]));
  const creditByKey = new Map(credits.map((c) => [`${c.house_id}::${c.currency}`, c.balance]));

  type Group = { expected: number; paid: number; hasOverdue: boolean; hasPartial: boolean; allPaid: boolean };
  const groups = new Map<string, Group>();

  for (const inst of inMonth) {
    const key = `${inst.house_id}::${inst.currency}`;
    const g = groups.get(key) ?? { expected: 0, paid: 0, hasOverdue: false, hasPartial: false, allPaid: true };
    g.expected += inst.amount;
    g.paid += inst.amount_paid;
    if (inst.status !== 'paid') g.allPaid = false;
    if (inst.status === 'partial') g.hasPartial = true;
    if (isOverdue(inst.due_date, inst.status, today)) g.hasOverdue = true;
    groups.set(key, g);
  }

  const rows: MonthlyReportRow[] = [];
  for (const [key, g] of groups) {
    const [houseId, currency] = key.split('::') as [string, Currency];
    const house = houseById.get(houseId);
    let status: MonthlyReportStatus = 'pending';
    if (g.allPaid) status = 'paid';
    else if (g.hasOverdue) status = 'overdue';
    else if (g.hasPartial) status = 'partial';

    rows.push({
      house_id: houseId,
      house_number: house?.house_number ?? '—',
      house_name: house?.house_name ?? null,
      currency,
      expected: g.expected,
      paid: g.paid,
      pending: g.expected - g.paid,
      favor: creditByKey.get(key) ?? 0,
      status,
    });
  }

  return rows.sort((a, b) => a.house_number.localeCompare(b.house_number));
}

export type ReportTotals = {
  currency: Currency;
  expected: number;
  paid: number;
  pending: number;
  favor: number;
};

/** Per-currency footer totals — never combined across currencies (RPRT-03). */
export function reportTotalsByCurrency(rows: MonthlyReportRow[]): ReportTotals[] {
  const byCurrency = new Map<Currency, ReportTotals>();
  for (const row of rows) {
    const totals = byCurrency.get(row.currency) ?? { currency: row.currency, expected: 0, paid: 0, pending: 0, favor: 0 };
    totals.expected += row.expected;
    totals.paid += row.paid;
    totals.pending += row.pending;
    totals.favor += row.favor;
    byCurrency.set(row.currency, totals);
  }
  return Array.from(byCurrency.values());
}

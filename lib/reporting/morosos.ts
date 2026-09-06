// RPRT-02/RPRT-03: morosos (delinquent accounts) list — live-computed from
// condo_installments, NEVER a stored flag (CLAUDE.md/PLAN.md anti-pattern
// rule: "overdue" is always `due_date < today AND status != 'paid'` at query
// time). Grouped per house PER CURRENCY — USD/Bs/USDT are never summed
// together (RPRT-03), so one house can appear as a separate row per currency
// it owes in.
//
// Grace period (PLAN.md Phase 6 decision): a configurable
// `condo_communities.grace_period_days` setting, not a hardcoded constant —
// an installment only counts toward "moroso" once it's overdue by MORE than
// the grace period, not the instant it's a day late.
import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { InstallmentStatus } from '@/lib/cuotas/status';

export type Currency = 'USD' | 'Bs' | 'USDT';

export type InstallmentForMorosos = {
  house_id: string;
  due_date: string;
  status: InstallmentStatus;
  amount: number;
  amount_paid: number;
  currency: Currency;
};

export type HouseInfo = {
  id: string;
  house_number: string;
  house_name: string | null;
  owner_name: string | null;
};

export type MorosoRow = {
  house_id: string;
  house_number: string;
  house_name: string | null;
  owner_name: string | null;
  currency: Currency;
  owed: number;
  owedSince: string;
  daysOverdue: number;
};

export function computeMorosos(
  installments: InstallmentForMorosos[],
  houses: HouseInfo[],
  gracePeriodDays: number,
  today: Date = new Date(),
): MorosoRow[] {
  const houseById = new Map(houses.map((h) => [h.id, h]));
  const groups = new Map<string, { houseId: string; currency: Currency; owed: number; earliestDue: string }>();

  for (const inst of installments) {
    if (inst.status === 'paid') continue;
    const daysPastDue = differenceInCalendarDays(today, parseISO(inst.due_date));
    if (daysPastDue <= gracePeriodDays) continue;

    const owedAmount = inst.amount - inst.amount_paid;
    if (owedAmount <= 0) continue;

    const key = `${inst.house_id}::${inst.currency}`;
    const existing = groups.get(key);
    if (existing) {
      existing.owed += owedAmount;
      if (inst.due_date < existing.earliestDue) existing.earliestDue = inst.due_date;
    } else {
      groups.set(key, { houseId: inst.house_id, currency: inst.currency, owed: owedAmount, earliestDue: inst.due_date });
    }
  }

  const rows: MorosoRow[] = [];
  for (const g of groups.values()) {
    const house = houseById.get(g.houseId);
    rows.push({
      house_id: g.houseId,
      house_number: house?.house_number ?? '—',
      house_name: house?.house_name ?? null,
      owner_name: house?.owner_name ?? null,
      currency: g.currency,
      owed: g.owed,
      owedSince: g.earliestDue,
      daysOverdue: differenceInCalendarDays(today, parseISO(g.earliestDue)),
    });
  }
  return rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function countDelinquentHouses(rows: MorosoRow[]): number {
  return new Set(rows.map((r) => r.house_id)).size;
}

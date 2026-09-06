// "Overdue" is NEVER stored — always computed at query time (CLAUDE.md /
// PLAN.md anti-pattern list). This is the shared computation used by both
// the cuotas list page (CUOT-07: status pending/paid/overdue) and, later,
// Phase 6's morosos/reporting screens. Calendar-day-safe (date-fns).
import { differenceInCalendarDays, parseISO } from 'date-fns';

export type InstallmentStatus = 'pending' | 'paid' | 'advance';

export function isOverdue(dueDate: string, status: InstallmentStatus, today: Date = new Date()): boolean {
  if (status === 'paid') return false;
  return differenceInCalendarDays(today, parseISO(dueDate)) > 0;
}

export type InstallmentSummaryRow = {
  status: InstallmentStatus;
  due_date: string;
  amount: number;
  house_id: string;
};

export type TemplateStatusSummary = {
  totalInstallments: number;
  paidCount: number;
  overdueCount: number;
  pendingCount: number;
  housesCount: number;
  // Safe to sum: currency is uniform per template (one `currency` column),
  // never crosses USD/Bs/USDT (RPRT-03's per-currency rule, applied here too).
  totalAmount: number;
};

export function summarizeTemplate(installments: InstallmentSummaryRow[], today: Date = new Date()): TemplateStatusSummary {
  const houseIds = new Set(installments.map((i) => i.house_id));
  let paidCount = 0;
  let overdueCount = 0;
  let totalAmount = 0;
  for (const inst of installments) {
    totalAmount += inst.amount;
    if (inst.status === 'paid') paidCount += 1;
    else if (isOverdue(inst.due_date, inst.status, today)) overdueCount += 1;
  }
  return {
    totalInstallments: installments.length,
    paidCount,
    overdueCount,
    pendingCount: installments.length - paidCount - overdueCount,
    housesCount: houseIds.size,
    totalAmount,
  };
}

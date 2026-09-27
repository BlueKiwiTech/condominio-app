// "Overdue" is NEVER stored — always computed at query time (CLAUDE.md /
// PLAN.md anti-pattern list). This is the shared computation used by both
// the cuotas list page (CUOT-07: status pending/paid/overdue) and, later,
// Phase 6's morosos/reporting screens. Calendar-day-safe (date-fns).
import { differenceInCalendarDays, endOfMonth, format, parseISO } from 'date-fns';

// 'partial' added in Phase 5 (PMNT-06: registering a payment updates cuota
// status to pending/partial/paid) — see the migration comment in
// 20260906140000_phase5_payments.sql for why this extends, rather than
// replaces, Phase 1's original ('pending', 'paid', 'advance') set.
export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'advance';

export function isOverdue(
  dueDate: string,
  status: InstallmentStatus,
  graceDays: number = 0,
  today: Date = new Date(),
): boolean {
  if (status === 'paid') return false;
  return differenceInCalendarDays(today, parseISO(dueDate)) > graceDays;
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
  partialCount: number;
  overdueCount: number;
  pendingCount: number;
  housesCount: number;
  // Safe to sum: currency is uniform per template (one `currency` column),
  // never crosses USD/Bs/USDT (RPRT-03's per-currency rule, applied here too).
  totalAmount: number;
};

/**
 * Cuotas due in some future month beyond the current one (e.g. the
 * recurring-horizon generator pre-creating up to ~6 months of installments
 * at once) aren't real debt yet — "vencida" or "del mes actual" only
 * (2026-09-27 decision: summing every horizon-generated future installment
 * into the admin cuotas list total made a brand-new template's total jump
 * immediately by however many months the horizon happened to cover).
 */
function isDueByCurrentMonthEnd(dueDate: string, today: Date): boolean {
  return dueDate <= format(endOfMonth(today), 'yyyy-MM-dd');
}

export function summarizeTemplate(
  installments: InstallmentSummaryRow[],
  graceDays: number = 0,
  today: Date = new Date(),
): TemplateStatusSummary {
  const relevant = installments.filter((i) => isDueByCurrentMonthEnd(i.due_date, today));
  const houseIds = new Set(relevant.map((i) => i.house_id));
  let paidCount = 0;
  let partialCount = 0;
  let overdueCount = 0;
  for (const inst of relevant) {
    if (inst.status === 'paid') {
      paidCount += 1;
    } else if (isOverdue(inst.due_date, inst.status, graceDays, today)) {
      overdueCount += 1;
    } else if (inst.status === 'partial') {
      partialCount += 1;
    }
  }
  const totalAmount = relevant.reduce((sum, inst) => sum + inst.amount, 0);
  return {
    totalInstallments: relevant.length,
    paidCount,
    partialCount,
    overdueCount,
    pendingCount: relevant.length - paidCount - partialCount - overdueCount,
    housesCount: houseIds.size,
    totalAmount,
  };
}

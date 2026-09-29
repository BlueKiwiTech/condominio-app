// "Overdue" is NEVER stored — always computed at query time (CLAUDE.md /
// PLAN.md anti-pattern list). This is the shared computation used by both
// the cuotas list page (CUOT-07: status pending/paid/overdue) and, later,
// Phase 6's morosos/reporting screens. Calendar-day-safe (date-fns).
import { differenceInCalendarDays, format, parseISO, startOfMonth } from 'date-fns';

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
 * A recurring template is open-ended and pre-generates several periods'
 * worth of installments at once (the horizon generator) -- "Monto total a
 * recaudar"/"Casas" show ONE PERIOD's worth (2026-09-29 decision), not a
 * sum across every period ever generated, since a recurring cuota has no
 * single "total" the way a special/finite one does.
 *
 * The period shown is: the earliest one due this month or later (the
 * current/next upcoming collection), so a brand-new template whose first
 * period hasn't started yet still shows its real per-period figures instead
 * of a bare 0. If every period is already in the past (fully historical/
 * inactive template), falls back to the most recent one instead, so the row
 * still shows something meaningful rather than nothing.
 */
function pickRepresentativePeriod(installments: InstallmentSummaryRow[], today: Date): string | null {
  if (installments.length === 0) return null;
  const currentMonthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const currentOrFuture = installments.filter((i) => i.due_date >= currentMonthStart);
  if (currentOrFuture.length > 0) {
    return currentOrFuture.reduce((min, i) => (i.due_date < min ? i.due_date : min), currentOrFuture[0].due_date);
  }
  return installments.reduce((max, i) => (i.due_date > max ? i.due_date : max), installments[0].due_date);
}

export function summarizeTemplate(
  installments: InstallmentSummaryRow[],
  graceDays: number = 0,
  today: Date = new Date(),
  // Special (single or divided) templates have a real, one-time grand total
  // -- only an open-ended recurring template repeats indefinitely and needs
  // scoping down to one representative period. Callers pass this based on
  // the template's own installment_type (components/cuotas/CuotasPageClient.tsx).
  scopeToOnePeriod: boolean = true,
): TemplateStatusSummary {
  const periodDueDate = scopeToOnePeriod ? pickRepresentativePeriod(installments, today) : null;
  const period = scopeToOnePeriod
    ? periodDueDate === null
      ? []
      : installments.filter((i) => i.due_date === periodDueDate)
    : installments;

  const houseIds = new Set(period.map((i) => i.house_id));
  let paidCount = 0;
  let partialCount = 0;
  let overdueCount = 0;
  for (const inst of period) {
    if (inst.status === 'paid') {
      paidCount += 1;
    } else if (isOverdue(inst.due_date, inst.status, graceDays, today)) {
      overdueCount += 1;
    } else if (inst.status === 'partial') {
      partialCount += 1;
    }
  }
  const totalAmount = period.reduce((sum, inst) => sum + inst.amount, 0);
  return {
    totalInstallments: period.length,
    paidCount,
    partialCount,
    overdueCount,
    pendingCount: period.length - paidCount - partialCount - overdueCount,
    housesCount: houseIds.size,
    totalAmount,
  };
}

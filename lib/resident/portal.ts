// Pure helpers for the resident portal screens (V2 Mi hogar, V3 Mis cuotas,
// V3b overdue state, V4 Mis pagos) — no Supabase calls here, same
// "pure lib / fetch in Server Component / render in Client Component" split
// already established by lib/cuotas/generate.ts, lib/payments/allocate.ts,
// lib/reporting/*. Calendar-day-safe (date-fns), reuses lib/cuotas/status.ts's
// isOverdue rather than re-deriving "overdue" (never stored, CLAUDE.md rule).
import { isOverdue, type InstallmentStatus } from '@/lib/cuotas/status';

// The mockup's four color-coded states (pagada/adelantada/pendiente/vencida)
// plus 'partial', which Phase 5 added to the DB status enum after the V3
// mockup was drawn — kept as its own bucket here for the same reason the
// admin cuotas list (lib/cuotas/status.ts's summarizeTemplate) and dashboard
// already surface it separately, rather than folding it into 'pending'.
export type DisplayStatus = 'paid' | 'advance' | 'partial' | 'pending' | 'overdue';

export function displayStatus(
  installment: { status: InstallmentStatus; due_date: string },
  today: Date = new Date(),
): DisplayStatus {
  if (installment.status === 'paid') return 'paid';
  if (isOverdue(installment.due_date, installment.status, today)) return 'overdue';
  if (installment.status === 'advance') return 'advance';
  if (installment.status === 'partial') return 'partial';
  return 'pending';
}

export type UpcomingCandidate = { due_date: string; status: InstallmentStatus };

/** "Lo que viene" (V2) — next non-paid, non-overdue installments, soonest first. */
export function upcomingInstallments<T extends UpcomingCandidate>(
  installments: T[],
  today: Date = new Date(),
  limit = 5,
): T[] {
  return installments
    .filter((i) => i.status !== 'paid' && !isOverdue(i.due_date, i.status, today))
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, limit);
}

/**
 * Groups installments by due-month ("YYYY-MM") for V3's month-grid. A plain
 * string slice of a date-only ("YYYY-MM-DD") column is safe here — this is a
 * grouping KEY, not date arithmetic, and due_date has no time/timezone
 * component to trip over (the raw-UTC-splitting anti-pattern this codebase
 * avoids applies to computing days/overdue math, not to reading the
 * year-month prefix of an already-calendar-day value).
 */
export function groupByDueMonth<T extends { due_date: string }>(installments: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const inst of installments) {
    const key = inst.due_date.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(inst);
    map.set(key, list);
  }
  return map;
}

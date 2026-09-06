// Pure payment-allocation math — no Supabase calls, no next/* imports. Safe
// to import from BOTH the Server Action (lib/actions/payments.ts, to build
// the real installment/payment writes) and a client component (to render an
// identical "Resumen del pago" preview before submit, matching the A5
// mockup's right-panel summary with antes/después states).
//
// PLAN.md Phase 5 decision: "Partial payment allocation: oldest-cuota-first.
// If the payment doesn't cover all selected cuotas, the oldest gets paid
// first, the next becomes partially paid for the remainder." All amounts are
// decimal(12,2) in the DB — this module works in integer cents internally
// (same rounding-safety rationale as lib/cuotas/generate.ts's splitAmount)
// so allocations never drift by a fraction of a cent.
import { parseISO } from 'date-fns';

export type AllocatableInstallment = {
  id: string;
  amount: number;
  amount_paid: number;
  due_date: string;
  installment_number: number;
};

export type Allocation = {
  installment_id: string;
  amountApplied: number;
  newAmountPaid: number;
  newStatus: 'partial' | 'paid';
};

export type AllocationResult = {
  allocations: Allocation[];
  /** Funds left over after every installment passed in was fully paid — becomes saldo a favor (credit). */
  leftoverCents: number;
};

/** Oldest due_date first; installment_number as a stable tiebreaker for same-day due dates. */
export function sortOldestFirst<T extends { due_date: string; installment_number: number }>(installments: T[]): T[] {
  return [...installments].sort((a, b) => {
    const dateDiff = parseISO(a.due_date).getTime() - parseISO(b.due_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.installment_number - b.installment_number;
  });
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Allocates `fundsAvailable` (major units, e.g. dollars) across `installments`
 * in the order given — callers must pre-sort (sortOldestFirst) since "oldest
 * first" is only meaningful within whatever set the caller decided to pass
 * in (e.g. only the admin-selected cuotas, per the locked decision — this
 * function itself is allocation-order-agnostic).
 */
export function allocateFunds(installments: AllocatableInstallment[], fundsAvailable: number): AllocationResult {
  let remainingCents = toCents(fundsAvailable);
  const allocations: Allocation[] = [];

  for (const inst of installments) {
    if (remainingCents <= 0) break;
    const balanceCents = toCents(inst.amount) - toCents(inst.amount_paid);
    if (balanceCents <= 0) continue; // already fully paid, nothing to allocate

    const applyCents = Math.min(balanceCents, remainingCents);
    remainingCents -= applyCents;

    const newAmountPaidCents = toCents(inst.amount_paid) + applyCents;
    allocations.push({
      installment_id: inst.id,
      amountApplied: applyCents / 100,
      newAmountPaid: newAmountPaidCents / 100,
      newStatus: newAmountPaidCents >= toCents(inst.amount) ? 'paid' : 'partial',
    });
  }

  return { allocations, leftoverCents: remainingCents };
}

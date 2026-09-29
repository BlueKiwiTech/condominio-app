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
import { convertAmount, rateTypeForCurrency, isRateFresh, type Currency, type ExchangeRateRow, type ExchangeRateType } from '@/lib/exchangeRate';

/** Which of a currency pair (at most one is non-USD in this app's model) is missing a usable rate, or null if both are fine. */
function findMissingRateCurrency(
  a: Currency,
  b: Currency,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
): Exclude<Currency, 'USD'> | null {
  for (const currency of [a, b]) {
    const rateType = rateTypeForCurrency(currency);
    if (!rateType) continue; // USD needs no rate
    const row = rates[rateType];
    if (!row || !isRateFresh(row.updated_at)) return currency as Exclude<Currency, 'USD'>;
  }
  return null;
}

export type AllocatableInstallment = {
  id: string;
  amount: number;
  amount_paid: number;
  due_date: string;
  installment_number: number;
  currency: Currency;
};

/** Present only when the installment's own currency differs from the payment's — mirrors lib/payments/walletAllocation.ts's FundingSource. */
export type AllocationFundingSource = {
  currency: Currency;
  /** Amount drawn from the payment, in the PAYMENT's own currency. */
  amountDrawn: number;
  exchangeRate: number;
  exchangeRateType: ExchangeRateType;
};

export type Allocation = {
  installment_id: string;
  /** Amount applied, in the INSTALLMENT's own currency (what amount_paid/status are computed from). */
  amountApplied: number;
  newAmountPaid: number;
  newStatus: 'partial' | 'paid';
  fundingSource: AllocationFundingSource | null;
};

export type AllocationResult =
  | {
      blocked: true;
      /** A rate the walk needed to convert the payment into an installment's currency is missing/stale. */
      missingRateFor: Exclude<Currency, 'USD'>;
    }
  | {
      blocked: false;
      allocations: Allocation[];
      /** Funds left over (in the PAYMENT's own currency) after every installment passed in was fully paid — becomes saldo a favor (credit). */
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
 * Allocates `fundsAvailable` (major units of `paymentCurrency`, e.g. dollars)
 * across `installments` in the order given — callers must pre-sort
 * (sortOldestFirst) since "oldest first" is only meaningful within whatever
 * set the caller decided to pass in (e.g. only the admin-selected cuotas,
 * per the locked decision — this function itself is allocation-order-
 * agnostic).
 *
 * Full-or-nothing, strictly in order (2026-09-29 user decision, reversing
 * PLAN.md's original PMNT-03 "supports partial payment"): a cuota is only
 * ever marked 'paid', never left 'partial' — the walk STOPS at the first
 * installment the remaining funds can't fully cover, exactly like
 * allocateFundsFullOrNothing below (used by the credit sweep). Whatever
 * funds weren't used stay as leftover (saldo a favor) rather than partially
 * applying or jumping ahead to a smaller, newer installment.
 *
 * An installment billed in a DIFFERENT currency than the payment is converted
 * at the current exchange rate (2026-09-29 fix — see lib/payments/
 * walletAllocation.ts's same convertAmount pivot-through-USD approach; before
 * this, a payment's face-value number was applied directly against every
 * selected installment regardless of currency, silently wiping out e.g. a
 * USD-priced cuota with a Bs amount 1:1). Same "never skip ahead" invariant
 * as the rest of this file: if a needed rate is missing/stale, the whole walk
 * stops right there (`blocked: true`) rather than skipping past the
 * unconvertible installment to a later one.
 */
export function allocateFunds(
  installments: AllocatableInstallment[],
  fundsAvailable: number,
  paymentCurrency: Currency,
  rates: Record<ExchangeRateType, ExchangeRateRow | null>,
): AllocationResult {
  let remainingCents = toCents(fundsAvailable);
  const allocations: Allocation[] = [];

  for (const inst of installments) {
    if (remainingCents <= 0) break;
    const totalCents = toCents(inst.amount);
    const balanceCents = totalCents - toCents(inst.amount_paid);
    if (balanceCents <= 0) continue; // already fully paid, nothing to allocate

    if (inst.currency === paymentCurrency) {
      if (balanceCents > remainingCents) break; // can't cover this one fully — stop here, stay blocked on it

      remainingCents -= balanceCents;
      allocations.push({
        installment_id: inst.id,
        amountApplied: balanceCents / 100,
        newAmountPaid: totalCents / 100,
        newStatus: 'paid',
        fundingSource: null,
      });
      continue;
    }

    // Cross-currency: figure out how much of the remaining PAYMENT funds the
    // installment's own remaining balance costs, converted into the
    // installment's currency.
    const balanceInInstCurrency = balanceCents / 100;
    const costInPaymentCurrency = convertAmount(balanceInInstCurrency, inst.currency, paymentCurrency, rates);
    if (costInPaymentCurrency === null) {
      const missingCurrency = findMissingRateCurrency(inst.currency, paymentCurrency, rates);
      // convertAmount only returns null when a needed rate is actually missing/stale, so this is always found.
      return { blocked: true, missingRateFor: missingCurrency! };
    }
    const costInPaymentCents = toCents(costInPaymentCurrency);
    if (costInPaymentCents > remainingCents) break; // can't cover this one fully — stop here, stay blocked on it

    remainingCents -= costInPaymentCents;
    const rateType = rateTypeForCurrency(inst.currency) ?? rateTypeForCurrency(paymentCurrency)!;
    allocations.push({
      installment_id: inst.id,
      amountApplied: balanceCents / 100,
      newAmountPaid: totalCents / 100,
      newStatus: 'paid',
      fundingSource: {
        currency: paymentCurrency,
        amountDrawn: costInPaymentCents / 100,
        exchangeRate: rates[rateType]!.rate,
        exchangeRateType: rateType,
      },
    });
  }

  return { blocked: false, allocations, leftoverCents: remainingCents };
}

/**
 * Same "oldest due_date first" pass as allocateFunds, but full-or-nothing
 * AND strictly in order: an installment is only ever fully paid, never
 * left 'partial' — and the walk STOPS at the first installment the
 * remaining funds can't fully cover (2026-09-26 user decision: it must
 * "quedar bloqueado" on the oldest unpaid one until enough accumulates to
 * cover THAT one; it must never skip ahead to pay a newer, smaller
 * installment out of order while an older, bigger one stays uncovered).
 * Whatever funds weren't used stay as leftover (credit sits in the wallet)
 * rather than jumping to a later installment — this is stricter than
 * lib/payments/walletAllocation.ts's per-due skip-and-continue behavior,
 * which is unaffected here; this function is used only by
 * lib/payments/creditSweep.ts's automatic saldo-a-favor sweep.
 * registerPayment's manual "Registrar pago" flow keeps using allocateFunds
 * above — an admin deliberately adjusting the amount to less than the
 * total owed (PMNT-03) is a different, still-supported case.
 */
export function allocateFundsFullOrNothing(
  installments: AllocatableInstallment[],
  fundsAvailable: number,
): { allocations: Allocation[]; leftoverCents: number } {
  let remainingCents = toCents(fundsAvailable);
  const allocations: Allocation[] = [];

  for (const inst of installments) {
    if (remainingCents <= 0) break;
    const totalCents = toCents(inst.amount);
    const balanceCents = totalCents - toCents(inst.amount_paid);
    if (balanceCents <= 0) continue; // already fully paid — doesn't block the oldest-first walk
    if (balanceCents > remainingCents) break; // can't cover this one fully — stop here; stay blocked on this due until enough accumulates, never skip ahead to a newer one

    remainingCents -= balanceCents;
    allocations.push({
      installment_id: inst.id,
      amountApplied: balanceCents / 100,
      newAmountPaid: totalCents / 100,
      newStatus: 'paid',
      fundingSource: null,
    });
  }

  return { allocations, leftoverCents: remainingCents };
}

// Shared core of "register a real payment against selected cuotas" --
// extracted from lib/actions/payments.ts's registerPayment so the same
// oldest-cuota-first allocation, credit netting, sequential receipt
// numbering, and credit write-back can also be triggered from confirming a
// resident's payment report (lib/actions/paymentReports.ts), without
// duplicating the logic or requiring the admin to re-enter the same data
// through the "Registrar pago" form.
//
// Callers are responsible for their own admin-auth check and input
// validation -- this function trusts installment_ids enough to re-fetch
// them fresh from the DB (never trusts amounts), same as registerPayment
// always did.
import { friendlyError } from '@/lib/errors';
import { randomUUID } from 'crypto';
import { parseISO } from 'date-fns';
import type { DbClient } from '@/lib/supabase/dbClient';
import { logAudit } from '@/lib/audit';
import { fetchRatesAsOf } from '@/lib/rates/asOf';
import {
  allocateFunds,
  sortOldestFirst,
  filterEligibleForConversionWindow,
  type AllocatableInstallment,
  type Allocation,
} from './allocate';
import { getHouseCredit } from './creditSweep';

type SupabaseClient = DbClient;
type Currency = 'USD' | 'Bs' | 'USDT';

export type ApplyAllocationParams = {
  house_id: string;
  currency: Currency;
  amount_received: number;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  installment_ids: string[];
  created_by: string | null;
  /**
   * True when the admin picked the cuotas on purpose (special cuotas chosen on
   * the payment form): the money goes to exactly installment_ids, oldest
   * first, and the 30-day conversion window does not apply. Default false.
   */
  explicit_installments?: boolean;
};

export type ApplyAllocationErrors = {
  installmentsGone: string;
  mixedHouses: string;
  alreadyPaid: string;
  insufficientAmount: string;
  staleExchangeRate: string;
  /** Another payment to the same house kept changing the state while this one retried. */
  concurrentPayment: string;
};

type EvaluatedInstallment = { id: string; currency: string; amount_paid: number; status: string };

/**
 * What evaluatePaymentAllocation found out, without having written anything:
 *  - `error`: a precondition failed (cuota gone, mixed houses, already paid,
 *    nothing received, or a Binance rate that is missing/stale).
 *  - `blockedByRate`: the BCV rate (Bs -> USD) for the payment's own date is
 *    missing or older than 24h. NOT an error: the payment waits ("en espera")
 *    until the rate arrives (change pagos-en-espera-por-tasa).
 *  - `ok`: the allocation to write.
 */
export type PaymentEvaluation =
  | { kind: 'error'; error: string }
  | { kind: 'blockedByRate' }
  | {
      kind: 'ok';
      installments: EvaluatedInstallment[];
      allocations: Allocation[];
      leftoverCents: number;
      /** The house credit (in the payment's currency) the allocation was computed from. */
      existingCredit: number;
    };

/**
 * The read-only half of applyPaymentAllocation: fetches the cuotas, the house's
 * credit and the rates as of the payment date, and runs allocateFunds. Safe to
 * call with an admin session or with the service role. Used to apply a
 * payment, to decide whether a resident's report must wait for a rate, and to
 * re-check a held payment when releasing it.
 */
export async function evaluatePaymentAllocation(
  supabase: SupabaseClient,
  params: ApplyAllocationParams,
  errors: ApplyAllocationErrors,
): Promise<PaymentEvaluation> {
  const { data: rawInstallments, error: fetchError } = await supabase
    .from('condo_installments')
    .select('id, house_id, currency, status, amount, amount_paid, due_date, installment_number')
    .in('id', params.installment_ids)
    .is('deleted_at', null);
  if (fetchError) return { kind: 'error', error: await friendlyError(fetchError) };

  const installments = rawInstallments ?? [];
  // A shorter result than requested means some id is gone or was voided
  // (deactivated template) since it was selected -- same user-facing error
  // as a hard delete, since either way the cuota no longer exists to pay.
  if (installments.length !== params.installment_ids.length) {
    return { kind: 'error', error: errors.installmentsGone };
  }
  for (const inst of installments) {
    if (inst.house_id !== params.house_id) return { kind: 'error', error: errors.mixedHouses };
    if (inst.status === 'paid') return { kind: 'error', error: errors.alreadyPaid };
  }

  const existingCredit = await getHouseCredit(supabase, params.house_id, params.currency);
  const fundsAvailable = params.amount_received + existingCredit;

  const paymentDateParsed = parseISO(params.payment_date);
  // A payment only reaches vencidas + up to 30 days ahead at its own-day
  // rate -- cuotas further out are left untouched here (still 'pending')
  // rather than pre-paid, so any leftover money becomes saldo a favor and
  // gets converted later at the rate in effect when it's actually drawn on.
  // Cuotas chosen on purpose (explicit_installments) skip that window.
  const eligible = params.explicit_installments
    ? (installments as AllocatableInstallment[])
    : filterEligibleForConversionWindow(installments as AllocatableInstallment[], paymentDateParsed);
  const sorted = sortOldestFirst(eligible);
  // Rates as of the payment's own "Fecha de abono", not "now" -- a backdated
  // entry converts at the rate that was actually in effect that day (see
  // lib/payments/allocate.ts's allocateFunds docstring).
  const rates = await fetchRatesAsOf(supabase, params.payment_date);
  const allocationResult = allocateFunds(sorted, fundsAvailable, params.currency, rates, paymentDateParsed);
  if (allocationResult.blocked) {
    // Only the BCV rate (Bs) makes a payment wait. Binance (USDT) is a 24/7
    // market whose stale rate is simply rejected, as before.
    return allocationResult.missingRateFor === 'Bs'
      ? { kind: 'blockedByRate' }
      : { kind: 'error', error: errors.staleExchangeRate };
  }

  // A deposit that doesn't fully cover ANY eligible cuota (full-or-nothing,
  // e.g. $100 against an oldest cuota of $224) is never rejected
  // (2026-10-06 user decision): the whole amount is banked as saldo a favor
  // and gets applied automatically once enough accumulates. Same goes for a
  // house with nothing currently selected/due or nothing inside the 30-day
  // window. Only literally nothing received is an error.
  if (params.amount_received <= 0) {
    return { kind: 'error', error: errors.insufficientAmount };
  }

  return {
    kind: 'ok',
    installments: installments as EvaluatedInstallment[],
    allocations: allocationResult.allocations,
    leftoverCents: allocationResult.leftoverCents,
    existingCredit,
  };
}

// How many times a payment re-reads the state and tries again when another payment to
// the same house got in first (see condo_apply_payment_batch's "conflict").
const MAX_ATTEMPTS = 4;

export async function applyPaymentAllocation(
  supabase: SupabaseClient,
  params: ApplyAllocationParams,
  errors: ApplyAllocationErrors,
): Promise<{ error: string } | { onHold: true } | { success: true; batchId: string; receiptNumber: number }> {
  let receiptNumber: number | null = null;
  const batchId = randomUUID();
  let current = params;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const evaluation = await evaluatePaymentAllocation(supabase, current, errors);
    if (evaluation.kind === 'error') return { error: evaluation.error };
    // No BCV rate for the payment's date yet: write nothing; the caller parks it
    // as 'on_hold' and it is released when the rate arrives.
    if (evaluation.kind === 'blockedByRate') return { onHold: true };
    const { installments, allocations, leftoverCents, existingCredit } = evaluation;

    // One receipt number per payment, kept across retries (a retry writes nothing before it succeeds).
    if (receiptNumber === null) {
      const { data: receiptData, error: receiptError } = await supabase.rpc('condo_next_receipt_number');
      if (receiptError) return { error: await friendlyError(receiptError) };
      receiptNumber = receiptData as number;
    }

    type PaymentInsertRow = {
      house_id: string;
      installment_id: string | null;
      payment_batch_id: string;
      amount_paid: number;
      currency: Currency;
      payment_date: string;
      reference: string | null;
      notes: string | null;
      receipt_number: number;
      created_by: string | null;
      funding_breakdown?: unknown;
    };

    // Each row's currency/amount is the INSTALLMENT's own denomination (same
    // convention as confirmPaymentReport's wallet path) -- funding_breakdown
    // records what was actually drawn from the received payment, and at what
    // rate, whenever that differs from the installment's own currency (see
    // lib/payments/allocate.ts's allocateFunds).
    const currencyByInstallmentId = new Map(installments.map((i) => [i.id, i.currency as Currency]));
    const walletTopUpRow = (amount: number): PaymentInsertRow => ({
      house_id: current.house_id,
      installment_id: null,
      payment_batch_id: batchId,
      amount_paid: amount,
      currency: current.currency,
      payment_date: current.payment_date,
      reference: current.reference || null,
      notes: current.notes || null,
      receipt_number: receiptNumber as number,
      created_by: current.created_by,
    });

    const paymentRows: PaymentInsertRow[] =
      allocations.length > 0
        ? [
            ...allocations.map((a) => ({
              house_id: current.house_id,
              installment_id: a.installment_id,
              payment_batch_id: batchId,
              amount_paid: a.amountApplied,
              currency: currencyByInstallmentId.get(a.installment_id) ?? current.currency,
              payment_date: current.payment_date,
              reference: current.reference || null,
              notes: current.notes || null,
              receipt_number: receiptNumber as number,
              created_by: current.created_by,
              funding_breakdown: a.fundingSource ? [a.fundingSource] : null,
            })),
            // Funds left after every selected cuota was either paid or the
            // walk stopped (full-or-nothing) -- gets its own line item so the
            // receipt total still adds up to what was actually received,
            // instead of the leftover only being inferable from the credit
            // balance silently changing (2026-09-29 fix: a payment covering
            // SOME cuotas with money left over previously wrote no row for
            // that leftover at all -- see PLAN.md).
            ...(leftoverCents > 0 ? [walletTopUpRow(leftoverCents / 100)] : []),
          ]
        : // Wallet-only deposit (nothing currently due to apply it to) -- one
          // ledger row with a null installment_id so it still shows up in
          // payment history with a real batch/receipt, instead of only being
          // inferable from the credit balance silently changing.
          [walletTopUpRow(current.amount_received)];

    // What the database function re-checks before writing: each cuota to update must
    // still be as read here, and so must the house credit. If another payment to this
    // house got in first it answers "conflict" and writes nothing.
    const installmentUpdates = allocations.map((a) => {
      const before = installments.find((i) => i.id === a.installment_id);
      return {
        id: a.installment_id,
        expected_amount_paid: before?.amount_paid ?? 0,
        expected_status: before?.status ?? 'pending',
        new_amount_paid: a.newAmountPaid,
        new_status: a.newStatus,
      };
    });

    // The batch rows, the money received (amount_received, in its own currency), the
    // cuota updates and the new credit are saved by ONE database function: all or
    // nothing, so the community balance, the ledger, the cuotas and the credit can't
    // disagree (changes saldo-comunidad-libro and the QA round 1 fix). A payment funded
    // only by existing credit has amount_received 0 and adds nothing to the community
    // balance -- that money was counted when it arrived.
    const { data: batchResult, error: paymentsError } = await supabase.rpc('condo_apply_payment_batch', {
      p_house_id: current.house_id,
      p_batch_id: batchId,
      p_rows: paymentRows,
      p_currency: current.currency,
      p_amount_received: current.amount_received,
      p_occurred_on: current.payment_date,
      p_created_by: current.created_by,
      p_installment_updates: installmentUpdates,
      p_expected_credit: existingCredit,
      p_new_credit: leftoverCents / 100,
    });
    if (paymentsError) return { error: await friendlyError(paymentsError) };
    const outcome = batchResult as { ok?: boolean; reason?: string } | null;

    if (outcome?.ok) {
      await logAudit(supabase, {
        userId: current.created_by,
        action: 'payment.create',
        entityType: 'payment_batch',
        entityId: batchId,
      });
      return { success: true, batchId, receiptNumber };
    }

    if (outcome?.reason === 'conflict' && attempt < MAX_ATTEMPTS) {
      // Another payment to this house got in first: nothing was written. Read the
      // fresh state and try again. Cuotas that were paid meanwhile are dropped from
      // an automatic selection; a selection the admin made on purpose is kept, so it
      // fails with "already paid" instead of silently paying something else.
      if (!current.explicit_installments) {
        const { data: stillOpen } = await supabase
          .from('condo_installments')
          .select('id')
          .in('id', current.installment_ids)
          .neq('status', 'paid')
          .is('deleted_at', null);
        current = { ...current, installment_ids: (stillOpen ?? []).map((r) => r.id as string) };
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * attempt + Math.floor(Math.random() * 50)));
      continue;
    }
    if (outcome?.reason === 'conflict') return { error: errors.concurrentPayment };
    return { error: errors.installmentsGone };
  }
  return { error: errors.concurrentPayment };
}

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
import type { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { getExchangeRatesAsOf } from '@/lib/actions/exchangeRate';
import { allocateFunds, sortOldestFirst, filterEligibleForConversionWindow, type AllocatableInstallment } from './allocate';
import { getHouseCredit, setHouseCredit } from './creditSweep';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
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
};

export type ApplyAllocationErrors = {
  installmentsGone: string;
  mixedHouses: string;
  alreadyPaid: string;
  insufficientAmount: string;
  staleExchangeRate: string;
};

export async function applyPaymentAllocation(
  supabase: SupabaseClient,
  params: ApplyAllocationParams,
  errors: ApplyAllocationErrors,
): Promise<{ error: string } | { success: true; batchId: string; receiptNumber: number }> {
  const { data: rawInstallments, error: fetchError } = await supabase
    .from('condo_installments')
    .select('id, house_id, currency, status, amount, amount_paid, due_date, installment_number')
    .in('id', params.installment_ids)
    .is('deleted_at', null);
  if (fetchError) return { error: await friendlyError(fetchError) };

  const installments = rawInstallments ?? [];
  // A shorter result than requested means some id is gone or was voided
  // (deactivated template) since it was selected -- same user-facing error
  // as a hard delete, since either way the cuota no longer exists to pay.
  if (installments.length !== params.installment_ids.length) {
    return { error: errors.installmentsGone };
  }
  for (const inst of installments) {
    if (inst.house_id !== params.house_id) return { error: errors.mixedHouses };
    if (inst.status === 'paid') return { error: errors.alreadyPaid };
  }

  const existingCredit = await getHouseCredit(supabase, params.house_id, params.currency);
  const fundsAvailable = params.amount_received + existingCredit;

  const paymentDateParsed = parseISO(params.payment_date);
  // A payment only reaches vencidas + up to 30 days ahead at its own-day
  // rate -- cuotas further out are left untouched here (still 'pending')
  // rather than pre-paid, so any leftover money becomes saldo a favor and
  // gets converted later at the rate in effect when it's actually drawn on.
  const eligible = filterEligibleForConversionWindow(installments as AllocatableInstallment[], paymentDateParsed);
  const sorted = sortOldestFirst(eligible);
  // Rates as of the payment's own "Fecha de abono", not "now" -- a backdated
  // entry converts at the rate that was actually in effect that day (see
  // lib/payments/allocate.ts's allocateFunds docstring).
  const rates = await getExchangeRatesAsOf(params.payment_date);
  const allocationResult = allocateFunds(sorted, fundsAvailable, params.currency, rates, paymentDateParsed);
  if (allocationResult.blocked) return { error: errors.staleExchangeRate };
  const { allocations, leftoverCents } = allocationResult;

  // A house with nothing currently selected/due (or, for a Bs payment,
  // nothing within the 30-day conversion window) can still bank a deposit --
  // the whole amount simply becomes (or tops up) saldo a favor, same as
  // residents' own "Abonar a cartera" already allows. Only a real shortfall
  // against ELIGIBLE cuotas (there WERE eligible installments but funds
  // didn't cover any of them), or literally nothing received, is an error.
  if (eligible.length > 0 && allocations.length === 0) {
    return { error: errors.insufficientAmount };
  }
  if (installments.length === 0 && params.amount_received <= 0) {
    return { error: errors.insufficientAmount };
  }

  const { data: receiptData, error: receiptError } = await supabase.rpc('condo_next_receipt_number');
  if (receiptError) return { error: await friendlyError(receiptError) };
  const receiptNumber = receiptData as number;
  const batchId = randomUUID();

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
    house_id: params.house_id,
    installment_id: null,
    payment_batch_id: batchId,
    amount_paid: amount,
    currency: params.currency,
    payment_date: params.payment_date,
    reference: params.reference || null,
    notes: params.notes || null,
    receipt_number: receiptNumber,
    created_by: params.created_by,
  });

  const paymentRows: PaymentInsertRow[] =
    allocations.length > 0
      ? [
          ...allocations.map((a) => ({
            house_id: params.house_id,
            installment_id: a.installment_id,
            payment_batch_id: batchId,
            amount_paid: a.amountApplied,
            currency: currencyByInstallmentId.get(a.installment_id) ?? params.currency,
            payment_date: params.payment_date,
            reference: params.reference || null,
            notes: params.notes || null,
            receipt_number: receiptNumber,
            created_by: params.created_by,
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
        [walletTopUpRow(params.amount_received)];

  const { error: paymentsError } = await supabase.from('condo_payments').insert(paymentRows);
  if (paymentsError) return { error: await friendlyError(paymentsError) };

  for (const a of allocations) {
    const { error: updateError } = await supabase
      .from('condo_installments')
      .update({ amount_paid: a.newAmountPaid, status: a.newStatus })
      .eq('id', a.installment_id);
    if (updateError) return { error: await friendlyError(updateError) };
  }

  const { error: creditError } = await setHouseCredit(supabase, params.house_id, params.currency, leftoverCents / 100);
  if (creditError) return { error: creditError };

  await logAudit(supabase, {
    userId: params.created_by,
    action: 'payment.create',
    entityType: 'payment_batch',
    entityId: batchId,
  });

  return { success: true, batchId, receiptNumber };
}

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
import { randomUUID } from 'crypto';
import type { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { allocateFunds, sortOldestFirst, type AllocatableInstallment } from './allocate';
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
};

export async function applyPaymentAllocation(
  supabase: SupabaseClient,
  params: ApplyAllocationParams,
  errors: ApplyAllocationErrors,
): Promise<{ error: string } | { success: true; batchId: string; receiptNumber: number }> {
  const { data: rawInstallments, error: fetchError } = await supabase
    .from('condo_installments')
    .select('id, house_id, currency, status, amount, amount_paid, due_date, installment_number')
    .in('id', params.installment_ids);
  if (fetchError) return { error: fetchError.message };

  const installments = rawInstallments ?? [];
  if (installments.length !== params.installment_ids.length) {
    return { error: errors.installmentsGone };
  }
  for (const inst of installments) {
    if (inst.house_id !== params.house_id) return { error: errors.mixedHouses };
    if (inst.status === 'paid') return { error: errors.alreadyPaid };
  }

  const existingCredit = await getHouseCredit(supabase, params.house_id, params.currency);
  const fundsAvailable = params.amount_received + existingCredit;

  const sorted = sortOldestFirst(installments as AllocatableInstallment[]);
  const { allocations, leftoverCents } = allocateFunds(sorted, fundsAvailable);

  if (allocations.length === 0) {
    return { error: errors.insufficientAmount };
  }

  const { data: receiptData, error: receiptError } = await supabase.rpc('condo_next_receipt_number');
  if (receiptError) return { error: receiptError.message };
  const receiptNumber = receiptData as number;
  const batchId = randomUUID();

  const paymentRows = allocations.map((a) => ({
    house_id: params.house_id,
    installment_id: a.installment_id,
    payment_batch_id: batchId,
    amount_paid: a.amountApplied,
    currency: params.currency,
    payment_date: params.payment_date,
    reference: params.reference || null,
    notes: params.notes || null,
    receipt_number: receiptNumber,
    created_by: params.created_by,
  }));

  const { error: paymentsError } = await supabase.from('condo_payments').insert(paymentRows);
  if (paymentsError) return { error: paymentsError.message };

  for (const a of allocations) {
    const { error: updateError } = await supabase
      .from('condo_installments')
      .update({ amount_paid: a.newAmountPaid, status: a.newStatus })
      .eq('id', a.installment_id);
    if (updateError) return { error: updateError.message };
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

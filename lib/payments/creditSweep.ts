// Shared "saldo a favor" (credit) helpers — used by both the payment
// registration Server Action (lib/actions/payments.ts) and the cuota
// generation Server Action (lib/actions/cuotas.ts's createInstallmentTemplate).
//
// PLAN.md Phase 5 decision: "Overpayment: the excess becomes saldo a favor
// (credit) on the house, auto-applied to the next cuota that becomes due
// (not something the admin has to manually remember to apply)." This is
// implemented at two touchpoints:
//   1. registerPayment nets any EXISTING credit together with the new cash
//      received before allocating across the admin-selected cuotas (see
//      lib/actions/payments.ts) — any leftover (old credit unused, or new
//      cash beyond what the selected cuotas needed) is written back here.
//   2. sweepCreditForNewInstallments (this file) runs right after a cuota
//      template generates brand-new installment rows for a house that
//      already carries a credit balance — this is the literal "next cuota
//      that BECOMES due" case: a cuota that didn't exist a moment ago.
//
// Deliberately NOT swept: pre-existing pending/overdue installments that
// were already sitting there before the credit existed and that the admin
// didn't select in a payment action — auto-clearing old debt via a credit
// created for an unrelated cuota would silently hide real morosos, which
// PLAN.md's core value (accurate morosos/saldo tracking) explicitly cares
// about getting right over convenience.
import { randomUUID } from 'crypto';
import type { createClient } from '@/lib/supabase/server';
import { allocateFunds, sortOldestFirst, type AllocatableInstallment } from './allocate';

// Both callers (lib/actions/payments.ts, lib/actions/cuotas.ts) build their
// client via lib/supabase/server.ts's createClient() — same cookie-based,
// getUser()-gated admin client either way, so this type alias matches
// whichever instance either Server Action passes in.
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type Currency = 'USD' | 'Bs' | 'USDT';

export async function getHouseCredit(
  supabase: SupabaseClient,
  houseId: string,
  currency: Currency,
): Promise<number> {
  const { data } = await supabase
    .from('condo_house_credits')
    .select('balance')
    .eq('house_id', houseId)
    .eq('currency', currency)
    .maybeSingle();
  return (data?.balance as number | undefined) ?? 0;
}

/** Replaces (not increments — callers pass the post-consumption total) the stored credit balance for a house+currency. */
export async function setHouseCredit(
  supabase: SupabaseClient,
  houseId: string,
  currency: Currency,
  balance: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('condo_house_credits')
    .upsert(
      { house_id: houseId, currency, balance, updated_at: new Date().toISOString() },
      { onConflict: 'house_id,currency' },
    );
  return { error: error?.message ?? null };
}

/**
 * Applies an existing house credit balance across a freshly-generated batch
 * of installments (oldest-first), writing real condo_payments rows (its own
 * receipt/batch, distinct from any cash payment) so the auto-settlement
 * shows up in payment history/receipts like any other payment. No-ops
 * silently if there's no credit or nothing was generated.
 */
export async function sweepCreditForNewInstallments(
  supabase: SupabaseClient,
  params: {
    houseId: string;
    currency: Currency;
    createdBy: string | null;
    newInstallments: AllocatableInstallment[];
    paymentDate: string;
    notes: string;
  },
): Promise<{ error: string | null }> {
  const { houseId, currency, createdBy, newInstallments, paymentDate, notes } = params;
  if (newInstallments.length === 0) return { error: null };

  const credit = await getHouseCredit(supabase, houseId, currency);
  if (credit <= 0) return { error: null };

  const sorted = sortOldestFirst(newInstallments);
  const { allocations, leftoverCents } = allocateFunds(sorted, credit);
  if (allocations.length === 0) return { error: null };

  const { data: receiptData, error: receiptError } = await supabase.rpc('condo_next_receipt_number');
  if (receiptError) return { error: receiptError.message };
  const receiptNumber = receiptData as number;
  const batchId = randomUUID();

  const paymentRows = allocations.map((a) => ({
    house_id: houseId,
    installment_id: a.installment_id,
    payment_batch_id: batchId,
    amount_paid: a.amountApplied,
    currency,
    payment_date: paymentDate,
    reference: null,
    notes,
    receipt_number: receiptNumber,
    created_by: createdBy,
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

  const { error: creditError } = await setHouseCredit(supabase, houseId, currency, leftoverCents / 100);
  if (creditError) return { error: creditError };

  return { error: null };
}

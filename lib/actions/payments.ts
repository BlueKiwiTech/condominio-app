'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { registerPaymentSchema, type RegisterPaymentInput } from '@/lib/validation/payments';
import { allocateFunds, sortOldestFirst, type AllocatableInstallment } from '@/lib/payments/allocate';
import { getHouseCredit, setHouseCredit } from '@/lib/payments/creditSweep';

type ActionResult = { error: string } | { success: true; batchId: string; receiptNumber: number };

/** Network-verified — never getSession() as an authorization gate (CLAUDE.md). */
async function requireAdmin(tc: Awaited<ReturnType<typeof getTranslations>>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: tc('sessionExpired'), supabase: null, userId: null };
  }
  return { error: null, supabase, userId: data.user.id };
}

/**
 * Registers one admin payment action against several admin-selected pending
 * cuotas in one go (PMNT-01/02). PLAN.md Phase 5 decisions implemented here:
 *
 * - Oldest-cuota-first allocation among the SELECTED installments (PMNT-03's
 *   "adjustable, supports partial payment").
 * - The payment's currency does NOT have to match the selected cuotas' own
 *   currency (user decision, 2026-09-08) -- a cuota's amount is denominated
 *   in one currency, but it can be paid in any currency the resident
 *   actually hands over; there's no FX-conversion feature here, so
 *   reconciling the exchange rate is the admin's own job. `amount_received`
 *   is applied as a plain number against each installment's own numeric
 *   balance regardless of either currency label -- this was already true
 *   of allocateFunds()'s arithmetic; only a since-removed DB trigger and a
 *   validation check here ever enforced the two matching.
 * - Any pre-existing saldo a favor (credit) for this house+currency is netted
 *   in as additional available funds BEFORE allocating — this is the
 *   "auto-applied... not something the admin has to manually remember"
 *   half of the overpayment decision for cuotas that were already pending
 *   when the credit was created. (The other half — credit auto-applied to
 *   BRAND NEW cuotas generated after the credit exists — is
 *   lib/payments/creditSweep.ts's sweepCreditForNewInstallments, called from
 *   lib/actions/cuotas.ts.)
 * - Any funds left over after every selected installment is fully paid are
 *   written back as the house's new credit balance for this currency
 *   (replacing, not adding to, the pre-existing balance already netted in
 *   above — it was already included in the funds allocated from).
 * - Sequential, community-wide receipt number assigned once per batch,
 *   shared by every condo_payments row this action writes.
 *
 * Not a single DB transaction (Server Actions call PostgREST over HTTP, same
 * constraint already documented in lib/actions/cuotas.ts) — writes happen in
 * an order that keeps condo_payments (the ledger) as the first, most-likely-
 * to-succeed write, so a later failure leaves the ledger intact even if the
 * derived installment/credit state needs manual reconciliation.
 */
export async function registerPayment(input: RegisterPaymentInput, locale: string): Promise<ActionResult> {
  const [tv, tc, tp] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.payments' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'payments' }),
  ]);
  const parsed = registerPaymentSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  const data = parsed.data;

  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  // Fetch the selected installments fresh from the DB — never trust
  // client-supplied amounts/status, only IDs.
  const { data: rawInstallments, error: fetchError } = await supabase
    .from('condo_installments')
    .select('id, house_id, currency, status, amount, amount_paid, due_date, installment_number')
    .in('id', data.installment_ids);
  if (fetchError) return { error: fetchError.message };

  const installments = rawInstallments ?? [];
  if (installments.length !== data.installment_ids.length) {
    return { error: tp('errors.installmentsGone') };
  }
  for (const inst of installments) {
    if (inst.house_id !== data.house_id) return { error: tp('errors.mixedHouses') };
    if (inst.status === 'paid') return { error: tp('errors.alreadyPaid') };
  }

  const existingCredit = await getHouseCredit(supabase, data.house_id, data.currency);
  const fundsAvailable = data.amount_received + existingCredit;

  const sorted = sortOldestFirst(installments as AllocatableInstallment[]);
  const { allocations, leftoverCents } = allocateFunds(sorted, fundsAvailable);

  if (allocations.length === 0) {
    return { error: tp('errors.insufficientAmount') };
  }

  const { data: receiptData, error: receiptError } = await supabase.rpc('condo_next_receipt_number');
  if (receiptError) return { error: receiptError.message };
  const receiptNumber = receiptData as number;
  const batchId = randomUUID();

  const paymentRows = allocations.map((a) => ({
    house_id: data.house_id,
    installment_id: a.installment_id,
    payment_batch_id: batchId,
    amount_paid: a.amountApplied,
    currency: data.currency,
    payment_date: data.payment_date,
    reference: data.reference || null,
    notes: data.notes || null,
    receipt_number: receiptNumber,
    created_by: userId,
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

  const { error: creditError } = await setHouseCredit(supabase, data.house_id, data.currency, leftoverCents / 100);
  if (creditError) return { error: creditError };

  revalidatePath('/pagos');
  revalidatePath('/cuotas');
  return { success: true, batchId, receiptNumber };
}

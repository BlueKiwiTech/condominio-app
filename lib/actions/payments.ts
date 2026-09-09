'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { registerPaymentSchema, type RegisterPaymentInput } from '@/lib/validation/payments';
import { applyPaymentAllocation } from '@/lib/payments/applyAllocation';

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
 * cuotas in one go (PMNT-01/02). The allocation itself lives in
 * lib/payments/applyAllocation.ts's applyPaymentAllocation, shared with
 * lib/actions/paymentReports.ts's confirmPaymentReport (confirming a
 * resident's self-reported payment applies the same logic using the
 * report's own stored data instead of a freshly-submitted form). PLAN.md
 * Phase 5 decisions implemented there:
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

  const result = await applyPaymentAllocation(
    supabase,
    {
      house_id: data.house_id,
      currency: data.currency,
      amount_received: data.amount_received,
      payment_date: data.payment_date,
      reference: data.reference || null,
      notes: data.notes || null,
      installment_ids: data.installment_ids,
      created_by: userId,
    },
    {
      installmentsGone: tp('errors.installmentsGone'),
      mixedHouses: tp('errors.mixedHouses'),
      alreadyPaid: tp('errors.alreadyPaid'),
      insufficientAmount: tp('errors.insufficientAmount'),
    },
  );
  if ('error' in result) return result;

  revalidatePath('/pagos');
  revalidatePath('/cuotas');
  return { success: true, batchId: result.batchId, receiptNumber: result.receiptNumber };
}

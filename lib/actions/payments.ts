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
 * - Oldest-cuota-first, full-or-nothing allocation among the SELECTED
 *   installments (2026-09-29 user decision, reversing PLAN.md's original
 *   PMNT-03 "supports partial payment"): a cuota is only ever marked paid if
 *   the funds available fully cover it — never left 'partial' — and the walk
 *   stops at the first installment it can't fully cover, same invariant
 *   lib/payments/creditSweep.ts's automatic sweep already used.
 * - The payment's currency does NOT have to match the selected cuotas' own
 *   currency (user decision, 2026-09-08) -- a cuota's amount is denominated
 *   in one currency, but it can be paid in any currency the resident
 *   actually hands over. 2026-09-24's move to auto-allocating against EVERY
 *   pending installment for the house (not just admin-hand-picked,
 *   same-currency ones) turned that original decision into a live bug: a
 *   payment's face-value number was applied directly against a
 *   different-currency cuota's balance with no conversion, silently wiping
 *   out e.g. a USD-priced cuota with a Bs amount 1:1. 2026-09-29 fix:
 *   lib/payments/allocate.ts's allocateFunds now converts at the current
 *   exchange rate (same lib/exchangeRate.ts pivot-through-USD math
 *   lib/payments/walletAllocation.ts already used for "Mi Cartera") whenever
 *   an installment's currency differs from the payment's, and blocks with an
 *   error if a needed rate is missing/stale rather than guessing.
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
      staleExchangeRate: tp('errors.staleExchangeRate'),
    },
  );
  if ('error' in result) return result;

  revalidatePath('/pagos');
  revalidatePath('/cuotas');
  return { success: true, batchId: result.batchId, receiptNumber: result.receiptNumber };
}

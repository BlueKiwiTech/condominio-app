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
// 2026-09-26 decision: sweepCreditForNewInstallments (touchpoint 2) is
// full-or-nothing per installment, AND strictly oldest-first with no
// skipping (lib/payments/allocate.ts's allocateFundsFullOrNothing) —
// cuotas are paid in full or not at all when the money is applied
// automatically, and the sweep stays blocked on the oldest unpaid
// installment until enough credit accumulates to cover it; it never jumps
// ahead to pay a newer, smaller installment while an older one goes
// uncovered. Whatever isn't used stays in the wallet rather than marking
// anything 'partial' with no payment intent from anyone. registerPayment
// (touchpoint 1) is unaffected — an admin deliberately entering a smaller
// amount than owed (PMNT-03) still produces a 'partial' installment, same
// as always.
//
// Deliberately NOT swept: pre-existing pending/overdue installments that
// were already sitting there before the credit existed and that the admin
// didn't select in a payment action — auto-clearing old debt via a credit
// created for an unrelated cuota would silently hide real morosos, which
// PLAN.md's core value (accurate morosos/saldo tracking) explicitly cares
// about getting right over convenience.
import { randomUUID } from 'crypto';
import type { createClient } from '@/lib/supabase/server';
import { allocateFundsFullOrNothing, sortOldestFirst, type AllocatableInstallment } from './allocate';
import { toDateOnly } from '@/lib/cuotas/generate';

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
 * of installments, FIRST narrowed to those with due_date <= today (never a
 * future month, however many the horizon generator produced in this batch),
 * then oldest-first, full-or-nothing per installment — see the 2026-09-26
 * decision above — writing real condo_payments rows (its own receipt/batch,
 * distinct from any cash payment) so the auto-settlement shows up in payment
 * history/receipts like any other payment. No-ops silently if there's no
 * credit, nothing generated is due yet, or the credit doesn't fully cover
 * even the oldest due installment (the money stays in the wallet rather than
 * partially applying or reaching into next month's cuota).
 */
/**
 * Daily-cron counterpart to sweepCreditForNewInstallments above: re-checks
 * EVERY house's existing credit balance against installments that were
 * already sitting there (not freshly generated) and have since crossed the
 * due_date <= today threshold. Closes the gap left by the two event-triggered
 * touchpoints (this file's sweep, only for freshly-generated rows; and
 * confirmPaymentReport's wallet path, only at report-confirmation time): a
 * credit created before an installment became vencida previously had no
 * mechanism to ever get re-applied once that installment later became due.
 *
 * Deliberately single-currency, same as sweepCreditForNewInstallments itself
 * (reused here unmodified) — a house with e.g. Bs credit and only a
 * USD-billed due overdue won't be caught by this daily sweep; that
 * cross-currency case is still handled reactively by confirmPaymentReport's
 * full allocateWalletFunds path whenever an actual payment report is
 * confirmed. Acceptable for a once-a-day best-effort backstop.
 */
export async function sweepStaleCreditsAgainstVencidaInstallments(
  supabase: SupabaseClient,
  paymentDate: string,
): Promise<{ error: string | null; sweepErrors: string[] }> {
  const today = toDateOnly(new Date());

  const [{ data: creditRows, error: creditError }, { data: instRows, error: instError }] = await Promise.all([
    supabase.from('condo_house_credits').select('house_id, currency, balance').gt('balance', 0),
    supabase
      .from('condo_installments')
      .select('id, house_id, currency, amount, amount_paid, due_date, installment_number')
      .neq('status', 'paid')
      .is('deleted_at', null)
      .lte('due_date', today),
  ]);
  if (creditError) return { error: creditError.message, sweepErrors: [] };
  if (instError) return { error: instError.message, sweepErrors: [] };

  type InstallmentRow = AllocatableInstallment & { house_id: string; currency: Currency };
  const byHouseCurrency = new Map<string, AllocatableInstallment[]>();
  for (const row of (instRows ?? []) as InstallmentRow[]) {
    const key = `${row.house_id}::${row.currency}`;
    const list = byHouseCurrency.get(key) ?? [];
    list.push({
      id: row.id,
      amount: row.amount,
      amount_paid: row.amount_paid,
      due_date: row.due_date,
      installment_number: row.installment_number,
      currency: row.currency,
    });
    byHouseCurrency.set(key, list);
  }

  const sweepErrors: string[] = [];
  for (const credit of (creditRows ?? []) as { house_id: string; currency: Currency; balance: number }[]) {
    const candidates = byHouseCurrency.get(`${credit.house_id}::${credit.currency}`);
    if (!candidates || candidates.length === 0) continue;

    const { error } = await sweepCreditForNewInstallments(supabase, {
      houseId: credit.house_id,
      currency: credit.currency,
      createdBy: null,
      newInstallments: candidates,
      paymentDate,
      notes: 'Aplicado automáticamente desde saldo a favor (barrido diario).',
    });
    if (error) sweepErrors.push(`${credit.house_id}/${credit.currency}: ${error}`);
  }

  return { error: null, sweepErrors };
}

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

  // Only ever settle installments that are ALREADY due (due_date <= today) —
  // "the next cuota that BECOMES due" (see file header) means the one
  // due NOW, never a future month's installment just because the horizon
  // generator happened to create it in the same batch and credit happens to
  // cover it too (2026-09-27 bug: a fresh open-ended template's first-run
  // horizon batch spans up to ~6 months out, and this sweep was consuming
  // wallet credit across every one of them instead of stopping at the one
  // actually vencida).
  const today = toDateOnly(new Date());
  const dueNow = newInstallments.filter((inst) => inst.due_date <= today);
  if (dueNow.length === 0) return { error: null };

  const credit = await getHouseCredit(supabase, houseId, currency);
  if (credit <= 0) return { error: null };

  const sorted = sortOldestFirst(dueNow);
  const { allocations, leftoverCents } = allocateFundsFullOrNothing(sorted, credit);
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

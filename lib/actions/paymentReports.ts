'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { applyPaymentAllocation } from '@/lib/payments/applyAllocation';
import { setHouseCredit } from '@/lib/payments/creditSweep';
import { allocateWalletFunds, type DueForWallet, type WalletBalances } from '@/lib/payments/walletAllocation';
import { getLatestExchangeRates } from '@/lib/actions/exchangeRate';
import { logAudit } from '@/lib/audit';

type ActionResult = { error: string } | { success: true };
type Currency = 'USD' | 'Bs' | 'USDT';

type ReportForConfirm = {
  house_id: string;
  amount: number;
  currency: Currency;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  installment_ids: string[];
  status: 'pending' | 'confirmed' | 'rejected';
};

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
 * Admin rejects a resident-submitted payment report (see
 * lib/actions/residentPayments.ts / the condo_payment_reports migration).
 * Just a status flag -- rejecting never created a condo_payments row, so
 * there's nothing to undo.
 */
export async function rejectPaymentReport(reportId: string, locale: string): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from('condo_payment_reports')
    .update({ status: 'rejected' })
    .eq('id', reportId);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    userId,
    action: 'payment_report.reject',
    entityType: 'payment_report',
    entityId: reportId,
  });

  revalidatePath('/pagos-reportados');
  return { success: true };
}

/**
 * Admin confirms a resident-submitted payment report. Unlike a plain status
 * flag, this actually registers the real payment.
 *
 * If the report is TAGGED to specific cuotas (installment_ids non-empty --
 * legacy path, the resident-facing dialog stopped letting residents tag
 * cuotas as of 2026-09-18), this reuses the same allocation "Registrar pago"
 * performs (lib/payments/applyAllocation.ts's applyPaymentAllocation).
 *
 * Every report submitted today arrives untagged, which now runs through
 * "Mi Cartera"'s wallet allocation instead (2026-09-19/20 decision,
 * lib/payments/walletAllocation.ts): the reported amount is added to the
 * house's wallet balance in ITS OWN CURRENCY (no conversion at deposit
 * time), then EVERY outstanding due for the house (any currency, not just
 * ones the resident happened to be shown) gets checked oldest-first,
 * full-or-nothing, drawing wallet currency in priority order
 * Bs -> USDT -> USD regardless of the due's own currency, converting only
 * at the moment funds are actually used. This supersedes the old
 * "untagged reports just become undifferentiated credit, never touch
 * existing debt" behavior (2026-09-18 fix) -- it's a deliberate, audited
 * paid-in-full operation (funding_breakdown records exactly what funded
 * each due), not the silent auto-sweep lib/payments/creditSweep.ts still
 * avoids for NEW cuotas' pre-existing credit. Blocks with an error instead
 * of guessing if a needed exchange rate is missing/stale.
 */
export async function confirmPaymentReport(reportId: string, locale: string): Promise<ActionResult> {
  const [tc, tp] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'payments' }),
  ]);
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { data: reportData, error: fetchError } = await supabase
    .from('condo_payment_reports')
    .select('house_id, amount, currency, payment_date, reference, notes, installment_ids, status')
    .eq('id', reportId)
    .maybeSingle();
  if (fetchError) return { error: fetchError.message };
  const report = reportData as ReportForConfirm | null;
  if (!report) return { error: tc('invalidData') };
  if (report.status !== 'pending') return { error: tc('invalidData') };

  if (report.installment_ids.length === 0) {
    const [{ data: creditRows, error: creditFetchError }, { data: dueRows, error: dueFetchError }, rates] = await Promise.all([
      supabase.from('condo_house_credits').select('currency, balance').eq('house_id', report.house_id),
      supabase
        .from('condo_installments')
        .select('id, currency, amount, amount_paid, due_date, installment_number')
        .eq('house_id', report.house_id)
        .neq('status', 'paid'),
      getLatestExchangeRates(),
    ]);
    if (creditFetchError) return { error: creditFetchError.message };
    if (dueFetchError) return { error: dueFetchError.message };

    const balances: WalletBalances = { USD: 0, Bs: 0, USDT: 0 };
    for (const row of creditRows ?? []) balances[row.currency as Currency] = row.balance as number;
    balances[report.currency] = (balances[report.currency] ?? 0) + report.amount;

    const dues = (dueRows ?? []) as DueForWallet[];
    const allocation = allocateWalletFunds(dues, balances, rates);
    if (allocation.blocked) return { error: tp('errors.staleExchangeRate') };

    const { data: receiptData, error: receiptError } = await supabase.rpc('condo_next_receipt_number');
    if (receiptError) return { error: receiptError.message };
    const receiptNumber = receiptData as number;
    const batchId = randomUUID();

    if (allocation.payments.length > 0) {
      const dueById = new Map(dues.map((d) => [d.id, d]));
      const paymentRows = allocation.payments.map((p) => ({
        house_id: report.house_id,
        installment_id: p.installment_id,
        payment_batch_id: batchId,
        amount_paid: p.amountApplied,
        currency: p.currency,
        payment_date: report.payment_date,
        reference: report.reference,
        notes: report.notes,
        receipt_number: receiptNumber,
        created_by: userId,
        funding_breakdown: p.sources,
      }));
      const { error: paymentsError } = await supabase.from('condo_payments').insert(paymentRows);
      if (paymentsError) return { error: paymentsError.message };

      for (const p of allocation.payments) {
        const due = dueById.get(p.installment_id)!;
        const { error: updateError } = await supabase
          .from('condo_installments')
          .update({ amount_paid: due.amount, status: 'paid' })
          .eq('id', p.installment_id);
        if (updateError) return { error: updateError.message };
      }
    }

    for (const currency of ['USD', 'Bs', 'USDT'] as const) {
      const { error: creditError } = await setHouseCredit(supabase, report.house_id, currency, allocation.updatedBalances[currency]);
      if (creditError) return { error: creditError };
    }

    const { error } = await supabase
      .from('condo_payment_reports')
      .update({
        status: 'confirmed',
        resulting_receipt_number: receiptNumber,
        resulting_payment_batch_id: allocation.payments.length > 0 ? batchId : null,
      })
      .eq('id', reportId);
    if (error) return { error: error.message };

    await logAudit(supabase, {
      userId,
      action: 'payment_report.confirm',
      entityType: 'payment_report',
      entityId: reportId,
    });

    revalidatePath('/pagos-reportados');
    revalidatePath('/pagos');
    revalidatePath('/cuotas');
    return { success: true };
  }

  const result = await applyPaymentAllocation(
    supabase,
    {
      house_id: report.house_id,
      currency: report.currency,
      amount_received: report.amount,
      payment_date: report.payment_date,
      reference: report.reference,
      notes: report.notes,
      installment_ids: report.installment_ids,
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

  const { error: updateError } = await supabase
    .from('condo_payment_reports')
    .update({
      status: 'confirmed',
      resulting_payment_batch_id: result.batchId,
      resulting_receipt_number: result.receiptNumber,
    })
    .eq('id', reportId);
  if (updateError) return { error: updateError.message };

  await logAudit(supabase, {
    userId,
    action: 'payment_report.confirm',
    entityType: 'payment_report',
    entityId: reportId,
  });

  revalidatePath('/pagos-reportados');
  revalidatePath('/pagos');
  revalidatePath('/cuotas');
  return { success: true };
}

/**
 * Screenshots live in a private Storage bucket with no storage.objects RLS
 * policy at all (see the migration's header comment) -- generate a
 * short-lived signed URL via the service-role client instead of adding one
 * for the admin's own cookie-based client. getUser() still gates who can
 * call this at all.
 */
export async function getReportScreenshotUrl(
  path: string,
  locale: string,
): Promise<{ error: string } | { success: true; url: string }> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError } = await requireAdmin(tc);
  if (authError) return { error: authError };

  const service = createServiceClient();
  const { data, error } = await service.storage.from('payment-report-screenshots').createSignedUrl(path, 60 * 5);
  if (error || !data) return { error: error?.message ?? tc('invalidData') };
  return { success: true, url: data.signedUrl };
}

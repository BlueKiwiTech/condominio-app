'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { applyPaymentAllocation } from '@/lib/payments/applyAllocation';
import { validateSpecialSelection } from '@/lib/payments/specialSelection';
import { logAudit } from '@/lib/audit';

// `onHold` (confirm only): the BCV rate for the report's date is missing, so the report was parked instead of confirmed.
type ActionResult = { error: string } | { success: true } | { success: true; onHold: true };
type Currency = 'USD' | 'Bs' | 'USDT';

type ReportForConfirm = {
  house_id: string;
  amount: number;
  currency: Currency;
  payment_date: string;
  reference: string | null;
  notes: string | null;
  installment_ids: string[];
  explicit_installments: boolean;
  status: 'pending' | 'on_hold' | 'confirmed' | 'rejected';
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
 * Just a status flag plus an optional note -- rejecting never created a
 * condo_payments row, so there's nothing to undo. `reason` is shown to the
 * resident in Mi Cartera (2026-09-29 business rule from Josi: a rejection
 * should carry a visible explanation, not just a silent status flip).
 */
export async function rejectPaymentReport(reportId: string, locale: string, reason: string | null): Promise<ActionResult> {
  const [tc, tr] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'paymentReports' }),
  ]);
  // The reason is mandatory (2026-09-29 business rule above): the resident sees it in Mi Cartera.
  const cleanReason = reason?.trim() ?? '';
  if (cleanReason.length < 3) return { error: tr('rejectReasonRequired') };
  if (cleanReason.length > 500) return { error: tr('rejectReasonTooLong') };
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  // Only a report still waiting on the admin can be rejected: pending, or on
  // hold for a missing rate. A confirmed one already registered a real payment.
  const { data: rejected, error } = await supabase
    .from('condo_payment_reports')
    .update({ status: 'rejected', rejection_reason: cleanReason })
    .eq('id', reportId)
    .in('status', ['pending', 'on_hold'])
    .select('id');
  if (error) return { error: await friendlyError(error) };
  // Someone else (or the release job) already took it out of the waiting states.
  if (!rejected || rejected.length === 0) return { error: tr('alreadyProcessed') };

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
 * Reuses the exact same allocation "Registrar pago" performs
 * (lib/payments/applyAllocation.ts's applyPaymentAllocation): oldest-cuota-
 * first, full-or-nothing, converting at the rate in effect on the report's
 * own "Fecha de abono" -- and capped to vencidas plus cuotas due within 30
 * days ahead, regardless of currency (lib/payments/allocate.ts's
 * filterEligibleForConversionWindow). Whatever doesn't get applied becomes
 * saldo a favor, to be converted later at whatever rate is in effect the
 * day it's actually drawn on (2026-09-29 business rule from Josi, extended
 * from Bs-only to all currencies 2026-10-01).
 *
 * If the report is TAGGED to specific cuotas (installment_ids non-empty --
 * legacy path, the resident-facing dialog stopped letting residents tag
 * cuotas as of 2026-09-18), those are the ids used. Every report submitted
 * today arrives untagged, so all of the house's currently pending
 * installments are fetched fresh and passed in instead -- same set
 * "Registrar pago" would auto-select for this house. Pre-existing wallet
 * credit in a DIFFERENT currency than this report is left untouched here;
 * it's picked up by the normal automatic sweep
 * (lib/payments/creditSweep.ts) the next time it applies, not blended in at
 * confirm time.
 */
export async function confirmPaymentReport(
  reportId: string,
  locale: string,
  selectedSpecialIds: string[] = [],
): Promise<ActionResult> {
  const [tc, tp, tv] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'payments' }),
    getTranslations({ locale, namespace: 'validation.payments' }),
  ]);
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { data: reportData, error: fetchError } = await supabase
    .from('condo_payment_reports')
    .select('house_id, amount, currency, payment_date, reference, notes, installment_ids, explicit_installments, status')
    .eq('id', reportId)
    .maybeSingle();
  if (fetchError) return { error: await friendlyError(fetchError) };
  const report = reportData as ReportForConfirm | null;
  if (!report) return { error: tc('invalidData') };
  if (report.status !== 'pending') return { error: tp('errors.reportAlreadyProcessed') };

  // Special cuotas the admin picked in the confirm dialog (change ajustes-21-oct): the
  // money goes to exactly those, oldest first, without the 30-day window. A selection a
  // held report kept (explicit_installments) applies when none is sent again. Validated
  // here, before anything is claimed or written.
  const selection =
    selectedSpecialIds.length > 0
      ? selectedSpecialIds
      : report.explicit_installments
        ? report.installment_ids
        : [];
  const explicit = selection.length > 0;
  if (explicit) {
    const check = await validateSpecialSelection(supabase, report.house_id, selection);
    if (!check.ok) return { error: tv('invalidSelection') };
  }

  // Reserve the report BEFORE applying the money. Two tabs (or a double click) confirming the
  // same report both pass the status check above; without this claim both would apply the
  // payment and the second would be recorded as an extra deposit. The claim uses the same
  // short lease (release_claimed_at) as the held-payment release: only one caller gets the
  // row, and a crashed one lets go after 10 minutes.
  const leaseExpired = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from('condo_payment_reports')
    .update({ release_claimed_at: new Date().toISOString() })
    .eq('id', reportId)
    .eq('status', 'pending')
    .or(`release_claimed_at.is.null,release_claimed_at.lt.${leaseExpired}`)
    .select('id');
  if (claimError) return { error: await friendlyError(claimError) };
  if (!claimed || claimed.length === 0) return { error: tp('errors.reportAlreadyProcessed') };
  const failAndRelease = async (message: string): Promise<ActionResult> => {
    await supabase.from('condo_payment_reports').update({ release_claimed_at: null }).eq('id', reportId).eq('status', 'pending');
    return { error: message };
  };

  let installmentIds = explicit ? selection : report.installment_ids;
  if (installmentIds.length === 0) {
    const { data: pendingRows, error: pendingFetchError } = await supabase
      .from('condo_installments')
      .select('id')
      .eq('house_id', report.house_id)
      .neq('status', 'paid')
      .is('deleted_at', null);
    if (pendingFetchError) return failAndRelease(await friendlyError(pendingFetchError));
    installmentIds = (pendingRows ?? []).map((r) => r.id as string);
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
      installment_ids: installmentIds,
      created_by: userId,
      explicit_installments: explicit,
    },
    {
      installmentsGone: tp('errors.installmentsGone'),
      mixedHouses: tp('errors.mixedHouses'),
      alreadyPaid: tp('errors.alreadyPaid'),
      insufficientAmount: tp('errors.insufficientAmount'),
      staleExchangeRate: tp('errors.staleExchangeRate'),
      concurrentPayment: tp('errors.concurrentPayment'),
    },
  );
  if ('error' in result) return failAndRelease(result.error);

  if ('onHold' in result) {
    // The BCV rate for this report's date isn't available (anymore): nothing was
    // written, and the admin isn't blocked -- the report waits as 'on_hold' and is
    // turned back into a normal 'pending' one when the rate arrives.
    const { error: holdError } = await supabase
      .from('condo_payment_reports')
      .update({
        status: 'on_hold',
        release_claimed_at: null,
        // Keep the admin's choice: it is applied when the report is confirmed again.
        ...(explicit ? { installment_ids: installmentIds, explicit_installments: true } : {}),
      })
      .eq('id', reportId)
      .eq('status', 'pending');
    if (holdError) return failAndRelease(await friendlyError(holdError));
    revalidatePath('/pagos-reportados');
    return { success: true, onHold: true };
  }

  const { error: updateError } = await supabase
    .from('condo_payment_reports')
    .update({
      status: 'confirmed',
      resulting_payment_batch_id: result.batchId,
      resulting_receipt_number: result.receiptNumber,
      release_claimed_at: null,
    })
    .eq('id', reportId);
  // The payment above is already applied, so the claim is kept if this write fails: the report
  // stays locked (not confirmable twice) until the lease expires, instead of paying again.
  if (updateError) return { error: await friendlyError(updateError) };

  await logAudit(supabase, {
    userId,
    action: 'payment_report.confirm',
    entityType: 'payment_report',
    entityId: reportId,
  });

  revalidatePath('/pagos-reportados');
  revalidatePath('/pagos');
  revalidatePath('/cuotas');
  revalidatePath('/dashboard');
  revalidatePath('/gastos');
  revalidatePath('/saldo-comunidad');
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
  if (error || !data) return { error: (error ? await friendlyError(error) : tc('invalidData')) };
  return { success: true, url: data.signedUrl };
}

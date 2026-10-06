'use server';

import { friendlyError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { applyPaymentAllocation } from '@/lib/payments/applyAllocation';
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
 * Just a status flag plus an optional note -- rejecting never created a
 * condo_payments row, so there's nothing to undo. `reason` is shown to the
 * resident in Mi Cartera (2026-09-29 business rule from Josi: a rejection
 * should carry a visible explanation, not just a silent status flip).
 */
export async function rejectPaymentReport(reportId: string, locale: string, reason: string | null): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase, userId } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from('condo_payment_reports')
    .update({ status: 'rejected', rejection_reason: reason?.trim() || null })
    .eq('id', reportId);
  if (error) return { error: await friendlyError(error) };

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
  if (fetchError) return { error: await friendlyError(fetchError) };
  const report = reportData as ReportForConfirm | null;
  if (!report) return { error: tc('invalidData') };
  if (report.status !== 'pending') return { error: tc('invalidData') };

  let installmentIds = report.installment_ids;
  if (installmentIds.length === 0) {
    const { data: pendingRows, error: pendingFetchError } = await supabase
      .from('condo_installments')
      .select('id')
      .eq('house_id', report.house_id)
      .neq('status', 'paid')
      .is('deleted_at', null);
    if (pendingFetchError) return { error: await friendlyError(pendingFetchError) };
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

  const { error: updateError } = await supabase
    .from('condo_payment_reports')
    .update({
      status: 'confirmed',
      resulting_payment_batch_id: result.batchId,
      resulting_receipt_number: result.receiptNumber,
    })
    .eq('id', reportId);
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

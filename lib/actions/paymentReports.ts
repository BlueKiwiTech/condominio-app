'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { applyPaymentAllocation } from '@/lib/payments/applyAllocation';

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
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase
    .from('condo_payment_reports')
    .update({ status: 'rejected' })
    .eq('id', reportId);
  if (error) return { error: error.message };

  revalidatePath('/pagos-reportados');
  return { success: true };
}

/**
 * Admin confirms a resident-submitted payment report. Unlike a plain status
 * flag, this actually registers the real payment -- the same allocation
 * "Registrar pago" performs (lib/actions/payments.ts's registerPayment),
 * reused here via lib/payments/applyAllocation.ts's applyPaymentAllocation,
 * fed with the report's OWN stored amount/currency/payment_date/reference/
 * notes/installment_ids instead of a freshly-submitted form. This means the
 * admin never re-types the same data twice, and the tagged cuota(s) actually
 * end up marked paid/partial with a real receipt number, instead of the
 * report being confirmed but silently going nowhere if the admin forgets the
 * separate manual step.
 *
 * If the resident didn't tag any cuotas (installment_ids is optional on
 * submission), there's nothing to allocate against -- condo_payments.
 * installment_id is NOT NULL -- so this falls back to the old plain
 * status-flag behavior; the admin has to register that one manually.
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
    const { error } = await supabase
      .from('condo_payment_reports')
      .update({ status: 'confirmed' })
      .eq('id', reportId);
    if (error) return { error: error.message };
    revalidatePath('/pagos-reportados');
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

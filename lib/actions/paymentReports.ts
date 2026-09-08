'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

type ActionResult = { error: string } | { success: true };

/** Network-verified — never getSession() as an authorization gate (CLAUDE.md). */
async function requireAdmin(tc: Awaited<ReturnType<typeof getTranslations>>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { error: tc('sessionExpired'), supabase: null };
  }
  return { error: null, supabase };
}

/**
 * Admin review of a resident-submitted payment report (see
 * lib/actions/residentPayments.ts / the condo_payment_reports migration).
 * Deliberately just a status flag -- it does NOT create a condo_payments
 * row or touch condo_installments/condo_house_credits. Confirming here
 * means "yes, I verified this against my bank statement"; the admin still
 * registers the actual payment through the existing "Registrar pago" flow.
 */
export async function updateReportStatus(
  reportId: string,
  status: 'confirmed' | 'rejected',
  locale: string,
): Promise<ActionResult> {
  const tc = await getTranslations({ locale, namespace: 'common' });
  const { error: authError, supabase } = await requireAdmin(tc);
  if (authError || !supabase) return { error: authError! };

  const { error } = await supabase.from('condo_payment_reports').update({ status }).eq('id', reportId);
  if (error) return { error: error.message };

  revalidatePath('/pagos-reportados');
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

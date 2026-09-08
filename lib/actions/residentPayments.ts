'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { getResidentSession } from '@/lib/auth/residentSession';
import { createServiceClient } from '@/lib/supabase/service';
import { reportPaymentSchema, type ReportPaymentInput } from '@/lib/validation/residentPayments';

type ActionResult = { error: string } | { success: true };

const SCREENSHOT_BUCKET = 'payment-report-screenshots';
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

/**
 * Resident self-service "I made a payment" report (user-requested,
 * admin-side deliberately untouched). Pattern A: no Supabase Auth session
 * for residents, so this is gated by the signed jose cookie
 * (getResidentSession) rather than getUser(), and every write goes through
 * the service-role client scoped by the SESSION's house_id -- never a
 * client-supplied one, so a resident can only ever report a payment against
 * their own house no matter what a tampered request claims.
 *
 * Deliberately does NOT touch condo_installments/condo_payments/
 * condo_house_credits -- see the condo_payment_reports migration's header
 * comment. This only records the claim for later admin review.
 *
 * `screenshot` is passed as a separate argument (not folded into `input`)
 * rather than switching the whole action to FormData -- Next.js Server
 * Actions serialize a `File` argument natively, so the JSON-shaped fields
 * keep going through the existing zod schema unchanged.
 */
export async function reportPayment(
  input: ReportPaymentInput,
  locale: string,
  screenshot?: File | null,
): Promise<ActionResult> {
  const [tv, tc] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.residentPayments' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);
  const parsed = reportPaymentSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };
  const data = parsed.data;

  const session = await getResidentSession();
  if (!session) return { error: tc('sessionExpired') };

  const supabase = createServiceClient();

  // The selected cuotas are purely informational (helps the admin match
  // this report up later) -- still re-verified against this house's own
  // unpaid installments rather than trusted at face value.
  let verifiedInstallmentIds: string[] = [];
  if (data.installment_ids.length > 0) {
    const { data: rows } = await supabase
      .from('condo_installments')
      .select('id')
      .eq('house_id', session.house_id)
      .neq('status', 'paid')
      .in('id', data.installment_ids);
    verifiedInstallmentIds = (rows ?? []).map((r) => r.id as string);
  }

  let screenshotPath: string | null = null;
  if (screenshot && screenshot.size > 0) {
    if (!screenshot.type.startsWith('image/')) return { error: tv('invalidFileType') };
    if (screenshot.size > MAX_SCREENSHOT_BYTES) return { error: tv('fileTooLarge') };
    const ext = screenshot.name.includes('.') ? screenshot.name.split('.').pop() : 'jpg';
    const path = `${session.house_id}/${Date.now()}-${randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(SCREENSHOT_BUCKET)
      .upload(path, screenshot, { contentType: screenshot.type });
    if (uploadError) return { error: uploadError.message };
    screenshotPath = path;
  }

  const { error } = await supabase.from('condo_payment_reports').insert({
    house_id: session.house_id,
    amount: data.amount,
    currency: data.currency,
    payment_date: data.payment_date,
    reference: data.reference || null,
    notes: data.notes || null,
    installment_ids: verifiedInstallmentIds,
    screenshot_path: screenshotPath,
  });
  if (error) return { error: error.message };

  revalidatePath('/mi-hogar');
  return { success: true };
}

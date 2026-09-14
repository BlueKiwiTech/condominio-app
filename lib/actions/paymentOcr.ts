'use server';

import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { extractPaymentFieldsFromScreenshot, type ExtractedPayment } from '@/lib/payments/screenshotExtraction';

type ActionResult = { error: string } | { success: true; data: ExtractedPayment };

// Same admin gate as lib/actions/payments.ts's requireAdmin -- network-verified
// getUser(), never getSession() (CLAUDE.md).
async function requireAdmin(tc: Awaited<ReturnType<typeof getTranslations>>) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { error: tc('sessionExpired') };
  return { error: null };
}

/**
 * Admin convenience: OCR-prefills the payment form from a screenshot of a
 * bank transfer confirmation (Pagomóvil, Mercantil, Bancamiga, etc.) --
 * user-requested. Never writes anything; the admin still reviews/edits every
 * prefilled field in PaymentFormClient before calling registerPayment.
 * Extraction itself lives in lib/payments/screenshotExtraction.ts, shared with
 * the resident-side equivalent in lib/actions/residentPaymentOcr.ts.
 */
export async function extractPaymentFromScreenshot(screenshot: File, locale: string): Promise<ActionResult> {
  const [tc, tp] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'payments.new.ocr' }),
  ]);
  const { error: authError } = await requireAdmin(tc);
  if (authError) return { error: authError };

  const result = await extractPaymentFieldsFromScreenshot(screenshot);
  if ('errorCode' in result) return { error: tp(result.errorCode) };
  return { success: true, data: result.data };
}

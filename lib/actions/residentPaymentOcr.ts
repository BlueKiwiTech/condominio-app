'use server';

import { getTranslations } from 'next-intl/server';
import { getResidentSession } from '@/lib/auth/residentSession';
import { extractPaymentFieldsFromScreenshot, type ExtractedPayment } from '@/lib/payments/screenshotExtraction';

type ActionResult = { error: string } | { success: true; data: ExtractedPayment };

/**
 * Resident-side counterpart to lib/actions/paymentOcr.ts -- OCR-prefills
 * ReportPaymentDialog's fields from the screenshot the resident is already
 * attaching to their self-report. Gated by the resident's signed session
 * cookie (Pattern A, no Supabase Auth for residents), not requireAdmin.
 * Never writes anything; reportPayment (residentPayments.ts) is still the
 * only thing that submits the report, using whatever the resident confirms.
 */
export async function extractResidentPaymentFromScreenshot(screenshot: File, locale: string): Promise<ActionResult> {
  const [tc, tr] = await Promise.all([
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'residentHome.reportPaymentDialog' }),
  ]);
  const session = await getResidentSession();
  if (!session) return { error: tc('sessionExpired') };

  const result = await extractPaymentFieldsFromScreenshot(screenshot);
  if ('errorCode' in result) return { error: tr(result.errorCode) };
  return { success: true, data: result.data };
}

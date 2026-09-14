import { generateText, Output } from 'ai';
import { z } from 'zod';
import { currencySchema } from '@/lib/validation/cuotas';

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export type ExtractedPayment = {
  amount: number | null;
  currency: z.infer<typeof currencySchema> | null;
  payment_date: string | null;
  reference: string | null;
  notes: string | null;
};

export type ScreenshotExtractionErrorCode = 'invalidFileType' | 'fileTooLarge' | 'extractFailed';

const extractionSchema = z.object({
  amount: z.number().nullable().describe('The payment/transfer amount, as a plain number (no thousands separators).'),
  currency: currencySchema
    .nullable()
    .describe(
      "'Bs' for Venezuelan bolívares (Bs., bolívares, transfers between Venezuelan banks like BDV/Mercantil/Bancamiga), " +
        "'USDT' only if the screenshot is explicitly a Binance/crypto/USDT transfer, 'USD' for cash dollars.",
    ),
  payment_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .describe('The payment date converted to YYYY-MM-DD. Venezuelan receipts show DD/MM/YYYY -- do not confuse day and month.'),
  reference: z
    .string()
    .nullable()
    .describe('The operation/reference/transaction number shown on the receipt (e.g. "Nro. de referencia", "Operación", "Numero de referencia").'),
  notes: z.string().nullable().describe('The "Concepto" / payment description text, if shown. Null if none.'),
});

/**
 * Shared by lib/actions/paymentOcr.ts (admin) and lib/actions/residentPaymentOcr.ts
 * (resident self-report) -- same model/schema either way, only the auth gate
 * and translation namespace differ per caller. Uses the cheapest paid vision
 * model on Vercel AI Gateway (amazon/nova-lite): a wrong extraction is always
 * a plain wrong prefill a human reviews before anything is written, never a
 * silent write, so cost was prioritized over accuracy (user decision, 2026-09-13).
 */
export async function extractPaymentFieldsFromScreenshot(
  screenshot: File,
): Promise<{ data: ExtractedPayment } | { errorCode: ScreenshotExtractionErrorCode }> {
  if (!screenshot.type.startsWith('image/')) return { errorCode: 'invalidFileType' };
  if (screenshot.size > MAX_SCREENSHOT_BYTES) return { errorCode: 'fileTooLarge' };

  const buffer = Buffer.from(await screenshot.arrayBuffer());

  try {
    const { output } = await generateText({
      model: 'amazon/nova-lite',
      output: Output.object({ schema: extractionSchema }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                'This is a screenshot of a Venezuelan bank payment/transfer confirmation. ' +
                'Extract the payment fields as structured data. Use null for any field not present in the image.',
            },
            { type: 'file', mediaType: screenshot.type, data: buffer },
          ],
        },
      ],
    });
    return { data: output };
  } catch {
    return { errorCode: 'extractFailed' };
  }
}

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
  // Deliberately NOT asking the model to convert this to ISO itself -- a real
  // test against BDV/Mercantil/Bancamiga screenshots (2026-09-14) showed
  // amazon/nova-lite silently swaps day/month on 2 of 3 receipts even with an
  // explicit "don't confuse day and month" instruction (e.g. reads
  // "02/09/2026" and outputs "2026-02-09"). Asking it to only transcribe the
  // digits it sees, then parsing those digits ourselves with parseVenezuelanDate
  // below, removes the date-math step that was actually failing.
  payment_date_raw: z
    .string()
    .nullable()
    .describe(
      'The payment date exactly as printed on the receipt, transcribed digit-for-digit (e.g. "02/09/2026" or "02/09/26 10:11 am") -- do not reformat or reorder it.',
    ),
  reference: z
    .string()
    .nullable()
    .describe('The operation/reference/transaction number shown on the receipt (e.g. "Nro. de referencia", "Operación", "Numero de referencia").'),
  notes: z.string().nullable().describe('The "Concepto" / payment description text, if shown. Null if none.'),
});

// Venezuelan receipts are consistently DD/MM/YYYY (or DD/MM/YY) -- parsed
// deterministically here instead of trusting the model's own date-math (see
// the schema comment above for why). Returns null if the raw text doesn't
// match the expected shape, leaving payment_date null for the human reviewer
// to fill in rather than guessing.
export function parseVenezuelanDate(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) return null;
  const [, dd, mm, yy] = match;
  const day = Number(dd);
  const month = Number(mm);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

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
    const { payment_date_raw, ...rest } = output;
    return { data: { ...rest, payment_date: parseVenezuelanDate(payment_date_raw) } };
  } catch {
    return { errorCode: 'extractFailed' };
  }
}

import { z } from 'zod';
import { currencySchema } from './cuotas';

// Same factory pattern as lib/validation/payments.ts, scoped to the
// `validation.communityBalance` messages namespace.
type Translator = (key: string) => string;

// numeric(14,2) holds up to 999.999.999.999,99
const MAX_AMOUNT = 999_999_999_999;

/** Amounts are stored with 2 decimals; round first so "0.004" can't slip through as a non-zero amount. */
const cents = (n: number) => Math.round(Number((n * 100).toPrecision(15))) / 100;

export function openingBalanceSchema(t: Translator) {
  return z.object({
    currency: currencySchema,
    amount: z.coerce
      .number(t('amountInvalid'))
      .refine((n) => Number.isFinite(n) && cents(n) > 0 && n <= MAX_AMOUNT, t('amountPositive'))
      .transform(cents),
  });
}
export type OpeningBalanceInput = z.input<ReturnType<typeof openingBalanceSchema>>;

export function adjustmentSchema(t: Translator) {
  return z.object({
    currency: currencySchema,
    amount: z.coerce
      .number(t('amountInvalid'))
      .refine((n) => Number.isFinite(n) && cents(n) !== 0 && Math.abs(n) <= MAX_AMOUNT, t('amountNonZero'))
      .transform(cents),
    note: z.string().trim().min(1, t('noteRequired')).max(300, t('noteTooLong')),
  });
}
export type AdjustmentInput = z.input<ReturnType<typeof adjustmentSchema>>;

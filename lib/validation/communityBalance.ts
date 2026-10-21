import { z } from 'zod';
import { currencySchema } from './cuotas';
import { MAX_AMOUNT, hasAtMostTwoDecimals, positiveAmount } from './money';

// Same factory pattern as lib/validation/payments.ts, scoped to the
// `validation.communityBalance` messages namespace.
type Translator = (key: string) => string;

export function openingBalanceSchema(t: Translator) {
  return z.object({
    currency: currencySchema,
    amount: positiveAmount(t),
  });
}
export type OpeningBalanceInput = z.input<ReturnType<typeof openingBalanceSchema>>;

export function adjustmentSchema(t: Translator) {
  return z.object({
    currency: currencySchema,
    amount: z.coerce
      .number(t('amountInvalid'))
      .refine((n) => Number.isFinite(n) && n !== 0, t('amountNonZero'))
      .refine((n) => Math.abs(n) <= MAX_AMOUNT, t('amountTooLarge'))
      .refine(hasAtMostTwoDecimals, t('amountDecimals')),
    note: z.string().trim().min(1, t('noteRequired')).max(300, t('noteTooLong')),
  });
}
export type AdjustmentInput = z.input<ReturnType<typeof adjustmentSchema>>;

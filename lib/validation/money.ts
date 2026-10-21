import { z } from 'zod';

// Shared rules for every typed money amount (QA round 1): a ceiling that fits
// numeric(12,2)/numeric(14,2) with room to spare, and at most 2 decimals, so an
// amount is never silently rounded or sent to the database to fail with a
// generic error. Each messages namespace that uses these needs the keys
// `amountPositive`, `amountTooLarge` and `amountDecimals`.
type Translator = (key: string) => string;

export const MAX_AMOUNT = 999_999_999_999;

/** True when the number has at most 2 decimals (exact: a typed amount round-trips through toFixed(2); no float-noise tolerance that breaks on large amounts). */
export const hasAtMostTwoDecimals = (n: number): boolean => Number.isFinite(n) && Number(n.toFixed(2)) === n;

/** A typed amount that must be greater than zero. */
export function positiveAmount(t: Translator) {
  return z.coerce
    .number()
    .positive(t('amountPositive'))
    .max(MAX_AMOUNT, t('amountTooLarge'))
    .refine(hasAtMostTwoDecimals, t('amountDecimals'));
}

/** A typed amount that may be zero (e.g. a payment funded only by existing credit). */
export function nonNegativeAmount(t: Translator) {
  return z.coerce
    .number()
    .nonnegative(t('amountPositive'))
    .max(MAX_AMOUNT, t('amountTooLarge'))
    .refine(hasAtMostTwoDecimals, t('amountDecimals'));
}

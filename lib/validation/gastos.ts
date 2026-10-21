import { z } from 'zod';
import { positiveAmount, MAX_AMOUNT } from './money';

// Factory pattern scoped to the `validation.gastos` messages namespace —
// same shape as lib/validation/cuotas.ts.
type Translator = (key: string) => string;

export const currencySchema = z.enum(['USD', 'Bs', 'USDT']);
export const cadenceSchema = z.enum(['weekly', 'biweekly', 'monthly', 'quarterly', 'annual']);
export type Currency = z.infer<typeof currencySchema>;
export type Cadence = z.infer<typeof cadenceSchema>;

function isoDate(t: Translator) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('invalidDate'));
}

function sharedFields(t: Translator) {
  return {
    name: z.string().trim().min(1, t('nameRequired')).max(120, t('nameTooLong')),
    category_id: z.string().uuid(t('categoryRequired')),
    provider: z.string().trim().max(120, t('providerTooLong')).optional(),
    currency: currencySchema,
    // decimal(12,2) in the DB. For kind='fixed' this is the per-period seed
    // amount, copied as-is into each new instance. For kind='variable' it's
    // the TOTAL the admin expects `amounts` (below) to sum to — the admin
    // enters each installment's amount directly (not necessarily equal),
    // validated against this total by createExpenseTemplateSchema's refine.
    default_amount: positiveAmount(t),
    start_date: isoDate(t),
  };
}

export function fixedExpenseTemplateSchema(t: Translator) {
  return z.object({
    kind: z.literal('fixed'),
    ...sharedFields(t),
    cadence: cadenceSchema,
  });
}
export type FixedExpenseTemplateInput = z.infer<ReturnType<typeof fixedExpenseTemplateSchema>>;

export function variableExpenseTemplateSchema(t: Translator) {
  return z.object({
    kind: z.literal('variable'),
    ...sharedFields(t),
    // Cadence between installment due dates — admin-chosen, same options as
    // a fixed gasto's cadence (previously hardcoded to monthly). Only used
    // to compute the baseline preview/fallback dates; the actual
    // period_dates below are what's authoritative once the admin can edit
    // them individually.
    cadence: cadenceSchema,
    installment_count: z.coerce.number().int().min(1, t('minInstallments')).max(360, t('maxInstallments')),
    // One amount per installment, admin-entered -- not necessarily equal,
    // must sum to default_amount (checked below, once the union is built,
    // since a discriminated union member must stay a plain ZodObject).
    amounts: z.array(positiveAmount(t)).min(1, t('minInstallments')),
    // Admin-entered (or baseline, left untouched) per-installment period
    // dates, individually overridable in the form. Required to have exactly
    // `installment_count` entries, same as `amounts` above -- unlike
    // cuotas' due_dates, these must also be pairwise distinct: condo_expenses
    // has a (template_id, period_date) unique constraint, so two identical
    // dates would silently drop one row on insert (ignoreDuplicates).
    period_dates: z.array(isoDate(t)).min(1, t('minInstallments')),
  });
}
export type VariableExpenseTemplateInput = z.infer<ReturnType<typeof variableExpenseTemplateSchema>>;

export function createExpenseTemplateSchema(t: Translator) {
  return z
    .discriminatedUnion('kind', [fixedExpenseTemplateSchema(t), variableExpenseTemplateSchema(t)])
    .refine((data) => data.kind !== 'variable' || data.amounts.length === data.installment_count, {
      message: t('minInstallments'),
      path: ['amounts'],
    })
    .refine(
      (data) =>
        data.kind !== 'variable' ||
        Math.round(data.amounts.reduce((sum, a) => sum + a, 0) * 100) === Math.round(data.default_amount * 100),
      { message: t('amountsSumMismatch'), path: ['amounts'] },
    )
    .refine((data) => data.kind !== 'variable' || data.period_dates.length === data.installment_count, {
      message: t('minInstallments'),
      path: ['period_dates'],
    })
    .refine(
      (data) => data.kind !== 'variable' || new Set(data.period_dates).size === data.period_dates.length,
      { message: t('duplicateDates'), path: ['period_dates'] },
    );
}
export type CreateExpenseTemplateInput = z.infer<ReturnType<typeof createExpenseTemplateSchema>>;

export function createExpenseCategorySchema(t: Translator) {
  return z.object({
    name: z.string().trim().min(1, t('categoryNameRequired')),
  });
}
export type CreateExpenseCategoryInput = z.infer<ReturnType<typeof createExpenseCategorySchema>>;

export function markExpensePaidSchema(t: Translator) {
  return z
    .object({
      amount: positiveAmount(t),
      paid_date: isoDate(t),
      notes: z.string().trim().max(500, t('notesTooLong')).optional(),
      // Currency the expense is paid in (defaults to the expense's own).
      // markExpensePaid checks it against the stored currency, which the
      // schema can't see: USDT expenses are always paid in USDT.
      payment_currency: z.enum(['USD', 'Bs']).optional(),
      // What was actually paid, in payment_currency. Prefilled from the rate
      // but editable, so it is only validated as a positive number.
      paid_amount: z.number().positive(t('paidAmountPositive')).max(MAX_AMOUNT, t('amountTooLarge')).optional(),
      // Required (by markExpensePaid) when either currency is Bs. bcv/eur are
      // resolved server-side from the stored rates; only a custom rate
      // travels from the client.
      exchange_rate_type: z.enum(['bcv', 'eur', 'custom']).optional(),
      custom_rate: z.number().positive(t('customRatePositive')).max(1_000_000, t('customRateTooLarge')).optional(),
    })
    .refine((v) => v.exchange_rate_type !== 'custom' || v.custom_rate !== undefined, {
      message: t('customRateRequired'),
      path: ['custom_rate'],
    });
}
export type MarkExpensePaidInput = z.infer<ReturnType<typeof markExpensePaidSchema>>;

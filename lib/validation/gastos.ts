import { z } from 'zod';

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
    name: z.string().trim().min(1, t('nameRequired')),
    category_id: z.string().uuid(t('categoryRequired')),
    provider: z.string().trim().optional(),
    currency: currencySchema,
    // decimal(12,2) in the DB. For kind='fixed' this is the per-period seed
    // amount, copied as-is into each new instance. For kind='variable' it's
    // the TOTAL the admin expects `amounts` (below) to sum to — the admin
    // enters each installment's amount directly (not necessarily equal),
    // validated against this total by createExpenseTemplateSchema's refine.
    default_amount: z.coerce.number().positive(t('amountPositive')),
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
    installment_count: z.coerce.number().int().min(1, t('minInstallments')).max(360, t('maxInstallments')),
    // One amount per installment, admin-entered -- not necessarily equal,
    // must sum to default_amount (checked below, once the union is built,
    // since a discriminated union member must stay a plain ZodObject).
    amounts: z.array(z.coerce.number().positive(t('amountPositive'))).min(1, t('minInstallments')),
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
    );
}
export type CreateExpenseTemplateInput = z.infer<ReturnType<typeof createExpenseTemplateSchema>>;

export function markExpensePaidSchema(t: Translator) {
  return z.object({
    amount: z.coerce.number().positive(t('amountPositive')),
    paid_date: isoDate(t),
    notes: z.string().trim().optional(),
  });
}
export type MarkExpensePaidInput = z.infer<ReturnType<typeof markExpensePaidSchema>>;

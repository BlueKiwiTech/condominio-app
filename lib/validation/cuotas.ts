import { z } from 'zod';

// See lib/validation/auth.ts's header comment — same factory pattern,
// scoped to the `validation.cuotas` messages namespace.
type Translator = (key: string) => string;

export const currencySchema = z.enum(['USD', 'Bs', 'USDT']);
export const cadenceSchema = z.enum(['weekly', 'monthly', 'annual']);
export type Currency = z.infer<typeof currencySchema>;
export type Cadence = z.infer<typeof cadenceSchema>;

function isoDate(t: Translator) {
  return z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('invalidDate'));
}

function sharedFields(t: Translator) {
  return {
    name: z.string().trim().min(1, t('nameRequired')),
    description: z.string().trim().optional(),
    currency: currencySchema,
    // decimal(12,2) in the DB — validated as a positive number here, rounded
    // to cents at generation time (lib/cuotas/generate.ts's splitAmount et al.).
    amount: z.coerce.number().positive(t('amountPositive')),
    start_date: isoDate(t),
    // Empty = "Todas" (all houses at creation time — snapshotted, per PLAN.md
    // Phase 4 decision that a template's house scope is fixed at creation).
    applicable_houses: z.array(z.string().uuid()).default([]),
  };
}

export function recurringTemplateSchema(t: Translator) {
  return z.object({
    installment_type: z.literal('recurring'),
    ...sharedFields(t),
    cadence: cadenceSchema,
    number_of_installments: z.coerce
      .number()
      .int()
      .min(1, t('minInstallments'))
      .max(360, t('maxInstallments')),
  });
}
export type RecurringTemplateInput = z.infer<ReturnType<typeof recurringTemplateSchema>>;

export function specialTemplateSchema(t: Translator) {
  return z.object({
    installment_type: z.literal('special'),
    ...sharedFields(t),
    is_divided: z.boolean().default(false),
    number_of_installments: z.coerce.number().int().min(1).max(360).default(1),
  });
}
export type SpecialTemplateInput = z.infer<ReturnType<typeof specialTemplateSchema>>;

export function createTemplateSchema(t: Translator) {
  return z.discriminatedUnion('installment_type', [
    recurringTemplateSchema(t),
    specialTemplateSchema(t),
  ]);
}
export type CreateTemplateInput = z.infer<ReturnType<typeof createTemplateSchema>>;

// Edit is intentionally narrow (PLAN.md Phase 4 decision: editing a template
// "updates all unpaid future installments"; structural fields — cadence,
// start date, installment count, house targeting — are NOT editable after
// creation to avoid re-deriving/reconciling already-generated rows. Deleting
// and recreating covers that case, same as the locked "new houses joining"
// decision already treats re-creation as the answer).
export function updateTemplateSchema(t: Translator) {
  return z.object({
    name: z.string().trim().min(1, t('nameRequired')),
    description: z.string().trim().optional(),
    currency: currencySchema,
    amount: z.coerce.number().positive(t('amountPositive')),
  });
}
export type UpdateTemplateInput = z.infer<ReturnType<typeof updateTemplateSchema>>;

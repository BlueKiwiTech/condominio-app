import { z } from 'zod';

export const currencySchema = z.enum(['USD', 'Bs', 'USDT']);
export const cadenceSchema = z.enum(['weekly', 'monthly', 'annual']);
export type Currency = z.infer<typeof currencySchema>;
export type Cadence = z.infer<typeof cadenceSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.');

const sharedFields = {
  name: z.string().trim().min(1, 'La descripción es obligatoria.'),
  description: z.string().trim().optional(),
  currency: currencySchema,
  // decimal(12,2) in the DB — validated as a positive number here, rounded to
  // cents at generation time (lib/cuotas/generate.ts's splitAmount et al.).
  amount: z.coerce.number().positive('El monto debe ser mayor a 0.'),
  start_date: isoDate,
  // Empty = "Todas" (all houses at creation time — snapshotted, per PLAN.md
  // Phase 4 decision that a template's house scope is fixed at creation).
  applicable_houses: z.array(z.string().uuid()).default([]),
};

export const recurringTemplateSchema = z.object({
  installment_type: z.literal('recurring'),
  ...sharedFields,
  cadence: cadenceSchema,
  number_of_installments: z.coerce
    .number()
    .int()
    .min(1, 'Debe haber al menos 1 cuota.')
    .max(360, 'Número de cuotas demasiado alto.'),
});
export type RecurringTemplateInput = z.infer<typeof recurringTemplateSchema>;

export const specialTemplateSchema = z.object({
  installment_type: z.literal('special'),
  ...sharedFields,
  is_divided: z.boolean().default(false),
  number_of_installments: z.coerce.number().int().min(1).max(360).default(1),
});
export type SpecialTemplateInput = z.infer<typeof specialTemplateSchema>;

export const createTemplateSchema = z.discriminatedUnion('installment_type', [
  recurringTemplateSchema,
  specialTemplateSchema,
]);
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

// Edit is intentionally narrow (PLAN.md Phase 4 decision: editing a template
// "updates all unpaid future installments"; structural fields — cadence,
// start date, installment count, house targeting — are NOT editable after
// creation to avoid re-deriving/reconciling already-generated rows. Deleting
// and recreating covers that case, same as the locked "new houses joining"
// decision already treats re-creation as the answer).
export const updateTemplateSchema = z.object({
  name: z.string().trim().min(1, 'La descripción es obligatoria.'),
  description: z.string().trim().optional(),
  currency: currencySchema,
  amount: z.coerce.number().positive('El monto debe ser mayor a 0.'),
});
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

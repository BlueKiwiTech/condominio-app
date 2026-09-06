import { z } from 'zod';
import { currencySchema } from './cuotas';

// See lib/validation/auth.ts's header comment — same factory pattern,
// scoped to the `validation.payments` messages namespace.
type Translator = (key: string) => string;

export function registerPaymentSchema(t: Translator) {
  return z.object({
    house_id: z.string().uuid(t('houseRequired')),
    installment_ids: z.array(z.string().uuid()).min(1, t('installmentsRequired')),
    currency: currencySchema,
    // decimal(12,2) in the DB — validated as a positive number here, cents-safe
    // allocation happens in lib/payments/allocate.ts.
    amount_received: z.coerce.number().positive(t('amountPositive')),
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('invalidDate')),
    reference: z.string().trim().max(120, t('referenceTooLong')).optional(),
    notes: z.string().trim().max(500, t('notesTooLong')).optional(),
  });
}
export type RegisterPaymentInput = z.infer<ReturnType<typeof registerPaymentSchema>>;

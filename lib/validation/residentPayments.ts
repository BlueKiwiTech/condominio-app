import { z } from 'zod';
import { currencySchema } from './cuotas';

// See lib/validation/auth.ts's header comment — same factory pattern,
// scoped to the `validation.residentPayments` messages namespace.
type Translator = (key: string) => string;

// house_id is intentionally NOT a field here -- it always comes from the
// resident's own signed session server-side (lib/actions/residentPayments.ts),
// never from client input, so there's nothing to validate or trust.
export function reportPaymentSchema(t: Translator) {
  return z.object({
    amount: z.coerce.number().positive(t('amountPositive')),
    currency: currencySchema,
    payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, t('invalidDate')),
    reference: z.string().trim().max(120, t('referenceTooLong')).optional(),
    notes: z.string().trim().max(500, t('notesTooLong')).optional(),
    installment_ids: z.array(z.string().uuid()).default([]),
  });
}
export type ReportPaymentInput = z.infer<ReturnType<typeof reportPaymentSchema>>;

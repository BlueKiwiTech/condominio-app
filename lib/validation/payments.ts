import { z } from 'zod';
import { currencySchema } from './cuotas';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida.');

export const registerPaymentSchema = z.object({
  house_id: z.string().uuid('Selecciona una casa.'),
  installment_ids: z.array(z.string().uuid()).min(1, 'Selecciona al menos una cuota.'),
  currency: currencySchema,
  // decimal(12,2) in the DB — validated as a positive number here, cents-safe
  // allocation happens in lib/payments/allocate.ts.
  amount_received: z.coerce.number().positive('El monto recibido debe ser mayor a 0.'),
  payment_date: isoDate,
  reference: z.string().trim().max(120, 'La referencia es demasiado larga.').optional(),
  notes: z.string().trim().max(500, 'Las notas son demasiado largas.').optional(),
});
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

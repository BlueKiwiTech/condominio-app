import { z } from 'zod';

export const residentLoginSchema = z.object({
  house_number: z.string().trim().min(1, 'Selecciona tu casa.'),
  pin: z.string().regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos.'),
});
export type ResidentLoginInput = z.infer<typeof residentLoginSchema>;

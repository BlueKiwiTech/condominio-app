import { z } from 'zod';

const pinField = z
  .string()
  .regex(/^\d{4}$/, 'El PIN debe tener 4 dígitos.');

const houseFields = {
  house_number: z.string().trim().min(1, 'El número de casa es obligatorio.'),
  house_name: z.string().trim().optional(),
  owner_name: z.string().trim().optional(),
  owner_phone: z.string().trim().optional(),
  owner_email: z
    .string()
    .trim()
    .email('Correo inválido.')
    .optional()
    .or(z.literal('')),
};

// Create: PIN is required — a house without a PIN can never be logged into.
export const createHouseSchema = z.object({
  ...houseFields,
  pin: pinField,
});
export type CreateHouseInput = z.infer<typeof createHouseSchema>;

// Edit: PIN is optional — blank means "keep the current PIN" (admin-only
// reset decision, PLAN.md Phase 3: no resident self-service PIN change).
export const updateHouseSchema = z.object({
  ...houseFields,
  pin: pinField.optional().or(z.literal('')),
});
export type UpdateHouseInput = z.infer<typeof updateHouseSchema>;

export const residentSchema = z.object({
  resident_name: z.string().trim().min(1, 'El nombre es obligatorio.'),
  resident_phone: z.string().trim().optional(),
});
export type ResidentInput = z.infer<typeof residentSchema>;

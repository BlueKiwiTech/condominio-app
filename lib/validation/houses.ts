import { z } from 'zod';

// See lib/validation/auth.ts's header comment — same factory pattern,
// scoped to the `validation.houses` messages namespace.
type Translator = (key: string) => string;

function pinField(t: Translator) {
  return z.string().regex(/^\d{4}$/, t('pinFormat'));
}

function houseFields(t: Translator) {
  return {
    house_number: z.string().trim().min(1, t('houseNumberRequired')),
    house_name: z.string().trim().optional(),
    owner_name: z.string().trim().optional(),
    owner_phone: z.string().trim().optional(),
    owner_email: z
      .string()
      .trim()
      .email(t('invalidEmail'))
      .optional()
      .or(z.literal('')),
  };
}

// Create: PIN is required — a house without a PIN can never be logged into.
export function createHouseSchema(t: Translator) {
  return z.object({
    ...houseFields(t),
    pin: pinField(t),
  });
}
export type CreateHouseInput = z.infer<ReturnType<typeof createHouseSchema>>;

// Edit: PIN is optional — blank means "keep the current PIN" (admin-only
// reset decision, PLAN.md Phase 3: no resident self-service PIN change).
export function updateHouseSchema(t: Translator) {
  return z.object({
    ...houseFields(t),
    pin: pinField(t).optional().or(z.literal('')),
  });
}
export type UpdateHouseInput = z.infer<ReturnType<typeof updateHouseSchema>>;

export function residentSchema(t: Translator) {
  return z.object({
    resident_name: z.string().trim().min(1, t('residentNameRequired')),
    resident_phone: z.string().trim().optional(),
  });
}
export type ResidentInput = z.infer<ReturnType<typeof residentSchema>>;

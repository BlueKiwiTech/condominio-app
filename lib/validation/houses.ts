import { z } from 'zod';

// See lib/validation/auth.ts's header comment — same factory pattern,
// scoped to the `validation.houses` messages namespace.
type Translator = (key: string) => string;

function pinField(t: Translator) {
  return z.string().regex(/^\d{4}$/, t('pinFormat'));
}

const PHONE = /^[0-9+()\-\s.]{6,25}$/;

function houseFields(t: Translator) {
  return {
    house_number: z.string().trim().min(1, t('houseNumberRequired')).max(20, t('houseNumberTooLong')),
    house_name: z.string().trim().max(100, t('nameTooLong')).optional(),
    owner_name: z.string().trim().max(100, t('nameTooLong')).optional(),
    owner_phone: z
      .string()
      .trim()
      .refine((v) => v === '' || PHONE.test(v), t('phoneInvalid'))
      .optional(),
    owner_email: z
      .string()
      .trim()
      .email(t('invalidEmail'))
      .optional()
      .or(z.literal('')),
    // Extra numbers beyond owner_phone (the "primary" phone, unchanged) --
    // stored in condo_house_phones, a child table like condo_house_residents.
    // .optional() only (no .default()) -- a default() here would make this
    // field's zod input/output types diverge, which breaks react-hook-form's
    // zodResolver typing against the other fields' input===output shape.
    extra_phones: z.array(z.object({ phone: z.string().trim().min(1, t('phoneRequired')).regex(PHONE, t('phoneInvalid')) })).optional(),
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

import { z } from 'zod';

// See lib/validation/auth.ts's header comment — same factory pattern,
// scoped to the `validation.residentAuth` messages namespace.
type Translator = (key: string) => string;

export function residentLoginSchema(t: Translator) {
  return z.object({
    house_number: z.string().trim().min(1, t('houseRequired')),
    pin: z.string().regex(/^\d{4}$/, t('pinFormat')),
  });
}
export type ResidentLoginInput = z.infer<ReturnType<typeof residentLoginSchema>>;

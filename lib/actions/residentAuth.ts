'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createResidentSession, clearResidentSession } from '@/lib/auth/residentSession';
import { residentLoginSchema, type ResidentLoginInput } from '@/lib/validation/residentAuth';

type ActionResult = { error: string } | void;

type VerifyPinResult = {
  success: boolean;
  reason?: 'not_found' | 'no_pin' | 'locked' | 'invalid';
  house_id?: string;
  locked_until?: string;
  attempts_remaining?: number;
};

export async function residentLogin(input: ResidentLoginInput, locale: string): Promise<ActionResult> {
  const [tv, tc, tr] = await Promise.all([
    getTranslations({ locale, namespace: 'validation.residentAuth' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'residentAuth' }),
  ]);
  const parsed = residentLoginSchema(tv).safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? tc('invalidData') };

  // Service-role client: residents never get a Supabase Auth session (Pattern
  // A, PLAN.md Phase 3), so this verification happens entirely server-side
  // against the service-role client, never the anon key.
  const service = createServiceClient();

  const { data, error } = await service.rpc('condo_verify_house_pin', {
    p_house_number: parsed.data.house_number,
    p_pin: parsed.data.pin,
  });
  if (error) return { error: tr('errors.verifyFailed') };

  const result = data as VerifyPinResult;

  if (!result.success) {
    if (result.reason === 'locked') {
      return { error: tr('errors.locked') };
    }
    if (result.reason === 'not_found' || result.reason === 'no_pin') {
      return { error: tr('errors.invalidCredentials') };
    }
    const remaining = result.attempts_remaining;
    return {
      error:
        typeof remaining === 'number'
          ? tr('errors.wrongPinAttempts', { remaining })
          : tr('errors.wrongPin'),
    };
  }

  await createResidentSession(result.house_id!);
  redirect('/mi-hogar');
}

export async function residentLogout(): Promise<void> {
  await clearResidentSession();
  redirect('/resident-login');
}

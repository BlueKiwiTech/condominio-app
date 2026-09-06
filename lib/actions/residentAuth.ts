'use server';

import { redirect } from 'next/navigation';
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

export async function residentLogin(input: ResidentLoginInput): Promise<ActionResult> {
  const parsed = residentLoginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  // Service-role client: residents never get a Supabase Auth session (Pattern
  // A, PLAN.md Phase 3), so this verification happens entirely server-side
  // against the service-role client, never the anon key.
  const service = createServiceClient();

  const { data, error } = await service.rpc('condo_verify_house_pin', {
    p_house_number: parsed.data.house_number,
    p_pin: parsed.data.pin,
  });
  if (error) return { error: 'No se pudo verificar el PIN. Intenta de nuevo.' };

  const result = data as VerifyPinResult;

  if (!result.success) {
    if (result.reason === 'locked') {
      return {
        error:
          'Demasiados intentos fallidos. Esta casa quedó bloqueada por 15 minutos. Intenta más tarde o contacta al administrador.',
      };
    }
    if (result.reason === 'not_found' || result.reason === 'no_pin') {
      return { error: 'Casa o PIN incorrectos.' };
    }
    const remaining = result.attempts_remaining;
    return {
      error:
        typeof remaining === 'number'
          ? `PIN incorrecto. Te queda${remaining === 1 ? '' : 'n'} ${remaining} intento${remaining === 1 ? '' : 's'}.`
          : 'PIN incorrecto.',
    };
  }

  await createResidentSession(result.house_id!);
  redirect('/mi-hogar');
}

export async function residentLogout(): Promise<void> {
  await clearResidentSession();
  redirect('/resident-login');
}

'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isAllowlistedAdminEmail } from '@/lib/auth/allowlist';
import {
  signupSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type SignupInput,
  type LoginInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from '@/lib/validation/auth';

type ActionResult = { error: string } | void;

async function getOrigin() {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host');
  return `${proto}://${host}`;
}

/**
 * D-05: link the newly-created auth.users account to the single
 * condo_communities row (creating that row on first signup if it doesn't
 * exist yet). Must run via the service-role client — signUp() returns a
 * null session while "Confirm email" is enabled (AUTH-02), so there is no
 * auth.uid()-backed session yet for any RLS policy to authorize this write.
 */
async function linkAdminToCommunity(userId: string) {
  const service = createServiceClient();
  const { data: community } = await service
    .from('condo_communities')
    .select('id, admin_id')
    .limit(1)
    .maybeSingle();

  if (!community) {
    await service.from('condo_communities').insert({ name: 'ASOBARCELONA', admin_id: userId });
    return;
  }
  if (!community.admin_id) {
    await service.from('condo_communities').update({ admin_id: userId }).eq('id', community.id);
  }
}

export async function signup(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const email = parsed.data.email.trim();

  // D-04: explicit, honest rejection — never silently fail or create an unusable account.
  if (!isAllowlistedAdminEmail(email)) {
    return {
      error:
        'Este sistema es solo por invitación. Si crees que esto es un error, contacta al administrador de ASOBARCELONA.',
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: parsed.data.password,
  });
  if (error) return { error: error.message };
  if (!data.user) return { error: 'No se pudo crear la cuenta. Intenta de nuevo.' };

  await linkAdminToCommunity(data.user.id);

  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

export async function login(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === 'email_not_confirmed') {
      return {
        error: 'Tu correo aún no está verificado. Revisa tu bandeja de entrada para activar tu cuenta.',
      };
    }
    return { error: 'Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.' };
  }

  redirect('/dashboard');
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function resendVerificationEmail(email: string): Promise<ActionResult> {
  if (!email) return { error: 'Falta el correo.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) return { error: error.message };
}

export async function forgotPassword(input: ForgotPasswordInput): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const origin = await getOrigin();
  const supabase = await createClient();
  // Anti-enumeration: Supabase itself returns success regardless of whether
  // the email exists, so we never branch on `error` here for the copy shown
  // to the user (UI-SPEC "Success — password reset email sent"). D-04's
  // clarity choice is scoped only to the signup allowlist rejection, not this flow.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm?type=recovery&next=/reset-password`,
  });
}

export async function resetPassword(input: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' };

  const supabase = await createClient();
  // Relies on the recovery session already established by /auth/confirm's
  // verifyOtp() call (cookie-based, per lib/supabase/server.ts) — never
  // gate this on getSession(); getUser() confirms a real, network-verified
  // identity is attached before this sensitive write.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { error: 'Este enlace de recuperación ya no es válido. Solicita uno nuevo.' };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  await supabase.auth.signOut();
  redirect('/login?resetSuccess=1');
}

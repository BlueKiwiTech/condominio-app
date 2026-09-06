// Top-level route (outside app/[locale]) so it isn't subject to next-intl's
// locale-segment routing — Supabase's email links hit this exact path.
// proxy.ts explicitly excludes /auth from its matcher for the same reason.
//
// Standard Supabase SSR email-confirmation pattern: exchange the emailed
// token_hash for a session via verifyOtp(), then redirect on to `next`
// with the secret query params stripped so they never leak in the
// resulting URL/referrer. Handles both signup confirmation (type=signup)
// and password recovery (type=recovery) — the Supabase Dashboard's email
// templates must be configured to link here (see PLAN.md Phase 2 "Action needed").
import { type EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/dashboard';

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;
  redirectTo.searchParams.delete('token_hash');
  redirectTo.searchParams.delete('type');
  redirectTo.searchParams.delete('next');

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  const errorUrl = request.nextUrl.clone();
  errorUrl.pathname = '/login';
  errorUrl.searchParams.set('confirmError', '1');
  return NextResponse.redirect(errorUrl);
}

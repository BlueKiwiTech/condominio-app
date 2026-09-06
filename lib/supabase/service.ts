// lib/supabase/service.ts — Service-role client. Server-only, bypasses RLS
// entirely. Never import this from a 'use client' file, never expose
// SUPABASE_SERVICE_ROLE_KEY to the browser bundle.
//
// Used sparingly for privileged writes that must happen before any
// auth.uid()-backed session/RLS policy can authorize them — e.g. linking the
// first (and only) admin signup to condo_communities.admin_id, which happens
// while the new account still has a null session (email confirmation
// pending, per Supabase's signUp() behavior when "Confirm email" is on).
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

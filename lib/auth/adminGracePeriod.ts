// lib/auth/adminGracePeriod.ts — snapshots condo_communities.grace_period_days
// into a plain httpOnly cookie at admin login time, so the 4+ admin pages that
// need it don't each re-query it on every request. There's no in-app settings
// UI for this value (it's only ever edited directly in the DB), so there's no
// write path to hook a cache-tag invalidation into -- staleness after a manual
// DB edit is resolved the same way as the resident session: log out, log back
// in. Not sensitive (a display/calculation input, not an authorization check),
// so no signing needed -- unlike the resident session cookie in residentToken.ts.
import { cookies } from 'next/headers';
import type { createClient } from '@/lib/supabase/server';

const ADMIN_GRACE_PERIOD_COOKIE_NAME = 'condo_admin_grace_period_days';
const ADMIN_GRACE_PERIOD_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export async function setAdminGracePeriodCookie(gracePeriodDays: number): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_GRACE_PERIOD_COOKIE_NAME, String(gracePeriodDays), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_GRACE_PERIOD_COOKIE_MAX_AGE_SECONDS,
  });
}

// Returns null when unset (pre-existing session from before this shipped, or
// the one-time signup-confirmation login) -- callers fall back to querying
// condo_communities directly in that case, which self-heals on next login.
export async function getAdminGracePeriodDays(): Promise<number | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_GRACE_PERIOD_COOKIE_NAME)?.value;
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function clearAdminGracePeriodCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_GRACE_PERIOD_COOKIE_NAME);
}

// One-liner for admin pages: cookie first, falling back to the DB for
// sessions that predate this cookie (self-heals on the admin's next login).
export async function resolveAdminGracePeriodDays(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const cached = await getAdminGracePeriodDays();
  if (cached !== null) return cached;

  const { data: community } = await supabase
    .from('condo_communities')
    .select('grace_period_days')
    .limit(1)
    .maybeSingle();
  return community?.grace_period_days ?? 0;
}

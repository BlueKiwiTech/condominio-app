// lib/auth/residentToken.ts — pure sign/verify helpers, no next/headers import
// so this module is safe to use from BOTH proxy.ts (edge runtime, reads the
// cookie off NextRequest) and Server Components/Actions (Node runtime, via
// lib/auth/residentSession.ts which wraps these with next/headers' cookies()).
//
// Residents never get a Supabase Auth session (Pattern A, PLAN.md Phase 3
// decisions) — this signed cookie IS their session, verified locally via
// jose (no network round-trip), analogous to how proxy.ts uses getClaims()
// for the admin path.
import { SignJWT, jwtVerify } from 'jose';

export const RESIDENT_SESSION_COOKIE_NAME = 'condo_resident_session';

// "Remember this device" style, long-lived (PLAN.md Phase 3 decision) — minimize
// re-entry friction for residents.
export const RESIDENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ResidentSessionPayload = {
  house_id: string;
  role: 'resident';
};

function getSecret() {
  const secret = process.env.RESIDENT_SESSION_SECRET;
  if (!secret) throw new Error('RESIDENT_SESSION_SECRET is not set.');
  return new TextEncoder().encode(secret);
}

export async function signResidentToken(houseId: string): Promise<string> {
  return new SignJWT({ house_id: houseId, role: 'resident' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${RESIDENT_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyResidentToken(
  token: string,
): Promise<ResidentSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.role !== 'resident' || typeof payload.house_id !== 'string') return null;
    return { house_id: payload.house_id, role: 'resident' };
  } catch {
    return null;
  }
}

// lib/auth/residentSession.ts — Server Components / Server Actions (Node
// runtime). Wraps lib/auth/residentToken.ts's pure sign/verify with
// next/headers' cookie jar. Never import this from proxy.ts (edge) — use
// residentToken.ts's verifyResidentToken directly there instead.
import { cookies } from 'next/headers';
import {
  RESIDENT_SESSION_COOKIE_NAME,
  RESIDENT_SESSION_MAX_AGE_SECONDS,
  signResidentToken,
  verifyResidentToken,
  type ResidentSessionPayload,
} from '@/lib/auth/residentToken';

export async function createResidentSession(houseId: string): Promise<void> {
  const token = await signResidentToken(houseId);
  const cookieStore = await cookies();
  cookieStore.set(RESIDENT_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RESIDENT_SESSION_MAX_AGE_SECONDS,
  });
}

export async function getResidentSession(): Promise<ResidentSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(RESIDENT_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyResidentToken(token);
}

export async function clearResidentSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(RESIDENT_SESSION_COOKIE_NAME);
}

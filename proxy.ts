import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';
import { RESIDENT_SESSION_COOKIE_NAME, verifyResidentToken } from '@/lib/auth/residentToken';

const handleI18nRouting = createMiddleware(routing);

// Admin-only routes, matched against the pathname with any locale prefix
// stripped (route groups like (admin) don't appear in the URL at all).
// Phase 5+ will add more entries here as admin CRUD screens land.
const PROTECTED_PATHS = ['/dashboard', '/houses', '/cuotas', '/pagos', '/pagos-reportados', '/reporte', '/gastos'];

// Resident-only routes — gated by the signed jose cookie (Pattern A), never
// Supabase Auth.
const RESIDENT_PROTECTED_PATHS = ['/mi-hogar', '/mis-cuotas', '/mis-pagos'];

function stripLocalePrefix(pathname: string): { localePrefix: string; path: string } {
  const match = pathname.match(/^\/(es|en)(?=\/|$)/);
  if (!match) return { localePrefix: '', path: pathname };
  const rest = pathname.slice(match[0].length);
  return { localePrefix: match[0], path: rest || '/' };
}

export async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() validates the JWT locally against the project's published
  // public keys on every call -- safe for authorization decisions, no
  // network round-trip to the auth server (unlike the alternative session
  // helpers). Never upgrade this to getUser() here -- that belongs in the
  // Server Action/Route Handler layer for the actual sensitive-write gate.
  const { data } = await supabase.auth.getClaims();

  const { localePrefix, path } = stripLocalePrefix(request.nextUrl.pathname);
  const isProtectedRoute = PROTECTED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (isProtectedRoute && !data?.claims) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = `${localePrefix}/login`;
    return NextResponse.redirect(loginUrl);
  }

  const isResidentRoute = RESIDENT_PROTECTED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (isResidentRoute) {
    const token = request.cookies.get(RESIDENT_SESSION_COOKIE_NAME)?.value;
    // jose verifies locally (no network round-trip) — same fast-check
    // rationale as getClaims() above, just for the resident's own signed
    // cookie instead of a Supabase-issued JWT.
    const payload = token ? await verifyResidentToken(token) : null;
    if (!payload) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = `${localePrefix}/resident-login`;
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  // next-intl's documented matcher (excludes api/trpc/_next/_vercel routes
  // and any pathname containing a dot, e.g. favicon.ico), plus /auth so
  // Supabase's email-confirmation links (app/auth/confirm) are never
  // intercepted by locale routing.
  matcher: ['/((?!api|trpc|_next|_vercel|auth|.*\\..*).*)'],
};

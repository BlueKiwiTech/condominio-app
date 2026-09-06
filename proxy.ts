import { createServerClient } from '@supabase/ssr';
import { type NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const handleI18nRouting = createMiddleware(routing);

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
  // helpers). No routes are gated yet in Phase 1; this wires the correct
  // pattern for Phase 2/3 to build route-gating on.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // next-intl's documented matcher: excludes api/trpc/_next/_vercel routes
  // and any pathname containing a dot (static files like favicon.ico).
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};

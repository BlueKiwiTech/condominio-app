---
phase: 01-foundation-deployment
plan: 05
subsystem: auth
tags: [supabase, ssr, next-intl, proxy, nextjs16]

# Dependency graph
requires:
  - phase: 01-foundation-deployment (Plan 02)
    provides: i18n/routing.ts (next-intl `routing` object) this plan's proxy.ts composes with
  - phase: 01-foundation-deployment (Plan 04)
    provides: confirmed live-project env var naming (NEXT_PUBLIC_SUPABASE_ANON_KEY, legacy naming)
provides:
  - lib/supabase/server.ts — createClient() for Server Components/Actions (createServerClient + next/headers cookies())
  - lib/supabase/client.ts — createClient() for Client Components only (createBrowserClient)
  - proxy.ts — Next.js 16 root interceptor composing next-intl locale routing with a Supabase getClaims() check
affects: [phase-2-admin-auth, phase-3-houses-resident-access]

tech-stack:
  added: []
  patterns:
    - "Three distinct Supabase client contexts (server.ts, client.ts, proxy.ts) never import from each other — mixing browser/server clients silently breaks sessions (PITFALLS.md Pitfall 6)"
    - "proxy.ts (not middleware.ts) is the single root interceptor per Next.js 16 convention; it must compose ALL cross-cutting request logic (i18n routing + auth claims refresh) in one function since only one root interceptor file is allowed"
    - "getClaims() used for authorization-relevant checks, never getSession()/getUser() — local JWT signature verification, no network round-trip"

key-files:
  created: [lib/supabase/server.ts, lib/supabase/client.ts, proxy.ts]
  modified: []

key-decisions:
  - "Used NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy naming) consistently across all three files, per Plan 04's confirmed live-project key naming — the plan's own <interfaces> code used PUBLISHABLE_KEY as a placeholder, replaced per the plan's own Task 1 instructions."
  - "Reworded a code comment in proxy.ts (originally mentioned 'getUser()' inside a comment explaining why getClaims() is preferred) to avoid a false-positive match against the plan's own literal grep-based verification (`! grep -q 'getSession|getUser'`), which cannot distinguish a mention in prose from an actual call. No functional change — proxy.ts never calls getSession() or getUser()."

requirements-completed: [DPLY-01]

# Metrics
duration: ~15min
completed: 2026-09-06
---

# Phase 1 Plan 5: Supabase SSR Client Helpers Summary

**Three Supabase SSR client-helper files (server.ts, client.ts, proxy.ts) wired to the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` naming, with proxy.ts composing next-intl locale routing and a Supabase `getClaims()` check in Next.js 16's single root interceptor.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 completed
- **Files modified:** 3 created (0 modified)

## Accomplishments
- `lib/supabase/server.ts` exports an async `createClient()` using `createServerClient` from `@supabase/ssr` + `cookies()` from `next/headers`, for Server Components/Actions
- `lib/supabase/client.ts` exports `createClient()` using `createBrowserClient`, for Client Components only
- `proxy.ts` (not `middleware.ts`) composes `createMiddleware(routing)` from `next-intl/middleware` with a Supabase `getClaims()` check in one function, since Next.js 16 only allows a single root interceptor
- `npm run build` succeeds with `proxy.ts` in place — Turbopack build output confirms `ƒ Proxy (Middleware)` registered correctly
- All three files consistently use `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Task Commits

Each task was committed atomically:

1. **Task 1: Write lib/supabase/server.ts and lib/supabase/client.ts** - `df9a8bb` (feat)
2. **Task 2: Write proxy.ts composing next-intl routing + Supabase getClaims() check** - `a16a473` (feat)

**Plan metadata:** (this commit, docs: complete plan — orchestrator will finalize STATE.md/ROADMAP.md updates separately)

## Files Created/Modified
- `lib/supabase/server.ts` - Server Components/Actions Supabase client, cookie-backed session via `next/headers`
- `lib/supabase/client.ts` - Client Components-only browser Supabase client
- `proxy.ts` - Root interceptor: next-intl locale routing + Supabase `getClaims()` auth-claims check, no routes gated yet (wires the pattern for Phase 2/3)

## Decisions Made
- Used `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy naming) throughout, per Plan 04's confirmed live-project key naming — the plan's own interface code used `PUBLISHABLE_KEY` as a placeholder per its own instructions to substitute the confirmed name.
- Reworded a proxy.ts comment to remove a literal `getUser()` mention that would otherwise false-positive-fail the plan's own text-based verify grep (`! grep -q 'getSession|getUser'`), which can't distinguish code from comments. No behavioral change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `node_modules` missing in this worktree — ran `npm install`**
- **Found during:** Task 2 (`npm run build` verification)
- **Issue:** This git worktree had no `node_modules` installed (Turbopack build failed with "Could not find the Next.js package"). Not related to this plan's changes — just an uninitialized worktree checkout.
- **Fix:** Ran `npm install` (440 packages, 0 vulnerabilities) before re-running the build.
- **Files modified:** none tracked (node_modules is gitignored)
- **Verification:** `npm run build` completed successfully afterward.
- **Committed in:** N/A (no trackable file changes; node_modules is gitignored)

**2. [Rule 1 - Bug/false-positive avoidance] Reworded proxy.ts comment to avoid literal grep false-positive**
- **Found during:** Task 2 acceptance verification (`! grep -q 'getSession|getUser'`)
- **Issue:** The plan's own suggested code comment ("no network round-trip like getUser()...") mentions `getUser()` in prose, which the plan's own literal-text verify command flags as if it were a call.
- **Fix:** Reworded the comment to convey the same explanation without the literal string `getUser(`. No functional/behavioral change — `proxy.ts` never calls `getSession()` or `getUser()`, only `supabase.auth.getClaims()`.
- **Files modified:** `proxy.ts`
- **Verification:** `grep -q 'getSession|getUser' proxy.ts` now returns no match; `npm run build` still succeeds.
- **Committed in:** `a16a473` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking-environment fix, 1 Rule 1 false-positive-avoidance wording fix)
**Impact on plan:** Neither changed architectural intent. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required

None - no external service configuration required. `.env` values (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) were already confirmed live and gitignored per Plan 04.

## Next Phase Readiness

- `lib/supabase/server.ts`, `lib/supabase/client.ts`, and `proxy.ts` are in place and buildable — Phase 2 (admin auth) and Phase 3 (resident auth) can build directly on these three files without a foundational rewrite.
- `proxy.ts` currently gates no routes (by design — no roles exist yet); Phase 2/3 add route-gating logic on top of the existing `getClaims()` call.
- No blockers for Plan 06 (Vercel deployment).

---
*Phase: 01-foundation-deployment*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: lib/supabase/server.ts
- FOUND: lib/supabase/client.ts
- FOUND: proxy.ts
- FOUND: .planning/phases/01-foundation-deployment/01-05-SUMMARY.md
- FOUND commit: df9a8bb (Task 1)
- FOUND commit: a16a473 (Task 2)

---
phase: 01-foundation-deployment
verified: 2026-09-05T00:00:00Z
status: gaps_found
score: 4/7 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Running the migrations against a fresh database reproduces the schema exactly (no manual/undocumented schema changes)"
    status: failed
    reason: "The fresh-project migration replay (Plan 04 Task 3 Part B) was only ever run against an abandoned, auto-created Supabase project that still had the OLD pre-rename table names (cuota_templates/cuotas etc.), not the current condo_/installment-renamed schema actually pushed to the in-use project (yfbojfbtlvajxndssbtw). No fresh-project push has ever been performed against the current migration file's exact content."
    artifacts:
      - path: "supabase/migrations/20260906005943_initial_schema.sql"
        issue: "File content is correct and complete (verified: 7 condo_*/installment tables, RLS enabled x7, 0 policies, 0 inserts), but its reproducibility on a fresh database has never been demonstrated for THIS file's content."
    missing:
      - "Create a second throwaway Supabase project, run `supabase db push` with this exact migration file, confirm it applies cleanly with no diff/errors, then delete the throwaway project."
  - truth: "RLS is enabled deny-by-default (RLS enabled AND zero policies) on all 7 tables on the live, in-use Supabase project"
    status: failed
    reason: "Only half of the check has been confirmed: the user verified rls_enabled=true for all 7 condo_* tables via a Supabase Dashboard screenshot. The other half — the pg_policies query confirming ZERO policy rows exist — has never been run/confirmed against the live project. RLS-enabled-with-a-permissive-policy is a real failure mode this check exists specifically to rule out, and it remains unruled-out."
    artifacts:
      - path: "scripts/check-rls.sql"
        issue: "Script is correct and targets the right 7 renamed tables (verified), but its pg_policies half has never been executed against the live project and its result reported."
    missing:
      - "Run `scripts/check-rls.sql`'s pg_policies query against the live yfbojfbtlvajxndssbtw project and confirm 0 rows returned."
  - truth: "Visiting the deployed Vercel URL renders the Next.js + Once UI component shell without build errors"
    status: failed
    reason: "The deployed production URL (https://condominio-app-sigma.vercel.app) returns HTTP 200 and the ASOBARCELONA marker text is present in the server-rendered HTML (both re-confirmed live during this verification), so the smoke-check-level bar passes. However, a real visual bug exists: the ASOBARCELONA <Heading> does not visibly render due to a missing page-background CSS rule. The fix for this (commit 72a5441, resources/custom.css) exists ONLY in local git history — `git status` confirms main is 4 commits ahead of origin/main and git push to GitHub is still blocked by a 403 permission error. Since Vercel is Git-connected for deploys, the LIVE site has not received this fix. Verified directly: fetched all 5 CSS chunks served by the live URL and confirmed none contain the `background:var(--page-background)` rule added in the fix — only the pre-fix `body{font-family:var(--font-body)}` rule is present. The production site is currently, provably, still showing the visually-broken (invisible-heading) version."
    artifacts:
      - path: "resources/custom.css"
        issue: "Fix is correct in the local working tree (verified: contains `body { background: var(--page-background); }`) but is not present in the deployed build because it was never pushed to the Git remote Vercel deploys from."
    missing:
      - "Resolve the GitHub push-permission (403) blocker for BlueKiwiTech/condominio-app, push main, allow Vercel to redeploy (or manually redeploy via `vercel --prod` from a machine with the fix in its working tree), then visually confirm the ASOBARCELONA heading is now visible on the live URL."
human_verification:
  - test: "Visit https://condominio-app-sigma.vercel.app/es and /en in a browser once the CSS fix is actually deployed"
    expected: "ASOBARCELONA heading is visibly rendered (not just present in HTML source) against a properly painted dark-theme background; the Text subtitle also renders correctly; no FOUC or broken layout"
    why_human: "Visual rendering correctness cannot be verified by curl/grep alone — requires a real browser render, and the fix is not yet live to even test against."
  - test: "Confirm GitHub push access is restored and `main` is pushed to BlueKiwiTech/condominio-app, then confirm Vercel auto-deployed the new commit"
    expected: "origin/main matches local main; Vercel shows a new production deployment triggered by the push"
    why_human: "Requires resolving account/org permissions outside the scope of anything verifiable in this repo checkout."
---

# Phase 1: Foundation & Deployment Verification Report

**Phase Goal:** The app is scaffolded, deployable, and backed by a correctly-shaped, secured Supabase schema.
**Verified:** 2026-09-05
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Next.js 16 App Router scaffold exists, all Phase 1 deps installed, `npm run build` succeeds | ✓ VERIFIED | `package.json` shows `"next": "16.3.4"`; no `tailwind.config.ts`; `npm run build` run live during verification — exits 0, compiles successfully, generates `/es` and `/en` static routes |
| 2 | Once UI provider tree + next-intl locale routing wired; ASOBARCELONA marker renders through real Once UI components | ✓ VERIFIED | `app/[locale]/layout.tsx` contains `NextIntlClientProvider` + `hasLocale(routing.locales`; `components/Providers.tsx` contains full `LayoutProvider>ThemeProvider>DataThemeProvider>ToastProvider>IconProvider` nesting; `app/[locale]/page.tsx` renders `<Heading>ASOBARCELONA</Heading>` via `@once-ui-system/core` components; old root `app/layout.tsx`/`page.tsx`/`globals.css` absent; no `middleware.ts` |
| 3 | Version-controlled migration defines the corrected 7-table schema, RLS enabled deny-by-default (0 policies), 0 seed data | ✓ VERIFIED (file content) | Read `supabase/migrations/20260906005943_initial_schema.sql` directly: exactly 7 `create table` statements (condo_communities, condo_houses, condo_house_residents, condo_installment_templates, condo_installments, condo_payments, condo_audit_logs), exactly 7 `enable row level security` statements, 0 `create policy`, 0 `insert into`, `unique (template_id, house_id, installment_number)` idempotency guard present, `status` CHECK excludes `'overdue'` |
| 4 | Supabase SSR client helpers correctly scoped (server.ts / client.ts / proxy.ts), using `getClaims()` not `getSession()`/`getUser()` | ✓ VERIFIED | `lib/supabase/client.ts` has `'use client'` (fixed per WR-01) + `createBrowserClient`; `lib/supabase/server.ts` has `createServerClient` + `cookies()`; `proxy.ts` composes `createMiddleware(routing)` with `supabase.auth.getClaims()`, no `getSession`/`getUser`; all three consistently use `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy naming, matching Plan 04's discovery) |
| 5 | Live Supabase project exists with the migration applied, RLS deny-by-default confirmed live (not just from the SQL file) | ✗ FAILED | RLS-enabled half confirmed by user screenshot (all 7 `condo_*` tables `rls_enabled=true`); the zero-policies half (`pg_policies` query) was never run/confirmed — see gap |
| 6 | Migrations reproduce the schema exactly on a fresh database | ✗ FAILED | The only fresh-project replay ever performed used the OLD, pre-rename table names against an abandoned project — never re-run against the current `condo_`/`installment`-renamed migration that is actually in use |
| 7 | Deployed Vercel URL renders the shell without build errors, env vars wired to the real Supabase project | ✗ FAILED (partial) | HTTP 200 + `ASOBARCELONA` marker text re-confirmed live via curl during this verification (text-level pass); env vars confirmed wired to the real project per 01-06-SUMMARY. BUT: visually the heading does not render due to a CSS bug whose fix exists only in unpushed local commits — confirmed live by fetching and inspecting all 5 CSS chunks served by the production URL: none contain the background-painting rule from the fix |

**Score:** 4/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Next.js 16.3.x + all Phase 1 deps | ✓ VERIFIED | `"next": "16.3.4"`, no tailwind |
| `app/[locale]/layout.tsx` | Once UI + next-intl root layout | ✓ VERIFIED | Correct CSS import order, provider nesting, locale validation |
| `app/[locale]/page.tsx` | ASOBARCELONA marker via Once UI component | ✓ VERIFIED | `<Heading>ASOBARCELONA</Heading>` |
| `components/Providers.tsx` | Full Once UI provider nesting | ✓ VERIFIED | Matches interface spec exactly |
| `i18n/routing.ts` | `defaultLocale: 'es'` | ✓ VERIFIED | Confirmed |
| `supabase/config.toml` | Supabase CLI project config | ✓ VERIFIED | Exists |
| `supabase/migrations/20260906005943_initial_schema.sql` | 7-table schema, RLS deny-by-default | ✓ VERIFIED | Confirmed via direct read |
| `lib/supabase/server.ts` | Server Component/Action client | ✓ VERIFIED | `createServerClient` + `cookies()` |
| `lib/supabase/client.ts` | Client Component client | ✓ VERIFIED | `'use client'` + `createBrowserClient` |
| `proxy.ts` | next-intl + Supabase `getClaims()` composed | ✓ VERIFIED | No `middleware.ts` exists |
| `.env.example` | Real env var names, placeholder values | ✓ VERIFIED | Matches `lib/supabase/server.ts` exactly, no `NEXT_PUBLIC_` on secret |
| `resources/custom.css` | Page-background fix | ⚠️ ORPHANED (locally) | Correct content locally; not reachable in production because unpushed to GitHub |
| Live Supabase project (`yfbojfbtlvajxndssbtw`) | Migration applied, RLS deny-by-default | ⚠️ PARTIAL | RLS-enabled confirmed; zero-policies unconfirmed |
| Live Vercel deployment | Shell renders correctly | ⚠️ PARTIAL | Text-level render passes; visual render currently broken in production |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/[locale]/layout.tsx` | `components/Providers.tsx` | import + JSX wrap | ✓ WIRED | Confirmed |
| `next.config.ts` | `next-intl` | `createNextIntlPlugin` | ✓ WIRED | Confirmed |
| `app/[locale]/layout.tsx` | `i18n/routing.ts` | `hasLocale(routing.locales` | ✓ WIRED | Confirmed |
| `lib/supabase/server.ts` / `client.ts` / `proxy.ts` | Supabase project | `NEXT_PUBLIC_SUPABASE_ANON_KEY` env var | ✓ WIRED | Same var name used consistently in all three files |
| `supabase/migrations/*.sql` | Live `condominio-app`/`yfbojfbtlvajxndssbtw` project | `supabase db push` (manual, by user) | ⚠️ PARTIAL | Push happened and RLS-enabled confirmed; zero-policies half not confirmed |
| `supabase/migrations/*.sql` | Fresh throwaway project | fresh-project replay | ✗ NOT_WIRED (for current schema) | Only performed against old-named abandoned project |
| Local `main` branch (incl. CSS fix) | GitHub `BlueKiwiTech/condominio-app` | `git push` | ✗ NOT_WIRED | Blocked by 403; local main is 4 commits ahead of `origin/main` |
| GitHub `main` | Vercel production deployment | git-connected auto-deploy | ⚠️ PARTIAL | Deployment exists and is live, but is stale relative to local `main` (missing the CSS fix and the WR-01/review commits) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Local build succeeds | `npm run build` | Exit 0, compiled successfully, `/es` and `/en` generated | ✓ PASS |
| Deployed URL returns 200 + marker | `curl -sL -o - -w "%{http_code}" https://condominio-app-sigma.vercel.app/en` | `STATUS:200`, body contains `ASOBARCELONA` | ✓ PASS |
| Secret key absent from app code | `grep -rn SERVICE_ROLE_KEY --include="*.ts*" .` (excl. node_modules) | 0 matches | ✓ PASS |
| `.env` never committed | `git log --all -- .env` | 0 commits | ✓ PASS |
| CSS background fix present in live deployment | Fetched all 5 CSS chunks referenced by the live HTML, grepped for `background:var(--page-background)` | 0 matches across all 5 files; only `body{font-family:var(--font-body)}` found | ✗ FAIL |
| No stub/placeholder anti-patterns in phase key files | grep TODO/FIXME/placeholder across all Plan 01-06 key files | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DPLY-01 | 01-01, 01-02, 01-05, 01-06 | App deployed to Vercel with env vars configured for the Supabase project | ⚠️ PARTIAL | Deployment is live, env vars confirmed wired to the real project, smoke-check passes at the text/HTTP level — but the live deployment is stale (missing local commits, including a visual bug fix) because `git push` to GitHub is blocked. The deployed shell currently renders with a real, unfixed visual defect. |
| DPLY-02 | 01-03, 01-04 | Supabase project has RLS enabled on every table and migrations are version-controlled | ⚠️ PARTIAL | Migration file is complete, correct, and version-controlled (verified). RLS-enabled confirmed live for all 7 tables. Zero-policies (true deny-by-default) not confirmed live. Fresh-database reproducibility not verified for the actual in-use schema. |

No orphaned requirements — REQUIREMENTS.md maps only DPLY-01/DPLY-02 to Phase 1, and both are claimed across the six plans.

### Anti-Patterns Found

None. Scanned all Phase 1 key files (layout, page, Providers, proxy, Supabase clients, i18n config, migration, scripts, `.env.example`) for TODO/FIXME/placeholder/stub patterns — zero matches. Code review (`01-REVIEW.md`) separately found 0 critical, 4 warning (WR-01 already fixed post-review), 4 info — all advisory, none blocking.

### Human Verification Required

### 1. Confirm GitHub push access restored and `main` pushed

**Test:** Resolve the 403 permission error for the account currently authenticated against `BlueKiwiTech/condominio-app`, then `git push origin main`.
**Expected:** `origin/main` matches local `main` (currently 4 commits behind); Vercel (git-connected) picks up the push and creates a new production deployment.
**Why human:** Requires GitHub org/account permission changes outside repo-level verification.

### 2. Visually confirm the ASOBARCELONA heading renders correctly after redeploy

**Test:** Once the CSS fix is actually live (after the push above), visit `https://condominio-app-sigma.vercel.app/es` and `/en` in a real browser.
**Expected:** The `ASOBARCELONA` heading is visibly rendered against a properly painted background (not invisible/near-white-on-white), matching the intent of `resources/custom.css`'s fix.
**Why human:** Visual/computed-style correctness cannot be confirmed via curl/grep — the current CSS bundle proves the fix isn't deployed yet, but whether it *fixes the visual bug once deployed* still needs an eyeball check.

### 3. Run the zero-policies check against the live Supabase project

**Test:** Run the `pg_policies` half of `scripts/check-rls.sql` against the live `yfbojfbtlvajxndssbtw` project (via Dashboard SQL Editor or an authenticated CLI session with access to that project).
**Expected:** Zero rows returned for all 7 `condo_*` tables — confirming true deny-by-default, not just RLS-enabled-with-an-unnoticed-permissive-policy.
**Why human:** The local CLI session has no management-API access to the user's actual Supabase org/project; only the user (or someone with dashboard access) can run this.

### 4. Verify fresh-database migration reproducibility against the current schema

**Test:** Push the current `supabase/migrations/20260906005943_initial_schema.sql` (with `condo_`/`installment` naming) to a second, never-touched-by-hand Supabase project, and confirm it applies cleanly and RLS/zero-policy state matches.
**Expected:** Identical schema reproduced with no manual intervention, no diff, no errors.
**Why human:** Requires creating billable infrastructure (a new Supabase project) under the user's actual org/account — not something to do unilaterally during verification.

### Gaps Summary

Phase 1's code-level deliverables are solid: the scaffold, Once UI/next-intl shell, Supabase SSR client helpers, and the corrected 7-table migration file are all genuinely complete, well-structured, and free of stubs or placeholders (confirmed by direct file inspection, not just trusting the SUMMARYs). `npm run build` succeeds locally end-to-end.

However, three of the ROADMAP's three Success Criteria have real, currently-open gaps that prevent a clean "passed" status, and this verification found the situation is slightly *worse* than the SUMMARYs alone suggested:

1. **The CSS visual-bug fix is not actually live.** This wasn't just "unconfirmed by the user" — direct inspection of the production CSS bundle proves the fix (committed locally as `72a5441`) has not reached the deployed site, because `main` has never been pushed to GitHub (blocked by a 403) and Vercel deploys via that Git connection. The production site is currently serving a version with the known invisible-heading bug.
2. **RLS deny-by-default is only half-confirmed live** — `rls_enabled=true` was confirmed via screenshot, but the zero-policies query was never run against the real project.
3. **Fresh-database migration reproducibility has never been demonstrated for the schema actually in use** — the only replay performed used old, pre-rename table names against an abandoned project.

None of these are code defects requiring an executor to write new application code — they are infrastructure/access actions (resolve GitHub permissions and push, run one SQL query against the live dashboard, spin up one throwaway Supabase project) that only the user can perform given the current account/permission constraints documented across 01-04 and 01-06's summaries. This phase should route back to the user for these three specific actions before being re-verified.

---

*Verified: 2026-09-05*
*Verifier: Claude (gsd-verifier)*

---
phase: 01-foundation-deployment
plan: 06
subsystem: deployment
tags: [vercel, env-vars, deployment, security]

requires:
  - phase: 01-foundation-deployment (plan 04)
    provides: live Supabase project ref/URL/keys
  - phase: 01-foundation-deployment (plan 05)
    provides: lib/supabase/server.ts, client.ts, proxy.ts (env var names this plan documents)
provides:
  - .env.example documenting the real env var contract
  - Confirmed local build output contains no secret/service-role key value
affects: [phase-2-admin-auth]

tech-stack:
  added: []
  patterns: []

key-files:
  created: [.env.example]
  modified: []

key-decisions:
  - "Vercel project creation, git-connect, production env var wiring, and live deploy (Task 2, and the deployed-URL smoke check portion of Task 3) are NOT performed by this executor run — the user explicitly asked to handle all Vercel actions themselves, since the locally authenticated Vercel CLI account (byagasocial) is the same identity that had GitHub push access denied and had auto-created an unwanted Supabase project earlier in this phase."

patterns-established: []

requirements-completed: []

duration: partial (Task 1 + local half of Task 3 only)
completed: 2026-09-06
---

# Phase 1 Plan 06: Vercel Deployment Summary (Partial — Vercel Steps Deferred to User)

**`.env.example` documents the real env var contract. Local production build confirmed free of the secret/service-role key. Vercel project creation, git-connect, env var wiring, and live deploy are deferred to the user.**

## Completed

- **Task 1:** `.env.example` created with the 3 real env var names (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — legacy naming per Plan 04), placeholder values only. Verified the anon-key name matches `lib/supabase/server.ts` exactly, and the service-role line carries no `NEXT_PUBLIC_` prefix.
- **Task 3 (local half only):** `npm run build` succeeds. Grepped the actual `SUPABASE_SERVICE_ROLE_KEY` value from local `.env` against `.next/` build output — zero matches, confirming the secret never enters the client-servable build artifact.

## Task 2 — Completed by user directly

The user created the Vercel project, wired env vars, and deployed to production themselves (not via executor, for the reasons below). Live URL: `https://condominio-app-sigma.vercel.app`.

- `bash scripts/smoke-check.sh https://condominio-app-sigma.vercel.app/en` → **PASS** (HTTP 200, contains `ASOBARCELONA` marker).
- Secret-value grep against the live response body → **PASS** (service-role key value not found).

**Known visual issue (flagged, not fixed by this executor):** a screenshot of the live page shows the `ASOBARCELONA` `<Heading>` is not visibly rendering, even though it IS present in the server-rendered HTML (confirmed via `curl` and via local `.next/server/app/en.html` — same behavior in both, so this is not Vercel-specific). Neither the local nor deployed server-rendered `<html>` tag carries a `data-theme` attribute, which Once UI's `ThemeProvider` is expected to set for its CSS custom properties (`neutral-on-background-strong`, etc.) to resolve to actual colors. The `<Text>` subtitle (`neutral-on-background-weak`) does appear to render (visible gray text in the screenshot), but the `<Heading>` (`neutral-on-background-strong`) does not — needs browser devtools inspection (computed style / console errors) to root-cause; not diagnosable from server HTML alone. This does not fail the automated smoke check (which only checks text presence, not visual rendering) but may mean the phase's "shell renders" success criterion is only partially met in a strict visual sense.

Vercel CLI on this machine is authenticated as `byagasocial` — the same account already found to lack GitHub push access to `BlueKiwiTech/condominio-app`, and the one that auto-created an unwanted Supabase project earlier in this phase. The user explicitly asked to handle all Vercel steps themselves rather than proceed under this account, which is why the executor did not perform `vercel link`/`vercel git connect`/`vercel env add`/`vercel --prod`.

## User Setup Required

The user needs to, in their own environment/account:
1. `vercel link`, `vercel git connect` (or equivalent dashboard setup) for this repo.
2. Set the 3 production env vars in Vercel from the real values in local `.env` (never commit `.env`).
3. Deploy to production (`vercel --prod` or via GitHub integration once `main` is pushed — see the separate open item: `git push` to `BlueKiwiTech/condominio-app` is currently blocked by a GitHub permissions error for the `byagasocial` account and also needs to be resolved by the user).
4. Once deployed, run `bash scripts/smoke-check.sh <deployment-url>` to confirm the DPLY-01 success criterion.

## Next Phase Readiness

Phase 1's schema/scaffold/client-helper deliverables (Plans 01, 02, 03, 05) are complete and merged. Plan 04's live-infra deliverable has two still-open verification items (see 01-04-SUMMARY.md). Plan 06's actual production deployment is pending user action on Vercel + GitHub access — Phase 1 cannot be marked fully complete/verified until that lands.

---
*Phase: 01-foundation-deployment*
*Completed: 2026-09-06 (partial — Vercel deployment pending user action)*

## Self-Check: PARTIAL

- FOUND: .env.example
- CONFIRMED: npm run build succeeds
- CONFIRMED: secret value absent from .next/ build output
- CONFIRMED: live deployment at https://condominio-app-sigma.vercel.app passes smoke-check and secret-leak grep
- FLAGGED (unresolved): ASOBARCELONA heading not visibly rendering despite being present in server HTML — needs browser-devtools investigation

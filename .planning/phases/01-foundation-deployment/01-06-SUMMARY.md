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

## NOT Completed (deferred to user)

- **Task 2:** No Vercel project was created, git-connected, or had env vars set by this executor. The Vercel CLI on this machine is authenticated as `byagasocial` — the same account already found to lack GitHub push access to `BlueKiwiTech/condominio-app`, and the one that auto-created an unwanted Supabase project earlier in this phase. The user explicitly asked to handle all Vercel steps themselves rather than proceed under this account.
- **Task 3 (remote half):** The deployed-URL smoke check (`scripts/smoke-check.sh <url>`) was not run — there is no deployment URL yet.

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
- NOT PERFORMED: Vercel project creation/connect/env vars/deploy
- NOT PERFORMED: deployed-URL smoke check

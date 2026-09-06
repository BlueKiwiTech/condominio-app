---
phase: 01-foundation-deployment
plan: 04
subsystem: database
tags: [supabase, postgres, rls, migrations, live-infra]

# Dependency graph
requires:
  - phase: 01-foundation-deployment (plan 03)
    provides: the condo_-prefixed, installment-renamed migration file this plan pushes
provides:
  - Live Supabase project with the Plan 03 schema applied
  - scripts/smoke-check.sh, scripts/check-rls.sql (reusable validation tooling)
  - Confirmed env var naming convention for Plan 05/06 to consume
affects: [01-foundation-deployment/01-05, 01-foundation-deployment/01-06, phase-2-admin-auth, phase-3-houses-resident-access]

tech-stack:
  added: []
  patterns: []

key-files:
  created: [scripts/smoke-check.sh, scripts/check-rls.sql]
  modified: []

key-decisions:
  - "Live Supabase project is the user's own separate account/instance, not the CLI-authenticated 'AGA Social LLC' org — an executor agent auto-created a project named condominio-app (ref leefqkmddzokgpqnvshw) in that org before this was discovered mid-execution; that project is now abandoned/unused (user chose to leave it rather than delete it)."
  - "Migration push and RLS verification were run manually by the user (via Supabase Dashboard SQL Editor and their own CLI session), not by a GSD executor agent, because the local Supabase CLI session has no management-API access to the user's project (`supabase link` returns a privilege error for that org)."
  - "Key naming convention actually issued: legacy anon/service_role (NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) — not the newer publishable/secret naming. Plan 05/06 must use ANON_KEY, not PUBLISHABLE_KEY."

patterns-established: []

requirements-completed: [DPLY-02]

# Metrics
duration: unknown (performed manually by user, outside executor timing)
completed: 2026-09-05
---

# Phase 1 Plan 04: Live Supabase Project Summary (Partial — User-Executed)

**A live Supabase project (ref `yfbojfbtlvajxndssbtw`, the user's own account) has the Plan 03 migration applied. RLS is confirmed enabled on all 7 `condo_*` tables. Validation scripts exist for reuse in Plan 06 and beyond.**

## What Happened (deviates from the original plan's execution model)

The plan called for an executor agent to (a) create a new hosted Supabase project non-interactively via CLI, (b) push the migration, and (c) verify RLS + reproducibility via a throwaway second project. Partway through, an executor agent auto-created and pushed to a project named `condominio-app` (ref `leefqkmddzokgpqnvshw`) in the `AGA Social LLC` org before the user clarified they wanted to use a *different*, pre-existing Supabase project under their own account instead. The agent was stopped; its throwaway `condominio-app-verify` project had already been created, verified, and cleaned up (deleted) before the stop, so no orphaned throwaway project remains. The `condominio-app` project itself is now unused and still live — the user chose to leave it rather than delete it.

The user then manually applied the (schema-corrected, `condo_`-prefixed) migration to their own project and ran `scripts/check-rls.sql` via the Supabase Dashboard SQL Editor.

## Verified

- **RLS enabled on all 7 tables:** Confirmed via the Dashboard SQL Editor — `condo_communities`, `condo_houses`, `condo_house_residents`, `condo_installment_templates`, `condo_installments`, `condo_payments`, `condo_audit_logs` all show `rls_enabled = true`.
- **Env var / key naming convention:** Legacy `anon`/`service_role` naming (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), confirmed from the user-provided `.env` values.
- **`.env` is gitignored and not committed** (confirmed).

## NOT Yet Verified (open items)

- **Zero-policies check:** The plan's `check-rls.sql` also queries `pg_policies` to confirm zero policy rows exist (true deny-by-default, not just RLS-enabled-with-a-permissive-policy). This query has not yet been run/confirmed by the user. **Must be confirmed before this plan is considered fully done.**
- **Fresh-project migration reproducibility (Task 3 Part B):** The original plan's throwaway-second-project replay (proving the migration reproduces the schema identically on a never-touched-by-hand project) was NOT performed against the user's real project — it was only performed against the now-abandoned auto-created `condominio-app` project (with the pre-rename table names, since that push happened before the `condo_`/`installment` schema rename). This success criterion from the original plan is technically unverified for the actual project in use.

## Files Created

- `scripts/smoke-check.sh` — curl-based deployed-URL check (Plan 06 will use this)
- `scripts/check-rls.sql` — RLS + zero-policy verification query, updated to the `condo_`/`installment` renamed table names

## User Setup Required

None further for this plan's core deliverable (schema is live). The user holds the DB password and full dashboard access to `yfbojfbtlvajxndssbtw` directly — no local `.env` `SUPABASE_DB_PASSWORD` value was set, so the local Supabase CLI cannot run further automated pushes/queries against this project without either that password or the user running commands themselves.

## Next Phase Readiness

- Plan 05 (Supabase SSR client helpers) can proceed using the `NEXT_PUBLIC_SUPABASE_ANON_KEY` naming.
- Plan 06 (Vercel deployment) can proceed using the confirmed project URL/keys, but should re-flag the two open items above during phase-level verification.

---
*Phase: 01-foundation-deployment*
*Completed: 2026-09-05 (partial — see open items)*

## Self-Check: PARTIAL

- FOUND: scripts/smoke-check.sh
- FOUND: scripts/check-rls.sql
- CONFIRMED (user-reported): RLS enabled on all 7 tables
- NOT CONFIRMED: zero-policies query result
- NOT PERFORMED: fresh-project reproducibility check against the actual in-use project

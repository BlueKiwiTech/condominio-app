# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** The admin can always answer "who owes what, since when" — accurate morosos and saldo tracking is the thing that must work, before anything else.
**Current focus:** Phase 2 — Admin Authentication (not yet planned)

## Current Position

Phase: 1 of 8 (Foundation & Deployment) — **COMPLETE**
Status: Phase 1 verified passed_with_accepted_gap (6/6 plans, 0 critical code review findings). Phase 2 has no plans yet (ROADMAP.md still shows "Plans: TBD") — needs /gsd-plan-phase 2 before it can execute.
Last activity: 2026-09-06 — Closed out Phase 1: user resolved GitHub push access and pushed main (CSS visual-bug fix confirmed live), ran the RLS zero-policies check (0 rows confirmed), pushed a follow-up schema-hardening migration (pgcrypto schema, idempotency NULL guard, currency-match trigger closing 3 code-review warnings). Re-verified and marked complete with one explicitly accepted gap: fresh-database migration reproducibility was never demonstrated for the current schema (user chose to defer rather than spin up a throwaway Supabase project for it — low risk, no production data at stake).

Progress: [████░░░░░░] Phase 1/8 complete (12.5%)

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Next.js 16.x (not 14.x) required — Once UI's peer dependency floor is `next >=15.5`; corrects PROJECT.md's original "14+" framing.
- Roadmap: Schema amendments required before Phase 1 migrations — `cuotas` needs a template/instance split (per-house instance rows with `house_id`), and `payments` needs one row per selected cuota (batch transaction, optional `payment_batch_id`) instead of a singular `cuota_id`.
- Roadmap: Resident auth defaults to Pattern A (custom signed session, service-role-mediated, RLS as defense-in-depth) — confirm via short spike at the start of Phase 3 before writing RLS policies/session code.
- Schema: All 7 core tables carry a `condo_` prefix (e.g. `condo_houses`), and the domain word "cuota" is renamed to "installment" in every SQL identifier (`condo_installment_templates`, `condo_installments`, `installment_type`, `installment_id`, `parent_installment_id`) — user-requested 2026-09-05, applied post-merge on top of Plan 01-03's migration. Scoped to SQL identifiers only: ROADMAP.md's "Cuota Engine" phase name, `CUOT-01..07` requirement IDs, and CLAUDE.md's product description intentionally still use the Spanish "cuota" domain term and were NOT changed — future phases writing SQL against these tables must use the new `condo_`/`installment` names, but should keep referring to requirements as CUOT-* and the business concept as "cuota" in prose/UI.
- Infra: The condominio-app Supabase project is the user's own separate account/instance (ref yfbojfbtlvajxndssbtw), not the "AGA Social LLC" org the local Supabase CLI is authenticated as — the CLI has no management-API access to it (confirmed: `supabase link` returns a privilege error). Any future automated push/verify against the real project needs either a `--db-url` connection string with the DB password (bypasses account permissions) or the user running Supabase CLI commands themselves. Same pattern for GitHub (local `gh`/git session is account `byagasocial`, lacks push access to `BlueKiwiTech/condominio-app` — user pushes themselves) and Vercel (CLI here is also `byagasocial` — user handles all Vercel actions directly). Documented for future sessions in `AGENTS.md`.
- Accepted gap: Phase 1's "fresh database reproduces the schema exactly" success criterion was explicitly deferred by the user rather than verified (would require creating throwaway Supabase infrastructure under their account). Revisit if schema drift is ever suspected, but not blocking for now.

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 3 (Houses & Resident Access): resident auth mechanism (Pattern A vs. B, see research/ARCHITECTURE.md) needs an explicit spike/confirmation before RLS policies and session code are written — do not discover mid-build.
- Phase 4 (Cuota Engine): month-end date-clamping behavior for recurring cuotas (e.g., monthly cuota starting Jan 31) is not specified anywhere — needs an explicit product decision during planning, not an engineering default.
- Feature gap noted in research but NOT in v1 scope: payment receipt/comprobante was flagged as a domain-norm gap — it has since been folded into v1 as PMNT-08/Phase 5, so this is resolved, not open.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-09-06
Stopped at: Phase 2 UI-SPEC approved (5/6 dimensions PASS, 1 non-blocking FLAG on visual focal-point wording). Phase 2 has context + UI-SPEC but no plans yet.
Resume file: .planning/phases/02-admin-authentication/02-UI-SPEC.md
Resume command: `/gsd-plan-phase 2`

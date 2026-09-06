# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** The admin can always answer "who owes what, since when" — accurate morosos and saldo tracking is the thing that must work, before anything else.
**Current focus:** Phase 1 — Foundation & Deployment

## Current Position

Phase: 1 of 8 (Foundation & Deployment)
Plan: 6 plans (01-01 through 01-06), 4 waves — Wave 1 complete (01-01, 01-03), Wave 2 in progress (01-02 complete, 01-04 partial)
Status: Executing — 01-04 live Supabase push handed to user (their own Supabase account, not the CLI-authenticated org)
Last activity: 2026-09-06 — Wave 2 spawned; 01-02 completed and merged (Once UI + next-intl shell, build passes). 01-04's Task 1 (validation scripts) merged; Task 2/3 (live project push/verify) is being run manually by the user against their own Supabase project, not via executor agent — the auto-created "condominio-app" project (ref leefqkmddzokgpqnvshw, org AGA Social LLC) was abandoned mid-task when the user redirected to their own instance and is still live/unused (user chose to leave it for now). Schema was also amended post-merge (see Decisions below): all 7 tables now carry a condo_ prefix and "cuota" was renamed to "installment" in all SQL identifiers.

Progress: [████░░░░░░] 42%

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
- Infra: The condominio-app Supabase project is the user's own separate account/instance (ref yfbojfbtlvajxndssbtw), not the "AGA Social LLC" org the local Supabase CLI is authenticated as — the CLI has no management-API access to it (confirmed: `supabase link` returns a privilege error). Any future automated push/verify against the real project needs either a `--db-url` connection string with the DB password (bypasses account permissions) or the user running Supabase CLI commands themselves.

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
Stopped at: Phase 1 Wave 1 complete and merged (01-01 scaffold, 01-03 schema migration). Wave 2 (01-02, 01-04) not yet started — 01-04 will create a live Supabase project and push the migration, first real cloud-resource step in this phase.
Resume file: .planning/phases/01-foundation-deployment/01-02-PLAN.md (and 01-04-PLAN.md)
Resume command: `/gsd-execute-phase 1`

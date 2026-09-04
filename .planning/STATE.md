# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** The admin can always answer "who owes what, since when" — accurate morosos and saldo tracking is the thing that must work, before anything else.
**Current focus:** Phase 1 — Foundation & Deployment

## Current Position

Phase: 1 of 8 (Foundation & Deployment)
Plan: Not yet planned
Status: Ready to plan
Last activity: 2026-09-04 — Roadmap created from REQUIREMENTS.md and research findings

Progress: [░░░░░░░░░░] 0%

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

Last session: 2026-09-04
Stopped at: ROADMAP.md and STATE.md created; REQUIREMENTS.md traceability updated
Resume file: None

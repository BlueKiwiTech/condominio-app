# Phase 1: Foundation & Deployment - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold the Next.js 16 + Once UI app, ship the corrected Supabase schema (with the template/instance cuota split and multi-cuota payment support) with RLS enabled deny-by-default on every table, and stand up the Vercel production deployment pipeline. No admin auth, no houses/cuotas/payments UI, no resident-facing anything — those are later phases. This phase proves the deployed shell renders and the schema is correct and reproducible from migrations.

</domain>

<decisions>
## Implementation Decisions

### Admin Model
- **D-01:** Exactly one admin per community for v1 — two roles total in the system: `admin` and `resident` (neighbor). The schema's single `communities.admin_id` FK is correct as-is; do not add multi-admin/board-member support in this phase or roadmap. (Resolves the open question flagged in `research/ARCHITECTURE.md`.)

### Bootstrap / Seed Data
- **D-02:** No automated seed migration for the community row or the first admin account. The single ASOBARCELONA `communities` row and the initial admin linkage are created manually (one-time SQL via Supabase dashboard/CLI, or a manual insert) after Phase 1 ships — not through app UI, since admin signup doesn't exist until Phase 2. Migrations should create the schema/tables only; they should NOT insert the ASOBARCELONA row automatically.
- **D-03:** `communities.admin_id` can be NULL until the admin signs up in Phase 2 and the row is updated to point at their `auth.users.id`. Make the column nullable if the original handoff schema didn't already allow that.

### Local Development Workflow
- **D-04:** No local Supabase (no Docker, no local Supabase CLI stack). Development happens directly against a single hosted Supabase project. Migrations are still version-controlled files applied via the Supabase CLI (`supabase db push` or equivalent against the hosted project), just not run against a local instance first.

### Deployment Environments
- **D-05:** Production only — no preview/staging Vercel environment and no separate staging Supabase project for this build. One Vercel project, one Supabase project, `main` branch deploys to production directly.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Schema corrections (must apply before writing migrations)
- `.planning/research/ARCHITECTURE.md` — cuota template/instance split, multi-cuota payment structure, `status` column gap on cuotas, full amended schema rationale
- `docs/handoff-prompt.md` — original proposed schema (superseded by ARCHITECTURE.md's corrections, but still the source for table fields like `houses`, `house_residents`, `audit_logs` not otherwise changed)

### Stack / install specifics
- `.planning/research/STACK.md` — exact package versions, install commands, Once UI peer deps (`sass`, `sharp`), `@supabase/ssr` setup, what NOT to install (Tailwind config, `lucide-react`, separate `recharts`, `next-i18n-router`)

### Pitfalls to build against from day one
- `.planning/research/PITFALLS.md` — RLS + non-Auth-resident pattern, cuota generation idempotency (relevant when Phase 1 designs the schema/constraints that Phase 4 will rely on), date/timezone handling, Supabase SSR client mixing (`getSession()` vs `getUser()`/`getClaims()`)

### Project-level
- `.planning/PROJECT.md` — core value, constraints (single-tenant, no currency conversion)
- `.planning/REQUIREMENTS.md` — DPLY-01, DPLY-02 (this phase's mapped requirements)

</canonical_refs>

<code_context>
## Existing Code Insights

This is a greenfield repo — no `app/`, `src/`, or `package.json` exist yet. Nothing to reuse; this phase creates the foundation everything else builds on.

### Integration Points
- Whatever scaffolding structure this phase creates (folder layout, Supabase client helpers, migration setup) becomes the pattern every subsequent phase follows — get the `lib/supabase/` client setup (admin SSR client + service-role client) right here since Phase 2 (admin auth) and Phase 3 (resident auth) both depend on it.

</code_context>

<specifics>
## Specific Ideas

No specific visual/UX requirements for this phase — it's infrastructure. The "deployed shell renders" success criterion just needs the Once UI provider tree wired up without build errors; visual design of actual screens starts in later phases.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation-deployment*
*Context gathered: 2026-09-04*

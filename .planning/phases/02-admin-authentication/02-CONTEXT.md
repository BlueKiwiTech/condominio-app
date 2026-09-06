# Phase 2: Admin Authentication - Context

**Gathered:** 2026-09-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Admins can securely sign up, verify their email, log in, stay logged in across a browser refresh, and recover access via password reset — using standard Supabase Auth (`@supabase/ssr`). This phase does NOT touch resident/PIN auth (Phase 3), houses/residents CRUD (Phase 3), or any cuota/payment/reporting feature.

</domain>

<decisions>
## Implementation Decisions

### Signup gating

- **D-01:** Admin signup is gated by an allowlist, not fully open. This is a single-community app (ASOBARCELONA) with no public SaaS multi-tenancy, and the schema (`communities.admin_id`, a single nullable FK built in Phase 1) only supports one admin.
- **D-02:** The allowlist holds exactly ONE email for Phase 2 — matching the schema's single-admin design exactly. A second admin/treasurer account is explicitly OUT of scope for this phase (would need a schema change and its own decision later — noted in Deferred Ideas below, not built now).
- **D-03:** Allowlist mechanism: an environment variable (e.g. `ADMIN_ALLOWLIST_EMAIL` or similar — exact naming is the planner's/executor's discretion) holding the one approved email. Signup checks the submitted email against this env var before creating any Supabase Auth account.
- **D-04:** When someone NOT on the allowlist attempts to sign up: show a clear, honest rejection message (e.g. "This app is invite-only") on the signup form. Do NOT silently fail or create an unusable account — the user explicitly chose clarity over anti-enumeration hardening, appropriate for a single-community app where the one legitimate admin already knows they're expected to sign up.
- **D-05:** On successful signup by the allowlisted email, this account is the one that gets linked to `communities.admin_id` (per the existing D-03 decision from Phase 1: "communities.admin_id stays nullable until Phase 2 admin signup links it"). Since the allowlist is single-email, there's no ambiguity about which account this should be.

### Claude's Discretion

- Exact allowlist env var name and format (single string vs. comma-separated list structured for future extension — either is fine as long as it currently enforces exactly one email).
- Email verification enforcement details (whether any dashboard route is reachable pre-verification, or all admin routes redirect to a "verify your email" holding page) — not discussed, use Supabase's standard verified-before-full-access pattern per AUTH-02's wording ("receives a verification email before gaining full access").
- Session persistence specifics (exact cookie/session duration, remember-me UX) — not discussed, follow `@supabase/ssr`'s standard cookie-based session pattern already partially wired in `proxy.ts` (Phase 1).
- Password reset flow UI/copy — not discussed, standard Supabase Auth email-link reset is assumed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dual-auth pattern (admin half)
- `.planning/research/STACK.md` §"Stack Patterns by Variant" → "Dual-Auth: Admin (Supabase Auth) + Resident" — the admin auth flow: `@supabase/ssr`, `signInWithPassword()`, cookie-based session via `createServerClient`, `getClaims()` for the fast middleware/proxy redirect check, `getUser()` (network-verified) before any sensitive Server Action/Route Handler — never `getSession()` as the actual authorization gate.
- `.planning/research/PITFALLS.md` — check for any auth-specific pitfalls before implementing (not fully reviewed in this discussion; planner/researcher should scan it).

### Existing schema/code this phase builds on
- `supabase/migrations/20260906005943_initial_schema.sql` — `condo_communities.admin_id uuid references auth.users(id)` (nullable), the FK this phase's signup flow links.
- `proxy.ts` (Phase 1, `lib/supabase/server.ts`/`client.ts`) — already composes `getClaims()` in the root interceptor; this phase extends that pattern for actual route protection, doesn't replace it.
- `.planning/PROJECT.md` — "Admin can sign up/log in with email + password (Supabase Auth), with email verification and password reset" (original scope statement, matches ROADMAP.md Phase 2).

No other external specs apply — requirements fully captured in REQUIREMENTS.md AUTH-01..04 and the decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase/server.ts` — `createClient()` for Server Components/Actions, already correctly scoped. Admin signup/login Server Actions should use this.
- `lib/supabase/client.ts` — `createClient()` for Client Components (now `'use client'`-marked). Any client-side auth UI (form state, etc.) uses this.
- `proxy.ts` — already composes next-intl locale routing with a Supabase `getClaims()` check (currently a no-op check, no routes gated yet). This phase is where route-gating logic actually gets added.
- `components/Providers.tsx`, Once UI component library — available for building the signup/login/reset forms (Column, Heading, Text, form inputs already proven to work in the Phase 1 shell).

### Established Patterns
- Locale-aware routing already wired (`app/[locale]/...`) — new auth routes/pages must live under `app/[locale]/` to stay consistent with next-intl.
- Env var naming convention: `NEXT_PUBLIC_` prefix only for values safe in the client bundle (established in Phase 1 for Supabase keys) — the admin allowlist email is server-only config and must NOT get a `NEXT_PUBLIC_` prefix.

### Integration Points
- `condo_communities.admin_id` — the FK this phase's signup flow populates on first (and only) successful signup.
- `proxy.ts`'s existing `getClaims()` call — extend this to actually redirect unauthenticated visitors from admin routes to login (currently just calls it with no gating logic, per Phase 1 scope).

</code_context>

<specifics>
## Specific Ideas

No specific UI/copy references given beyond the decisions above — standard Supabase Auth flows (signup, verify, login, reset) with Once UI components.

</specifics>

<deferred>
## Deferred Ideas

- **Second admin / treasurer account support** — the community's `admin_id` schema is single-admin by design. If a second admin (e.g. a treasurer role) is ever needed, this requires a schema change (e.g. a join table or multi-value admin list) and its own phase/decision — explicitly out of scope for Phase 2. Noted here so it isn't lost, and so `communities.admin_id`'s single-FK shape isn't mistaken for an oversight later.

</deferred>

---

*Phase: 02-admin-authentication*
*Context gathered: 2026-09-06*

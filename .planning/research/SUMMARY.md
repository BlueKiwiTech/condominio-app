# Project Research Summary

**Project:** condominio-app (ASOBARCELONA)
**Domain:** Condo/HOA payment-management web app, single-tenant, dual-auth (admin + resident PIN)
**Researched:** 2026-09-04
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is a single-tenant dues/payment-tracking web app for one closed community (ASOBARCELONA), built on Next.js (16.x — see stack note below) + Supabase + Once UI, deployed on Vercel. Experts build this class of product ("who owes what, since when") around a clean separation between *cuota definitions* (what's owed) and *cuota instances* (per-house, per-installment payable records), with all delinquency/balance reporting computed live from those instances rather than cached or client-computed. The user's already-specified v1 feature scope (recurring + divisible cuotas, manual payment registration, morosos dashboard, resident self-service via house+PIN) is well-matched to the domain and correctly excludes the bloat (online payment gateways, full accounting, maintenance/amenities modules) that makes general HOA suites heavy. The one clear gap versus domain norms is a payment receipt/comprobante view, recommended as an early v1.x addition rather than a launch blocker.

The recommended approach: Next.js 16.x (not 14.x — Once UI's peer dependency requires `next >=15.5`, overriding the original "14+" constraint), `@supabase/ssr` for admin auth, and a custom app-level session (signed httpOnly cookie via `jose`, PIN verified server-side via Postgres `pgcrypto` or `bcryptjs`) for resident auth — residents never receive a Supabase Auth session or client-side Supabase credential. RLS stays enabled deny-by-default on every table as a backstop, but for residents the actual scoping enforcement happens in trusted server code (Server Actions using the service-role client, always filtered by a session-derived `house_id`). This is a deliberate, documented tradeoff (Pattern A in STACK.md/ARCHITECTURE.md) chosen over a more RLS-native alternative (Supabase anonymous sign-in + custom JWT claims) because it has far fewer moving parts for this project's scale.

The primary risks are not exotic — they're the standard traps of financial/multi-currency logic and dual-auth systems, and all are well-documented with concrete prevention strategies: (1) RLS silently returning empty data for residents because they never populate `auth.uid()`, tempting a dangerous "just use `USING (true)`" fix; (2) naive `SUM()` balance queries that silently add USD+Bs+USDT into one meaningless number; (3) unguarded bulk cuota-generation producing duplicate or misdated installments on retry/double-click; (4) JS `Date` vs. Postgres `DATE` timezone mismatches shifting due dates and "days overdue" by one; (5) a 4-digit resident PIN being trivially brute-forceable online without rate limiting, even though it's correctly hashed. Two schema issues from the original handoff spec must also be fixed before Phase 1 migrations: `cuotas.applicable_houses UUID[]` needs to become a template/instance split (per-house `cuotas` rows), and `payments.cuota_id` (singular) needs to support "one payment covers multiple cuotas" (via one payment row per cuota in a batch transaction, not a single FK).

## Key Findings

### Recommended Stack

Next.js 16.3.x (App Router, TypeScript) is the correct version despite the original "14+" framing — Once UI Core's peer dependency (`next: ">=15.5"`) makes 14.x uninstallable alongside it, so the project should standardize on 16.x with React 19. Supabase auth/data access goes through `@supabase/ssr` (the current, non-deprecated package — never `@supabase/auth-helpers-nextjs`). Once UI is confirmed to be a Sass/CSS-variable-based design system, NOT Tailwind-based — scaffolding should use `--no-tailwind` and required peer deps (`sass`, `sharp`) must be installed explicitly. `next-intl` is the recommended i18n library (purpose-built for App Router, Server-Component-native, no hydration cost) over the originally-proposed `next-i18n-router`+`i18next` combination.

**Core technologies:**
- Next.js 16.3.x + TypeScript — App Router, Server Actions, satisfies project constraint once corrected for Once UI's real peer-dep floor
- Supabase (`@supabase/ssr` + `@supabase/supabase-js`) — Postgres + Auth backend, cookie-based SSR sessions for admins
- Once UI Core (`@once-ui-system/core`) — component/design system, Sass-based (not Tailwind), user-locked
- `next-intl` — Spanish-default/English-secondary i18n, Server Component translations
- `zod` + `react-hook-form` + `@hookform/resolvers` — form/Server Action input validation
- `date-fns` (already bundled via Once UI) — cadence math, calendar-day-aware overdue calculations
- `jose` + Postgres `pgcrypto` (or `bcryptjs`) — resident PIN hashing and signed session cookies

### Expected Features

The user's v1 spec matches domain table stakes closely (dues/cuota management, manual payment registration, morosos tracking, resident balance/history, multi-currency without forced conversion, monthly reporting) and correctly excludes the scope that bloats general HOA suites (online payment gateways, full accounting/GL, maintenance/amenities/voting, multi-tenant support, automated late fees). The one identified gap: a payment receipt/comprobante view is standard across every competitor reviewed (VecinosWeb, general HOA portals) and is absent from the current spec.

**Must have (table stakes) — all already in spec:**
- Recurring + special/divisible cuota creation, manual payment registration, morosos dashboard, resident saldo + payment history, monthly reports, house CRUD, multi-currency tracking (no conversion), dual auth (admin email/password + resident house+PIN), bilingual UI

**Should have (differentiators for this specific community):**
- No-email house+PIN resident login (lowers adoption friction vs. every competitor's email-based portals)
- Multi-currency shown as-entered, no forced conversion (simpler and more honest than competitors' BCV-rate conversion)
- Color-coded resident cuota calendar

**Defer (v1.x / v2+):**
- Payment receipt/comprobante (recommend early v1.x — the one real gap vs. domain norms)
- CSV/Excel export, audit log UI, basic in-app due-date reminders (v1.x)
- WhatsApp/SMS automated reminders, automated late fees, expense/accounting module, online/card/crypto payment processing (v2+, several likely never needed for a single-tenant internal tool)

### Architecture Approach

The system splits into two parallel-buildable tracks after a foundational scaffold + admin-auth + houses phase: a resident-auth track and a cuota-engine → payments → saldo/morosos track, converging only at the resident portal (which needs both). The proposed handoff folder structure (`app/(admin)`, `app/(resident)`, `lib/*`) is sound and should be kept, with Server Actions preferred over a full REST-style `app/api/*` layer (reserve API routes for the resident PIN-verify endpoint and anything needing to run before a session exists).

**Major components:**
1. Admin auth — `@supabase/ssr`, real `auth.users` rows, standard RLS via `auth.uid()`
2. Resident auth — server-only PIN verification (service-role client + `pgcrypto`/`bcryptjs`), custom signed session cookie (`jose`), never a Supabase credential in the browser
3. Cuota engine — template vs. instance split; generates N per-house/per-installment payable rows from one admin submission, transactionally, with an idempotency key
4. Payments — multi-row transactional insert (one row per selected cuota) against existing pending cuota instances
5. Reporting layer (saldo/morosos) — SQL aggregation grouped by currency, computed live at query time, never client-computed or cached at this scale

### Critical Pitfalls

1. **RLS blind spot for residents** — residents never populate `auth.uid()`, so naive RLS policies return empty data; fix is to treat RLS as defense-in-depth only for residents, with authorization enforced in trusted server code (service-role client + explicit `house_id` filter from a verified session), never `USING (true)` as a shortcut.
2. **Multi-currency summing bugs** — any `SUM()` without `GROUP BY currency` silently produces a meaningless combined number (e.g., USD + Bs added together); every saldo/balance calculation must return a per-currency array, never a scalar, and must be unit-tested with multi-currency, partial-payment fixtures before UI wiring.
3. **Cuota generation duplication/misdating** — bulk multi-row inserts triggered by one "Save" click need a DB transaction, an idempotency key (to survive double-clicks/retries), and pre-computed (not iteratively-mutated) due dates to avoid month-end date drift.
4. **JS Date / Postgres DATE timezone mismatch** — off-by-one errors in due dates and "days overdue" from naive `new Date()` round-tripping; fix with a pinned project timezone (`America/Caracas`), `date-fns`'s `parseISO`/`differenceInCalendarDays`, and dates kept as `yyyy-MM-dd` strings until calendar math is needed.
5. **Resident PIN brute-forceability** — a 4-digit PIN has only 10,000 combinations; bcrypt/pgcrypto hashing alone doesn't stop online brute-forcing, so per-house rate limiting/lockout must ship in the same unit of work as PIN hashing, not as a later hardening pass.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Scaffold + Foundational Schema
**Rationale:** Everything else depends on the corrected schema and base infra existing; nothing else can be meaningfully built or tested without it.
**Delivers:** Next.js 16.x + Once UI + i18n shell scaffolded; Supabase project with corrected schema (`communities`, `houses`, `house_residents`, `cuota_templates`, `cuotas` [instances with `house_id`], `payments`, `audit_logs`); RLS enabled deny-by-default on every table; shared `lib/dates.ts` timezone utility established.
**Avoids:** Pitfall 4 (timezone), sets up the schema fix for Pitfalls 2/3 (currency grouping, instance-vs-template).

### Phase 2: Admin Auth
**Rationale:** Every admin-facing feature (houses, cuotas, payments, reports) requires this first; it's pure, well-documented Supabase patterns (HIGH confidence, no research flag needed).
**Delivers:** Supabase Auth email/password login, verification, reset; `@supabase/ssr` client setup (browser/server/middleware split); `getUser()`-based route gating (never `getSession()`).
**Uses:** `@supabase/ssr`, `@supabase/supabase-js`.
**Avoids:** Pitfall 6 (browser/server client mixing, session flakiness).

### Phase 3: Houses (Admin CRUD)
**Rationale:** Houses are the FK target for residents, cuotas, and payments — nothing downstream can be built against real data without them.
**Delivers:** House create/edit/delete, owner info fields.
**Addresses:** House/unit CRUD (table stakes).

### Phase 4a: Resident Auth (Dual-Auth Spike + Implementation)
**Rationale:** This is flagged by all four research files as the trickiest architectural piece and the single item most likely to need a short spike before full implementation — decide Pattern A (custom session, recommended) vs. Pattern B (anonymous sign-in + custom JWT claims) explicitly, don't discover it mid-build.
**Delivers:** House+PIN resident login, PIN hashing (pgcrypto or bcryptjs), signed resident session cookie (`jose`), per-house rate limiting/lockout on the login endpoint.
**Avoids:** Pitfall 1 (RLS blind spot for residents), Pitfall 5 (PIN brute-force).
**Can run in parallel with:** Phase 4b (cuota engine), since they're independent tracks that only converge at the resident portal.

### Phase 4b: Cuota Engine (Templates + Generation)
**Rationale:** Highest-risk business logic (PROJECT.md flags this explicitly as core, not incidental); must be built and unit-tested as pure functions before payments need something to point at.
**Delivers:** Recurring cuota generation (fan-out across houses/installments), divisible special-cuota parent/child splitting, transactional batch insert with idempotency key, due-date preview in the admin form.
**Addresses:** Recurring + special/divisible cuota creation (P1 features).
**Avoids:** Pitfall 3 (duplicate/misdated generation).

### Phase 5: Payments (Registration, Multi-Cuota)
**Rationale:** Needs real cuota instances (Phase 4b) to select against; the multi-row transaction pattern (one payment row per selected cuota) directly resolves the schema's original single-`cuota_id` limitation.
**Delivers:** Admin payment registration UI, currency-match validation, multi-cuota selection with batch transactional insert, cuota status updates in the same transaction.
**Addresses:** Manual payment registration (P1).

### Phase 6: Saldo + Morosos Computation
**Rationale:** This is where PROJECT.md's stated core value ("accurate morosos/saldo tracking must work before anything else") actually gets validated — needs real cuota + payment data flowing through Phases 4b/5 to test against; should be built and unit-tested in isolation before UI wiring.
**Delivers:** Per-currency saldo calculation, morosos (delinquency) query computed live at query time (never cached/stale status), unit test fixtures for multi-currency + partial-payment + multi-cuota-payment scenarios.
**Avoids:** Pitfall 2 (currency summing bugs).

### Phase 7: Admin Dashboard + Reports
**Rationale:** Pure read-side consumption of the reporting layer built in Phase 6 — lowest-risk phase once the underlying computation is correct.
**Delivers:** KPI dashboard, morosos list, monthly report (expected/paid/balance/status per house).
**Addresses:** Admin dashboard, monthly report (P1 table-stakes reporting).

### Phase 8: Resident Portal
**Rationale:** Intentionally last among feature phases — needs both resident auth (Phase 4a) and working saldo/morosos (Phase 6) to have anything meaningful to show; matches PROJECT.md's stated priority that admin-side accuracy matters more than resident self-service.
**Delivers:** Resident cuota calendar (color-coded), saldo + payment history view, scoped strictly to the session's `house_id`.
**Addresses:** Resident-facing P1 features.

### Phase 9: i18n Completion, Polish, v1.x candidates
**Rationale:** Cross-cutting, lowest risk; safe to interleave throughout or finish at the end. Also the natural place to slot the one identified feature gap.
**Delivers:** Full ES/EN translation coverage, audit log writes (table exists, no UI needed yet), and — recommend pulling forward — payment receipt/comprobante view given it's the one clear domain-norm gap.
**Addresses:** Bilingual UI (P1), payment receipt/comprobante (flagged gap, P2).

### Phase Ordering Rationale

- Dependency chain is strict at the start (scaffold → admin auth → houses) because houses are the FK target for everything else.
- After houses exist, resident-auth and cuota-engine/payments/reporting can proceed as two parallel tracks — they don't depend on each other, only both depend on houses.
- Resident portal is deliberately last because it's the only feature requiring both tracks (resident auth AND correct saldo/morosos) to be done.
- This ordering directly avoids the pitfalls research's core warning: don't let resident-facing RLS/auth get discovered late under deadline pressure (Pitfall 1), and don't let saldo/morosos ship before being isolated and unit-tested (Pitfall 2).

### Research Flags

Needs research during planning:
- **Phase 4a (Resident Auth):** MEDIUM confidence in the stack/architecture research — the dual-auth "PIN with no email" pattern is a synthesis of documented Supabase primitives, not a single official recipe. Recommend a short technical spike at the start of this phase to confirm Pattern A (custom session) vs. Pattern B (anonymous sign-in + custom JWT claims) before writing RLS policies or session code.
- **Phase 4b (Cuota Engine):** Needs an explicit, documented decision on month-end date-clamping behavior (e.g., a monthly cuota starting Jan 31 — does it clamp to month-end or shift to a fixed day?) — not a "needs external research" flag, but needs a business decision captured before implementation.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 2 (Admin Auth):** Textbook `@supabase/ssr` App Router pattern, HIGH confidence, official docs cover this fully.
- **Phase 3 (Houses):** Standard CRUD, no domain-specific risk.
- **Phase 6 (Saldo/Morosos):** Well-specified in PITFALLS.md with concrete prevention patterns (currency grouping, calendar-day math) — implementation risk is real but the *pattern* to follow is already fully documented, not something requiring further research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH for versions/libraries (directly queried npm registry + Context7 at research time); MEDIUM for the dual-auth composite pattern (synthesis, not a single official tutorial) |
| Features | MEDIUM (WebSearch + one direct-fetch competitor site; no equivalent to Context7 for this SaaS-product domain, but cross-validated against both Venezuela-niche and US-general HOA competitors) |
| Architecture | MEDIUM-HIGH (component boundaries and build order are HIGH confidence, directly derived from schema/spec analysis; the resident-auth/RLS mechanism is MEDIUM and explicitly flagged as needing an early spike) |
| Pitfalls | MEDIUM-HIGH (RLS/auth and Next.js/Supabase integration patterns verified against current official docs and multiple sources; financial-logic and cuota-generation pitfalls are HIGH confidence from direct schema/spec analysis; general HOA-software post-mortems are LOW confidence — narrow niche, little public writing) |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Resident auth pattern (Pattern A vs. B):** Not fully resolved — recommend Pattern A (custom session, service-role-mediated) as the default, but this should be explicitly re-confirmed via a short spike at the start of the resident-auth phase before RLS policies and session code are written into the roadmap's acceptance criteria.
- **Schema amendments not yet applied:** The original handoff schema's `cuotas.applicable_houses UUID[]` (should be a template/instance split) and `payments.cuota_id` (singular, should support multi-cuota payments via batch transaction) must be corrected before Phase 1 migrations are written — flag this explicitly in the roadmap's Phase 1 acceptance criteria, not left implicit.
- **Month-end date-clamping decision for recurring cuotas:** Not specified anywhere in the original spec (does a monthly cuota starting the 31st clamp to month-end or shift day-of-month?) — needs an explicit product decision during Phase 4b planning, not an engineering default.
- **Payment receipt/comprobante:** Identified as a real domain-norm gap but not in the original active requirements — recommend flagging to the user/roadmapper as a candidate for early v1.x inclusion rather than assuming it stays deferred indefinitely.
- **Once UI component API specifics:** Not verified in this research pass beyond peer-dependency/install requirements — PITFALLS.md flags this as a risk (don't assume shadcn/MUI-like API parity); recommend checking Once UI's actual Button/Table/Modal/Select docs before building components against it, during implementation rather than research.

## Sources

### Primary (HIGH confidence)
- Context7 `/supabase/ssr`, `/once-ui-system/core`, `/once-ui-system/nextjs-starter`, `/amannn/next-intl` — install/peer deps, cookie/session patterns, routing config
- npm registry (`npm view`) — live version numbers for all core/supporting libraries, queried directly at research time (2026-09-04)
- Supabase official docs: Server-Side Auth for Next.js, Row Level Security, Custom Access Token Hook, Anonymous Sign-Ins, Custom Claims & RBAC, Token Security and RLS
- Direct analysis of `docs/handoff-prompt.md` and `.planning/PROJECT.md` — schema/business-logic pseudocode, cross-checked for internal consistency

### Secondary (MEDIUM confidence)
- WebSearch (multiple 2026 sources, cross-referenced) — `@supabase/auth-helpers-nextjs` deprecation, `next-intl` vs. `next-i18n-router` positioning, Next.js 16 production-readiness, `getUser()` vs `getClaims()` semantics
- [Custom claims: app_metadata or new key? · supabase discussion #30381](https://github.com/orgs/supabase/discussions/30381)
- [Using Supabase RLS with a custom auth provider — Grace Wang, Medium](https://medium.com/@gracew/using-supabase-rls-with-a-custom-auth-provider-b31564172d5d)
- [@supabase/ssr: AuthSessionMissingError in Next.js 14.2+/15 — GitHub Issue #107](https://github.com/supabase/ssr/issues/107)
- [Supabase RLS Best Practices — makerkit.dev](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)
- Competitor feature analysis: VecinosWeb (direct-fetched), MeruSoft, Odoo Condominio, Buildium, AppFolio, ManageCasa, Condo Control

### Tertiary (LOW confidence)
- General HOA-software post-mortems / domain-specific war stories — narrow niche, little public writing beyond vendor marketing pages
- Multi-currency ledger issue examples (e.g., Dolibarr GitHub issue) used as illustrative pattern only, not directly validated against this project's schema

---
*Research completed: 2026-09-04*
*Ready for roadmap: yes*

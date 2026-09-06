# Condominio App — ASOBARCELONA — Project Plan & Status

**Last updated:** 2026-09-06

This file is the single source of truth for scope, decisions, and status going forward. It replaces the `.planning/` GSD structure for day-to-day tracking — historical detail from that process (per-plan summaries, verification reports, discussion logs) still lives under `.planning/` if needed for reference, but isn't required reading to pick up work.

---

## What This Is

A payment-management web app for ASOBARCELONA, a closed community (calle cerrada / condominio / HOA). Admins define recurring and special "cuotas" (dues), register payments per house, and track who's behind. Residents log in with their house + a PIN to check their own balance and payment history — no email required. Single-tenant (built for this one community, not a multi-tenant SaaS).

**Core value:** The admin can always answer "who owes what, since when" — accurate morosos (delinquent accounts) and saldo (balance) tracking is the thing that must work, before anything else.

---

## Tech Stack

- **Next.js 16.3.x** (App Router, TypeScript)
- **Supabase** (Postgres + Auth) via `@supabase/ssr`
- **Once UI** (`@once-ui-system/core`) — Sass + CSS variables, NOT Tailwind. Bundles its own icons (`react-icons`) and charts (`recharts`) — don't add separate packages for either.
- **next-intl** — Spanish default (`localePrefix: 'as-needed'`), English secondary
- **zod + react-hook-form + @hookform/resolvers** for form/Server Action validation
- **date-fns** for cadence math and "days overdue" — always calendar-day-safe functions, never raw UTC string splitting
- **pgcrypto** (Postgres extension) for resident PIN hashing
- **jose** for signing the resident's app-level session cookie
- Vercel for hosting

**Dual-auth pattern:** Admins use standard Supabase Auth (`@supabase/ssr`, `getClaims()`/`getUser()`, RLS keyed off `auth.uid()`). Residents never get a Supabase Auth session — a Route Handler verifies `{house_id, pin}` server-side via the service-role client (PIN hash via `pgcrypto`), then mints its own short-lived signed httpOnly cookie (via `jose`) carrying `{house_id, resident_id, role: 'resident'}`. Resident reads go through a `getResidentScopedClient(houseId)` helper, always filtered by `house_id`. RLS stays enabled everywhere as a backstop even though resident-path enforcement lives in server code.

**Auth authorization rule (locked, from research):** Never use `getSession()` as an authorization gate — it reads the JWT from cookies without verifying it against the auth server. Use `getClaims()` (fast, local verification) for middleware/proxy redirect checks, and `getUser()` (network-verified) before any sensitive Server Action/Route Handler.

---

## Database Naming Convention (locked, do not deviate)

Every table (and any trigger/function) uses a **`condo_` prefix**. The Spanish domain word "cuota" is renamed to **"installment"** in all SQL identifiers only:

- `condo_communities`, `condo_houses`, `condo_house_residents`, `condo_installment_templates`, `condo_installments`, `condo_payments`, `condo_audit_logs`
- `installment_type`, `installment_id`, `parent_installment_id`

This is scoped to SQL identifiers only — the business/product vocabulary stays Spanish: "cuota" in UI copy, requirement IDs (`CUOT-01..07`), and this document's prose.

**Infra/access notes** (same pattern for three different services — see `AGENTS.md` for full detail):
- **Supabase**: the live project (`yfbojfbtlvajxndssbtw`) is the user's own account, not the CLI-authenticated org in this dev environment. Migrations get written here, but **the user pushes them** via Dashboard SQL Editor or their own CLI session.
- **GitHub**: push access to `BlueKiwiTech/condominio-app` isn't available to the local `gh`/git session (different account). **The user pushes** `git push origin main` themselves.
- **Vercel**: same story — CLI here is a different account. **The user handles all Vercel actions** (env vars, deploys) directly. Deploys are Git-connected to `main`, so a push to GitHub is what actually ships a change.

---

## Requirements (v1) — 39 total, 39/39 mapped to phases

Legend: ✅ done · 🔲 not started

### Deployment (DPLY) — Phase 1
- ✅ **DPLY-01**: App deployed to Vercel, env vars configured for the Supabase project
- ✅ **DPLY-02**: RLS enabled on every table, migrations version-controlled

### Authentication (AUTH) — Phases 2 & 3
- 🔲 **AUTH-01**: Admin can sign up with email and password (Supabase Auth)
- 🔲 **AUTH-02**: Admin receives email verification after signup
- 🔲 **AUTH-03**: Admin can reset password via email link
- 🔲 **AUTH-04**: Admin session persists across browser refresh
- 🔲 **AUTH-05**: Resident can log in by house number + the house's PIN, no email *(corrected: PIN is one-per-house, not one-per-resident — see Phase 3 decisions)*
- 🔲 **AUTH-06**: House PIN hashed at rest, login rate-limited against brute-force (5 attempts → 15-min lockout, per house)
- 🔲 **AUTH-07**: RLS/equivalent ensures admins see everything, residents see only their house

### Houses (HOUS) — Phase 3
- 🔲 **HOUS-01**: Admin can create a house (number, name, owner name/phone/email, **PIN** — PIN lives on the house, not per-resident)
- 🔲 **HOUS-02**: Admin can edit a house (including resetting its PIN)
- 🔲 **HOUS-03**: Admin can delete a house
- 🔲 **HOUS-04**: Admin can view list of all houses
- 🔲 **HOUS-05**: Admin can add residents (name, phone — display/contact info only, no individual PIN) to a house

### Cuotas (CUOT) — Phase 4
- 🔲 **CUOT-01**: Recurring cuota (name, cadence, amount, currency, start date, # installments, target houses)
- 🔲 **CUOT-02**: One cuota instance per installment per applicable house (not a shared record)
- 🔲 **CUOT-03**: Special/one-time cuota (name, amount, currency)
- 🔲 **CUOT-04**: Special cuota optionally divided into N installments, staggered due dates (parent/child)
- 🔲 **CUOT-05**: Generation is transactional + idempotent — no duplicate installments on retry/double-click
- 🔲 **CUOT-06**: Admin can edit/delete a cuota (or template) before any payment exists against it
- 🔲 **CUOT-07**: Admin can list all cuotas with status (pending/paid/overdue)

### Payments (PMNT) — Phase 5
- 🔲 **PMNT-01**: Admin selects a house, sees its pending cuotas
- 🔲 **PMNT-02**: Register one payment against multiple selected pending cuotas in one action
- 🔲 **PMNT-03**: Amount pre-fills from cuota sum, adjustable (partial payment)
- 🔲 **PMNT-04**: Payment currency must match the cuota's currency
- 🔲 **PMNT-05**: Date defaults to today (changeable), optional notes
- 🔲 **PMNT-06**: Registering a payment updates cuota status(es) (pending/partial/paid)
- 🔲 **PMNT-07**: Admin can view payment history, filterable by house
- 🔲 **PMNT-08**: Resident can view/print a receipt (comprobante) for a payment

### Reporting & Delinquency (RPRT) — Phase 6
- 🔲 **RPRT-01**: Admin dashboard KPIs (collected this month, outstanding, # morosos)
- 🔲 **RPRT-02**: Morosos list (house, owner, owed, owed-since, days overdue, currency) — live-computed, never stale
- 🔲 **RPRT-03**: Morosos/saldo always grouped per currency — USD/Bs/USDT never summed together
- 🔲 **RPRT-04**: Monthly report per house: expected vs. paid vs. balance vs. status
- 🔲 **RPRT-05**: Calendar-day-safe date math in a fixed timezone (never raw UTC splitting)

### Resident Portal (RSDT) — Phase 7
- 🔲 **RSDT-01**: Resident views own cuotas as calendar/grid, color-coded by status
- 🔲 **RSDT-02**: Resident views own saldo — "credit" (positive) or "debt since [date]" (negative)
- 🔲 **RSDT-03**: Resident views own payment history

### Internationalization (I18N) — Phase 8
- 🔲 **I18N-01**: All admin/resident UI text available in Spanish (default) and English
- 🔲 **I18N-02**: Locale switching doesn't lose the user's place in the app

### Out of Scope (v1) — don't build these without an explicit decision to revisit
Multi-tenant/multi-community support · currency conversion between USD/Bs/USDT · online/card/crypto payment processing · full accounting suite (budgets, ledger) · maintenance/work orders/amenity booking/e-voting/document repository · automated late-fee/penalty rules · WhatsApp/SMS automated reminders · CSV export of reports · audit log browsing UI.

---

## Phase-by-Phase Status

### ✅ Phase 1: Foundation & Deployment — COMPLETE
**Goal:** App scaffolded, deployable, backed by a correctly-shaped Supabase schema.

Built: Next.js 16 + Once UI + next-intl shell; corrected 7-table `condo_`-prefixed schema with RLS deny-by-default (zero policies); Supabase SSR client helpers (`lib/supabase/server.ts`, `client.ts`, `proxy.ts` using `getClaims()`); live deployment at `https://condominio-app-sigma.vercel.app`.

Verified: RLS enabled + zero policies confirmed live; deployed shell renders correctly (a real invisible-heading CSS bug was found and fixed — Once UI needs an explicit `body { background: var(--page-background) }` rule, it doesn't paint one itself); secret key confirmed absent from client bundle.

**Accepted gap:** fresh-database migration reproducibility was never demonstrated for the current schema (would require spinning up a throwaway Supabase project) — user explicitly deferred this as low-risk for a single-developer project with no production data yet. Revisit only if schema drift is ever suspected.

Follow-up migration `20260906033502_schema_hardening.sql` also shipped (from code review): moved `pgcrypto` out of `public` into an `extensions` schema, closed a NULL loophole in the installment idempotency guard, added a trigger enforcing payment currency matches installment currency.

### 🔲 Phase 2: Admin Authentication — CONTEXT + UI-SPEC DONE, NOT BUILT
**Goal:** Admins can securely sign up, verify, log in, and recover access to their accounts.
**Depends on:** Phase 1 ✅

**Decisions made:**
- Signup is gated by a **single-email allowlist** (env var, server-only, no `NEXT_PUBLIC_` prefix) — matches the schema's `condo_communities.admin_id` single-FK design exactly. A second admin/treasurer account is explicitly out of scope (would need a schema change, its own future decision).
- Non-allowlisted signup attempts get a clear "this app is invite-only" rejection — not a silent failure.
- On successful signup, that account is what gets linked to `condo_communities.admin_id`.
- UI design contract approved (Once UI components, copy in es/en, spacing/typography/color tokens) for: signup, verify-email holding page, login, password-reset request, password-reset completion.

**Left to implementation discretion:** exact allowlist env var name, email-verification enforcement details (which routes reachable pre-verification), session persistence specifics, password-reset UI copy beyond what's in the UI-SPEC.

**Not yet built:** any of the actual signup/login/verify/reset pages, Server Actions, or `proxy.ts` route-gating logic (currently a no-op `getClaims()` call from Phase 1).

**Reference docs still available if useful:** `.planning/phases/02-admin-authentication/02-CONTEXT.md`, `02-UI-SPEC.md`, `02-PATTERNS.md` (codebase analog mapping — e.g. `lib/supabase/server.ts` is the client factory to reuse, Once UI's `Input`/`PasswordInput` have a fixed `error`/`errorMessage` prop contract).

### 🔲 Phase 3: Houses & Resident Access — NOT STARTED
**Goal:** Admin manages houses/residents; residents log in independently via house + PIN.
**Depends on:** Phase 2

**Decisions made (2026-09-06):**
- **PIN is one-per-HOUSE, not one-per-resident.** Login = `house_number` + the house's single shared PIN. **Schema correction needed from Phase 1:** move `pin_hash` off `condo_house_residents` and onto `condo_houses` (residents keep name/phone as display/contact info only, no individual PIN). Update HOUS-05 accordingly: "Admin can add one or more residents (name, phone) to a house; the house itself has one PIN."
- **Resident session mechanism: Pattern A confirmed** — custom signed httpOnly cookie (via `jose`), no Supabase Auth session for residents at all. A Route Handler verifies `{house_id, pin}` server-side via the service-role client (PIN hash comparison via `pgcrypto`), then mints the cookie carrying `{house_id}`. All resident reads go through a service-role client manually filtered by `house_id`. RLS stays enabled as a backstop, not the primary enforcement path.
- **PIN lockout:** 5 failed attempts → 15-minute lockout, scoped per house.
- **PIN assignment:** admin sets the PIN when creating/editing a house (no resident self-service PIN change in v1).
- **Resident session duration:** long-lived (~30 days), "remember this device" style — minimize re-entry friction.

### 🔲 Phase 4: Cuota Engine — NOT STARTED
**Goal:** Admin defines recurring and special cuotas generating correct per-house installments.
**Depends on:** Phase 3

**Decisions made (2026-09-06):**
- **Month-end dates:** recurring cuotas always land on the **1st of each month**, regardless of the start date's day-of-month. (Not a last-day-of-month clamp — always day 1.)
- **New houses joining an existing recurring cuota:** **no** — a recurring cuota's applicable-houses list is fixed at creation time. A house added later needs its own new cuota (or the admin edits/recreates).
- **Editing a cuota template:** the edit **updates all unpaid future installments** already generated from it (paid installments are untouched, preserved as historical record).

### 🔲 Phase 5: Payments — NOT STARTED
**Goal:** Admin registers payments against pending cuotas; residents retrieve receipts.
**Depends on:** Phase 4

**Decisions made (2026-09-06):**
- **Partial payment allocation:** oldest-cuota-first. If the payment doesn't cover all selected cuotas, the oldest gets paid first, the next becomes "partially paid" for the remainder.
- **Overpayment:** the excess becomes **saldo a favor (credit)** on the house, **auto-applied to the next cuota** that becomes due (not something the admin has to manually remember to apply).
- **Receipt numbering:** sequential receipt number (e.g. #0001, #0002...), community-wide.

### 🔲 Phase 6: Reporting & Delinquency — NOT STARTED
**Goal:** Admin dashboard, morosos list, monthly reports — live, per-currency computation.
**Depends on:** Phase 5

**Decisions made (2026-09-06):**
- **Grace period before "moroso":** configurable, not hardcoded — a setting (e.g. `grace_period_days`, admin-configurable, could be set to 0/1 for no effective grace) determines when a house with an unpaid past-due cuota gets flagged as delinquent. Default value TBD at implementation (0 or a small number) — the requirement is that it's a setting, not a fixed constant baked into the query.
- **"Total collected this month" KPI basis:** by **payment_date** falling in the selected month — cash-basis, not accrual (a late October payment for a September cuota counts toward October's "collected" total, not September's).

### 🔲 Phase 7: Resident Portal — NOT STARTED
**Goal:** Residents self-serve view their cuotas, saldo, and payment history.
**Depends on:** Phase 3, Phase 6

### 🔲 Phase 8: Internationalization & Polish — NOT STARTED
**Goal:** Full Spanish/English coverage across every screen, production-ready.
**Depends on:** Phase 7

---

## Key Architectural Corrections (from original handoff spec — already applied)

1. **Cuotas need a template/instance split.** No `applicable_houses` array on a single cuota row — split into `condo_installment_templates` (definition) and `condo_installments` (per-house, per-installment payable instance, with `house_id`).
2. **Payments need to support paying multiple cuotas at once.** One `condo_payments` row per paid installment, grouped under an optional shared `payment_batch_id` — not a singular FK.

## Schema Correction Needed in Phase 3 (not yet applied)

Phase 1's migration put `pin_hash` on `condo_house_residents` (per-resident PIN). The actual design is **one PIN per house** (see Phase 3 decisions above). Phase 3 must ship a migration that:
- Adds `pin_hash` (and a lockout-tracking column or two, e.g. `failed_pin_attempts`, `pin_locked_until`) to `condo_houses`.
- Drops `pin_hash` from `condo_house_residents` (residents keep `resident_name`, `resident_phone` only).

## Anti-Patterns to Avoid (from research, still relevant)

- Never store "overdue" as a status value — always compute `due_date < today AND status != 'paid'` at query time.
- Never sum amounts across USD/Bs/USDT — every KPI/report must be per-currency.
- Cuota/installment generation must be transactional and idempotent (the `unique (template_id, house_id, installment_number)` constraint + its NULL-case partial index exist for exactly this).
- Never use raw UTC string splitting for date/due-date/overdue math — use calendar-day-safe functions in a fixed timezone.

---

## Next Step

Build out Phase 2 (Admin Authentication) — signup, verify-email, login, password-reset — using the decisions and UI-SPEC above. No formal planning-doc process required going forward; work directly from this file and update the phase status here as things land.

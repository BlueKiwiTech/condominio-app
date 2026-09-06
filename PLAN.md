# Condominio App — ASOBARCELONA — Project Plan & Status

**Last updated:** 2026-09-06 (Phase 8 in progress — locale switcher + validation/error-message localization + shared admin sidebar nav built; English copy given a full read-through pass; mobile-responsive admin nav, a shared loading-skeleton pattern, and a global toast confirmation on payment save now also built; final assumption-revisit sweep still remaining)

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
- ✅ **AUTH-01**: Admin can sign up with email and password (Supabase Auth)
- ✅ **AUTH-02**: Admin receives email verification after signup *(code complete; live-project email-template config is a required manual step — see Phase 2 "Action needed")*
- ✅ **AUTH-03**: Admin can reset password via email link
- ✅ **AUTH-04**: Admin session persists across browser refresh
- ✅ **AUTH-05**: Resident can log in by house number + the house's PIN, no email *(corrected: PIN is one-per-house, not one-per-resident — see Phase 3 decisions)*
- ✅ **AUTH-06**: House PIN hashed at rest, login rate-limited against brute-force (5 attempts → 15-min lockout, per house)
- ✅ **AUTH-07**: RLS/equivalent ensures admins see everything, residents see only their house *(scoped to tables that exist through Phase 3: condo_communities/condo_houses/condo_house_residents. Later phases' tables — installments/payments — get their own admin policies when those features ship.)*

### Houses (HOUS) — Phase 3
- ✅ **HOUS-01**: Admin can create a house (number, name, owner name/phone/email, **PIN** — PIN lives on the house, not per-resident)
- ✅ **HOUS-02**: Admin can edit a house (including resetting its PIN)
- ✅ **HOUS-03**: Admin can delete a house
- ✅ **HOUS-04**: Admin can view list of all houses
- ✅ **HOUS-05**: Admin can add residents (name, phone — display/contact info only, no individual PIN) to a house

### Cuotas (CUOT) — Phase 4
- ✅ **CUOT-01**: Recurring cuota (name, cadence, amount, currency, start date, # installments, target houses)
- ✅ **CUOT-02**: One cuota instance per installment per applicable house (not a shared record)
- ✅ **CUOT-03**: Special/one-time cuota (name, amount, currency)
- ✅ **CUOT-04**: Special cuota optionally divided into N installments, staggered due dates *(grouped via `template_id` + `installment_number`, not the schema's `parent_installment_id` self-reference — see Phase 4 "Assumption made")*
- ✅ **CUOT-05**: Generation is transactional + idempotent — no duplicate installments on retry/double-click
- ✅ **CUOT-06**: Admin can edit/delete a cuota (or template) before any payment exists against it
- ✅ **CUOT-07**: Admin can list all cuotas with status (pending/paid/overdue)

### Payments (PMNT) — Phase 5
- ✅ **PMNT-01**: Admin selects a house, sees its pending cuotas
- ✅ **PMNT-02**: Register one payment against multiple selected pending cuotas in one action
- ✅ **PMNT-03**: Amount pre-fills from cuota sum, adjustable (partial payment)
- ✅ **PMNT-04**: Payment currency must match the cuota's currency
- ✅ **PMNT-05**: Date defaults to today (changeable), optional notes
- ✅ **PMNT-06**: Registering a payment updates cuota status(es) (pending/partial/paid)
- ✅ **PMNT-07**: Admin can view payment history, filterable by house
- ✅ **PMNT-08**: Resident can view/print a receipt (comprobante) for a payment *(admin-reachable receipt/detail view ships now per the mockup's A7b layout; resident access is wired once Phase 7's portal exists — see Phase 5's build notes below)*

### Reporting & Delinquency (RPRT) — Phase 6
- ✅ **RPRT-01**: Admin dashboard KPIs (collected this month, outstanding, # morosos)
- ✅ **RPRT-02**: Morosos list (house, owner, owed, owed-since, days overdue, currency) — live-computed, never stale
- ✅ **RPRT-03**: Morosos/saldo always grouped per currency — USD/Bs/USDT never summed together
- ✅ **RPRT-04**: Monthly report per house: expected vs. paid vs. balance vs. status
- ✅ **RPRT-05**: Calendar-day-safe date math in a fixed timezone (never raw UTC splitting)

### Resident Portal (RSDT) — Phase 7
- ✅ **RSDT-01**: Resident views own cuotas as calendar/grid, color-coded by status
- ✅ **RSDT-02**: Resident views own saldo — "credit" (positive) or "debt since [date]" (negative)
- ✅ **RSDT-03**: Resident views own payment history

### Internationalization (I18N) — Phase 8
- ✅ **I18N-01**: All admin/resident UI text available in Spanish (default) and English
- ✅ **I18N-02**: Locale switching doesn't lose the user's place in the app

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

### ✅ Phase 2: Admin Authentication — COMPLETE
**Goal:** Admins can securely sign up, verify, log in, and recover access to their accounts.
**Depends on:** Phase 1 ✅

**Built:** All five auth screens (signup, verify-email holding page, login, forgot-password, reset-password) under `app/[locale]/(auth)/`, each a thin Server Component page delegating to a `'use client'` form in `components/auth/*Form.tsx` (react-hook-form + zod, matching the shared `Once UI` `error`/`errorMessage` contract). Server Actions in `lib/actions/auth.ts` (`signup`, `login`, `logout`, `resendVerificationEmail`, `forgotPassword`, `resetPassword`) call `lib/supabase/server.ts`'s cookie-based client — never `getSession()` as an authorization gate; `resetPassword` calls `getUser()` (network-verified) before the sensitive password write. `lib/auth/allowlist.ts` gates signup against the single-email `ADMIN_ALLOWLIST_EMAIL` env var (D-01..D-05); a non-allowlisted attempt gets the honest "invite-only" rejection, never a silent failure. `proxy.ts` now actually gates `(admin)/*` routes (currently just `/dashboard`, a placeholder page with a working "Cerrar sesión" button) — unauthenticated visitors are redirected to `/login` (locale-prefix-aware), still via the fast, local `getClaims()` check, never `getUser()` in middleware. Added `app/auth/confirm/route.ts`, a top-level Route Handler (outside `[locale]`, and excluded from `proxy.ts`'s matcher) implementing Supabase's standard `verifyOtp({ type, token_hash })` email-confirmation pattern — shared by both the signup-confirmation and password-recovery links. `messages/es.json`/`en.json` got their first real content (an `auth` + `dashboard` namespace, both locales, matching the UI-SPEC copy table verbatim).

**No new migration.** `condo_communities` has RLS enabled with zero policies (Phase 1's deny-by-default posture) and no seed row. Rather than add an RLS policy or a seed migration, `signup`'s community-linking step (D-05: link the first successful signup to `condo_communities.admin_id`) uses a new `lib/supabase/service.ts` service-role client (bypasses RLS entirely) to lazily create the single `condo_communities` row (name "ASOBARCELONA") on first signup, or link `admin_id` onto it if it already exists. This was necessary regardless of RLS: `supabase.auth.signUp()` returns a **null session** while "Confirm email" is enabled (confirmed against Supabase's own docs), so there is no `auth.uid()`-backed session yet at the moment of that write for any RLS policy to authorize — deny-by-default RLS on every other table is untouched, preserved for Phase 3+.

**Assumption made (needs confirmation):** the single `condo_communities` row is created lazily by the signup Server Action (name hardcoded to "ASOBARCELONA") rather than via a seed migration, since Phase 1 explicitly avoided seeding it and no later decision revisited that. If a different community name/address/phone is wanted, edit the row after first signup (Phase 8/Configuración screen, or directly in the dashboard) — not re-seeded automatically.

**Action needed (live Supabase project, dashboard-only — cannot be done via migration or from this environment):**
1. Set `ADMIN_ALLOWLIST_EMAIL` (the one real admin's email) in Vercel's env vars and your local `.env` — `.env.example` documents the shape.
2. Confirm **Auth → Providers → Email → "Confirm email"** is enabled (required for AUTH-02's verification-before-access behavior).
3. Under **Auth → Email Templates**, edit **"Confirm signup"** to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/dashboard`, and **"Reset Password"** to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` (both replace Supabase's default confirmation-URL format with the token-hash + Route-Handler format `app/auth/confirm/route.ts` expects).
4. Under **Auth → URL Configuration**, add the deployed origin (and `http://localhost:3000` for local dev) to the Redirect URLs allowlist, and set Site URL to the production origin.

**Known minor gap, deferred:** the login screen's mockup (A1) includes a "¿Eres vecino? Entra con tu casa y PIN" link to resident login — omitted here since that route doesn't exist until Phase 3; add it when Phase 3 ships the resident login page. AUTH-07 (RLS ensures admins see everything, residents only their house) is intentionally left 🔲 — no admin-facing data tables exist to scope yet; Phase 3+ closes it as each feature area ships its own RLS policies.

**Reference docs still available if useful:** `.planning/phases/02-admin-authentication/02-CONTEXT.md`, `02-UI-SPEC.md`, `02-PATTERNS.md` (codebase analog mapping this build followed).

### ✅ Phase 3: Houses & Resident Access — COMPLETE
**Goal:** Admin manages houses/residents; residents log in independently via house + PIN.
**Depends on:** Phase 2 ✅

**Action needed:** push `supabase/migrations/20260906120000_phase3_house_pin_and_rls.sql` to the live project (Dashboard SQL Editor or your own CLI session — cannot be done from this environment). It moves `pin_hash` off `condo_house_residents` onto `condo_houses` (+ `failed_pin_attempts`/`pin_locked_until` lockout columns), adds the first admin RLS policies (`condo_communities`, `condo_houses`, `condo_house_residents`), and creates two Postgres functions: `condo_hash_pin` (called by admin house create/edit) and `condo_verify_house_pin` (called by resident login — owns the PIN comparison + brute-force lockout counter atomically via pgcrypto's `crypt()`).

**Also needed:** set `RESIDENT_SESSION_SECRET` (a long random string, e.g. `openssl rand -base64 32`) in Vercel's env vars and your local `.env` — signs the resident's jose session cookie. `.env.example` documents the shape.

**Built:** Admin house/resident CRUD — `app/[locale]/(admin)/houses/page.tsx` (A3 list, Once UI `Table` with search) + `components/houses/HouseFormDialog.tsx` (A3b create/edit modal: house fields + PIN field, embedding `ResidentsManager.tsx` for add/delete residents inline) + `lib/actions/houses.ts` (createHouse/updateHouse/deleteHouse/addResident/deleteResident, all `getUser()`-gated). Resident login (V1) — `app/[locale]/(auth)/resident-login/page.tsx` (house selector fetched via the service-role client, since anon RLS denies it) + `components/residentAuth/ResidentLoginForm.tsx` + `lib/actions/residentAuth.ts`'s `residentLogin`, which calls the new `condo_verify_house_pin` RPC and, on success, mints a signed httpOnly cookie via `lib/auth/residentToken.ts` (pure jose sign/verify, edge-safe) + `lib/auth/residentSession.ts` (Node wrapper using `next/headers`' `cookies()`). A minimal `(resident)/mi-hogar` placeholder page (mirrors Phase 2's dashboard-placeholder pattern) gives the flow somewhere real to land pending Phase 7's actual portal content. `proxy.ts` now also gates `/houses` (admin) and `/mi-hogar` (resident, verified via `verifyResidentToken` — no network round-trip, same rationale as `getClaims()` for the admin path). The admin login screen's "¿Eres vecino? Entra con tu casa y PIN" link (flagged as a known gap in Phase 2) is now wired to `/resident-login`.

**Implementation note (not a scope change):** PLAN.md's Pattern A description says "a Route Handler verifies {house_id, pin}..." — implemented as a Server Action instead (`residentLogin` in `lib/actions/houses.ts`'s sibling `lib/actions/residentAuth.ts`), since Next.js Server Actions can set cookies directly and CLAUDE.md's own convention prefers Server Actions over an `app/api/*` route tree for same-origin flows. Functionally identical: service-role client verification, PIN hash comparison, signed cookie minted server-side.

**Decisions made (2026-09-06):**
- **PIN is one-per-HOUSE, not one-per-resident.** Login = `house_number` + the house's single shared PIN. **Schema correction needed from Phase 1:** move `pin_hash` off `condo_house_residents` and onto `condo_houses` (residents keep name/phone as display/contact info only, no individual PIN). Update HOUS-05 accordingly: "Admin can add one or more residents (name, phone) to a house; the house itself has one PIN."
- **Resident session mechanism: Pattern A confirmed** — custom signed httpOnly cookie (via `jose`), no Supabase Auth session for residents at all. A Route Handler verifies `{house_id, pin}` server-side via the service-role client (PIN hash comparison via `pgcrypto`), then mints the cookie carrying `{house_id}`. All resident reads go through a service-role client manually filtered by `house_id`. RLS stays enabled as a backstop, not the primary enforcement path.
- **PIN lockout:** 5 failed attempts → 15-minute lockout, scoped per house.
- **PIN assignment:** admin sets the PIN when creating/editing a house (no resident self-service PIN change in v1).
- **Resident session duration:** long-lived (~30 days), "remember this device" style — minimize re-entry friction.

### ✅ Phase 4: Cuota Engine — COMPLETE
**Goal:** Admin defines recurring and special cuotas generating correct per-house installments.
**Depends on:** Phase 3 ✅

**Action needed:** push `supabase/migrations/20260906130000_phase4_cuota_rls.sql` to the live project (Dashboard SQL Editor or your own CLI session — cannot be done from this environment). It adds the first admin RLS policies for `condo_installment_templates` and `condo_installments` (both tables had RLS enabled with zero policies since Phase 1's deny-by-default migration — same single-community/single-admin scoping pattern as Phase 3's `condo_houses` policy). Without this, the admin's cookie-based Supabase client cannot read/write either table at all.

**Decisions made (2026-09-06):**
- **Month-end dates:** recurring cuotas always land on the **1st of each month**, regardless of the start date's day-of-month. (Not a last-day-of-month clamp — always day 1.)
- **New houses joining an existing recurring cuota:** **no** — a recurring cuota's applicable-houses list is fixed at creation time. A house added later needs its own new cuota (or the admin edits/recreates).
- **Editing a cuota template:** the edit **updates all unpaid future installments** already generated from it (paid installments are untouched, preserved as historical record).

**Built:** Full create → list → edit → delete flow for both cuota types (CUOT-01..07), reusing Phase 3's Server-Action/Server-Component patterns throughout — no `app/api/*` routes.
- **`lib/cuotas/generate.ts`** — pure, calendar-day-safe (date-fns) due-date and amount-split math shared verbatim between the create Server Action (persists the real rows) and the create-cuota Client Component (renders an identical live preview before submit, matching the A4 mockup's right-panel preview). `computeDueDates` implements three modes: `recurring` (weekly = straight +7-day steps; monthly/annual = day forced to 1, per the locked decision); `special-single` (exactly the admin-picked date, no math); `special-divided` (staggered one calendar month apart, preserving the admin's chosen day-of-month — this is NOT a "recurring" cuota, so the day-1 forcing rule doesn't apply). `splitAmount` does an equal cents-based split with the rounding remainder absorbed by the **last** installment, so the parts always sum exactly to the total.
- **`lib/cuotas/status.ts`** — `isOverdue`/`summarizeTemplate`: "overdue" computed at render time (`due_date < today AND status != 'paid'`), never stored, per the anti-pattern rule. Used by the list page to show live pending/overdue/paid counts per template.
- **`lib/validation/cuotas.ts`** — `createTemplateSchema` (a zod discriminated union on `installment_type`: `recurring` requires `cadence` + `number_of_installments`; `special` has an optional `is_divided` + `number_of_installments`) and a deliberately narrow `updateTemplateSchema` (name/description/currency/amount only — see below).
- **`lib/actions/cuotas.ts`** — `createInstallmentTemplate`, `updateInstallmentTemplate`, `deleteInstallmentTemplate`, all `getUser()`-gated (never `getSession()`). Creation resolves "Todas" (empty `applicable_houses` selection) into a **snapshot of the current house-id list at creation time**, stored on the template row — consistent with the locked "fixed at creation" decision. Installment generation is one multi-row `insert`/`upsert` call — a single INSERT statement is already atomic (CUOT-05's "transactional"), and `.upsert(rows, { onConflict: 'template_id,house_id,installment_number', ignoreDuplicates: true })` makes it idempotent against a retried/double-submitted call, backed by the existing unique constraint. This is NOT a single DB transaction spanning the template-row insert too (Server Actions call PostgREST over HTTP, not a shared connection) — if the installments insert fails, the template row is explicitly rolled back instead, covering the realistic failure mode without a Postgres function. `updateInstallmentTemplate` cascades name/currency (and amount, for non-divided templates only) onto every installment with `status != 'paid'`, leaving paid ones untouched, per the locked decision. `deleteInstallmentTemplate` checks for zero payments across all of the template's installments before deleting (CUOT-06's literal "before any payment exists" wording — the locked decision only loosens *editing*, not deleting).
- **`app/[locale]/(admin)/cuotas/page.tsx`** + **`components/cuotas/CuotasPageClient.tsx`** — list table (CUOT-07): name, type, per-currency total, house count, live pending/overdue/paid `Tag` badges, edit/delete actions. Edit opens **`components/cuotas/CuotaEditDialog.tsx`** (a Dialog, same pattern as `HouseFormDialog`).
- **`app/[locale]/(admin)/cuotas/new/page.tsx`** + **`components/cuotas/CuotaFormClient.tsx`** — the full A4/A4b creation screen: `SegmentedControl` for Recurrente/Especial, conditional fields (cadence + count for recurring; a "Dividir en cuotas" `Switch` + count for special), a `Chip`-based "Todas / seleccionar casas" house-targeting UI, and a live right-panel preview (per-due-date breakdown, total per house, houses count, expected total, and a "no currency conversion" info banner) built from the same `buildPreview()` helper the Server Action's math derives from. Validates via `createTemplateSchema.safeParse` client-side before calling the Server Action (not wired through `zodResolver` — the discriminated-union + per-branch-conditional-fields shape doesn't fit RHF's resolver contract cleanly, so this form manages its own submit-time validation instead, same zod schema either way).
- `proxy.ts`'s `PROTECTED_PATHS` now also gates `/cuotas`; dashboard placeholder gained a "Cuotas" nav link; `messages/es.json`/`en.json` got a full `cuotas` namespace (both locales).

**Assumptions made (needs confirmation):**
- **`parent_installment_id` left unused.** The original Phase 1 schema comment suggested special-divided installments might link via `condo_installments.parent_installment_id` (a self-reference) rather than `template_id`. This build instead creates a `condo_installment_templates` row for **every** cuota type (recurring and special alike) and groups/orders divided installments via `template_id` + `installment_number` — simpler, one consistent code path, and it directly satisfies CUOT-06's own wording ("edit/delete a cuota **(or template)**", treating the two as interchangeable for every type). `parent_installment_id` and the schema-hardening migration's `template_id IS NULL` partial unique index remain in the schema, unused by this implementation, as a no-cost safety net. Revisit only if a literal parent/child row structure turns out to matter later (e.g. for a future receipt/report that needs to walk "children of X").
- **"Distribución Manual" not implemented.** The A4 mockup shows an Automática/Manual toggle for splitting a divided special cuota's amount across installments; only automatic (equal split, remainder cent on the last installment) is built. Manual per-installment amount entry isn't in any locked decision — add it later if actually needed.
- **A4's three-way "Tipo de cuota" radio (Recurrente/Única/Especial) collapsed to two.** The DB only distinguishes `recurring`/`special` (`condo_installment_templates.installment_type` check constraint). The form offers Recurrente/Especial; "Única" is simply Especial with "Dividir en cuotas" left unchecked. Copy-level consolidation, not a functional gap.
- **Recurring "annual" cadence also forced to day 1** of the resulting month, on the same reasoning as monthly (the locked decision says "recurring cuotas always land on the 1st of each month" without carving out annual); only weekly cadence is exempt (no month concept to normalize). Flagging in case "annual" was actually meant to preserve the original day-of-month.

### ✅ Phase 5: Payments — COMPLETE
**Goal:** Admin registers payments against pending cuotas; residents retrieve receipts.
**Depends on:** Phase 4 ✅

**Action needed:** push `supabase/migrations/20260906140000_phase5_payments.sql` to the live project (Dashboard SQL Editor or your own CLI session — cannot be done from this environment). It adds `condo_installments.amount_paid` (running paid total) and extends the `status` check constraint to include `'partial'` (alongside the existing `pending`/`paid`/`advance`); adds `reference` + `receipt_number` columns to `condo_payments` plus a sequence-backed `condo_next_receipt_number()` function for the sequential community-wide numbering decision; creates `condo_house_credits` (per house, per currency — never summed across currencies) for the saldo-a-favor decision; and adds the first admin RLS policies for `condo_payments` and `condo_house_credits` (both had RLS enabled with zero policies since Phase 1's deny-by-default migration). Without this, none of Phase 5's writes/reads will work against the live project.

**Decisions made (2026-09-06):**
- **Partial payment allocation:** oldest-cuota-first. If the payment doesn't cover all selected cuotas, the oldest gets paid first, the next becomes "partially paid" for the remainder.
- **Overpayment:** the excess becomes **saldo a favor (credit)** on the house, **auto-applied to the next cuota** that becomes due (not something the admin has to manually remember to apply).
- **Receipt numbering:** sequential receipt number (e.g. #0001, #0002...), community-wide.

**Built:** Full register → allocate → list → receipt flow (PMNT-01..08), reusing the Server-Action/Server-Component/Once-UI patterns established in Phases 3-4.
- **`lib/payments/allocate.ts`** — pure, calendar-day-safe (date-fns) allocation math shared between the Server Action and the client form's live "Resumen del pago" preview. `sortOldestFirst` orders by `due_date` then `installment_number` as a tiebreaker; `allocateFunds` walks a list of installments in whatever order it's given (callers decide what "oldest first" is scoped to — see below) and works in integer cents internally (same rounding-safety approach as Phase 4's `splitAmount`) so allocations never drift by a fraction of a cent. Returns per-installment allocations (amount applied, new cumulative `amount_paid`, new `partial`/`paid` status) plus `leftoverCents` for whatever wasn't needed.
- **`lib/payments/creditSweep.ts`** — shared saldo-a-favor (credit) helpers (`getHouseCredit`, `setHouseCredit`, `sweepCreditForNewInstallments`), used by both `lib/actions/payments.ts` and `lib/actions/cuotas.ts`. The locked "auto-applied to the next cuota that becomes due" decision is implemented at two touchpoints: (1) `registerPayment` nets any pre-existing credit together with the new cash **before** allocating across the admin-selected cuotas, so old credit gets consumed the next time the admin actually processes a payment for that house; (2) `sweepCreditForNewInstallments`, called from `createInstallmentTemplate` right after a cuota template generates brand-new installment rows, auto-settles existing credit against those newly-due installments with zero admin action needed — the literal "becomes due" case. Deliberately **not** implemented: sweeping a house's *other*, already-existing pending/overdue installments that the admin didn't select in a given payment action — auto-clearing old debt via credit meant for something else would silently hide real morosos, which contradicts PLAN.md's core value. Documented inline as the reasoning, not treated as a gap.
- **`lib/validation/payments.ts`** — `registerPaymentSchema` (house/currency/installment-ids/amount/date, optional reference+notes).
- **`lib/actions/payments.ts`** — `registerPayment`, `getUser()`-gated (never `getSession()`). Re-fetches the selected installments fresh from the DB (never trusts client-supplied amounts/status), validates house/currency consistency, nets in existing credit, allocates oldest-selected-first, reserves a sequential receipt number via the `condo_next_receipt_number()` RPC, and writes one `condo_payments` row per installment that received money (all sharing one `payment_batch_id` + receipt number). Not a single DB transaction (Server Actions call PostgREST over HTTP, same constraint already documented in Phase 4's code) — writes happen in an order that keeps `condo_payments` (the ledger) as the first, most-likely-to-succeed write, so a later failure leaves the ledger intact even if derived installment/credit state needs manual reconciliation.
- **`lib/actions/cuotas.ts`** — `createInstallmentTemplate` extended: after generating a template's installment rows, groups the newly-inserted rows per house and calls `sweepCreditForNewInstallments` for each, best-effort (a sweep failure doesn't roll back the cuota that was just created — the installments are already valid pending rows either way).
- **`app/[locale]/(admin)/pagos/page.tsx`** + **`components/payments/PaymentsPageClient.tsx`** — payment history (PMNT-07): a house-filter `Select` (+ "Todas") and a table grouping raw `condo_payments` rows into one row per `payment_batch_id` (`groupPaymentsByBatch` in `components/payments/types.ts`), showing date, receipt #, casa, cuota count, total (safe to sum — one currency per batch, enforced at write time), reference, and a link to the detail view.
- **`app/[locale]/(admin)/pagos/nuevo/page.tsx`** + **`components/payments/PaymentFormClient.tsx`** — the A5 screen: casa `Select`, a currency `Chip` switcher when a house has pending cuotas in more than one currency, a pending-cuotas checklist `Table` (all checked by default — the common case is "pay everything currently due"; the admin unchecks to leave some out), amount-received input that pre-fills from the selected sum but stops auto-updating once the admin types their own value (PMNT-03), a read-only currency display (locked to the selected cuotas' currency — enforces PMNT-04 in the UI, backed by the `condo_payments_currency_guard` DB trigger from Phase 1's hardening migration as the real enforcement), date/reference/notes fields, and a live right-panel "Resumen del pago" built from the same `allocateFunds` the Server Action uses (per-cuota allocation + resulting status, existing credit shown/used, resulting saldo-a-favor or an "up to date" success banner). All house-change/currency-change/checkbox-toggle state transitions are handled imperatively in event handlers, not via `useEffect` + `setState` (avoids the cascading-render anti-pattern the stricter `react-hooks/set-state-in-effect` lint rule flags — confirmed clean via a full `npx eslint .` pass).
- **`app/[locale]/(admin)/pagos/[batchId]/page.tsx`** — the A7b receipt/detail view (PMNT-08): recibo #, fecha, casa, cuotas cubiertas (line items), moneda, referencia, "registrado por" (the current admin's email — safe to assume it's the same as `created_by` given the single-admin invariant already established elsewhere in this codebase), and notes. Admin-only for now via `proxy.ts`'s existing gate (residents can't reach it until Phase 7's portal + resident-scoped data access exist — a plain, printable page now, Phase 7 links to it later, exactly as flagged in the "Next Step" note this phase started from).
- `lib/cuotas/status.ts`'s `InstallmentStatus` extended with `'partial'`; `summarizeTemplate` gained a `partialCount` bucket, surfaced as a new warning-colored tag on the `/cuotas` list page.
- `proxy.ts`'s `PROTECTED_PATHS` now also gates `/pagos`; dashboard placeholder gained a "Pagos" nav link; `messages/es.json`/`en.json` got a full `payments` namespace (both locales) plus the new `cuotas.status.partial` key.

**Assumption made (needs confirmation):** "Registrado por" on the receipt/detail view shows the *currently signed-in* admin's email rather than looking up `condo_payments.created_by` against `auth.users` (which would need a service-role query or a database view — out of scope for a single-admin app where the viewer is always the one admin anyway). Revisit only if a second admin/treasurer account is ever introduced.

### ✅ Phase 6: Reporting & Delinquency — COMPLETE
**Goal:** Admin dashboard, morosos list, monthly reports — live, per-currency computation.
**Depends on:** Phase 5 ✅

**Action needed:** push `supabase/migrations/20260906150000_phase6_reporting.sql` to the live project (Dashboard SQL Editor or your own CLI session — cannot be done from this environment). It adds `condo_communities.grace_period_days` (int, default 0) — no new RLS policy needed, the existing `condo_communities_admin_all` policy (Phase 3) already covers every column on that table.

**Decisions made (2026-09-06):**
- **Grace period before "moroso":** configurable, not hardcoded — a setting (e.g. `grace_period_days`, admin-configurable, could be set to 0/1 for no effective grace) determines when a house with an unpaid past-due cuota gets flagged as delinquent. Default value TBD at implementation (0 or a small number) — the requirement is that it's a setting, not a fixed constant baked into the query.
- **"Total collected this month" KPI basis:** by **payment_date** falling in the selected month — cash-basis, not accrual (a late October payment for a September cuota counts toward October's "collected" total, not September's).

**Built:** Full live-computed reporting layer (RPRT-01..05), reusing the Server-Component-fetch/pure-lib/Client-Component-render split established in Phases 4-5 — no `app/api/*` routes, no stored/cached "morosos" or "overdue" flags anywhere.
- **`lib/reporting/dateMath.ts`** — `monthRange`/`daysToCloseOfMonth`/`monthKey`, calendar-day-safe (date-fns) month helpers shared by the dashboard and monthly report (RPRT-05).
- **`lib/reporting/morosos.ts`** — `computeMorosos`: groups every non-paid installment **per house PER CURRENCY** (RPRT-03 — one house can produce separate rows if it owes in more than one currency), skipping any installment not yet overdue by more than `grace_period_days`; returns owed amount, owed-since (earliest qualifying due date), and days-overdue, sorted worst-first. `countDelinquentHouses` dedupes to a house count for the dashboard's KPI card.
- **`lib/reporting/dashboard.ts`** — `collectedInMonth` (cash-basis, filters `condo_payments` by `payment_date` within the selected month's calendar range — the locked KPI-basis decision), `percentChange` (returns `null` — rendered as "no prior-month data" — rather than a nonsensical `Infinity`/divide-by-zero when the prior month collected nothing), `outstandingByCurrency` (every non-paid installment's remaining balance, not grace-period-gated — distinct from the morosos-only figure), `creditsByCurrency`, and `monthlyIncomeSeries` (6-month per-currency data points for the dashboard chart).
- **`lib/reporting/monthlyReport.ts`** — `buildMonthlyReport`: filters installments to the selected month's due dates, groups per house per currency into expected/paid/pending/favor with a derived status (paid/overdue/partial/pending, live-computed via `lib/cuotas/status.ts`'s `isOverdue`), and `reportTotalsByCurrency` for the mockup's "separate footer total row per currency" (rendered as per-currency summary cards above the table, since Once UI's `Table` component has no native footer-row API).
- **`app/[locale]/(admin)/dashboard/page.tsx`** (rewritten, replacing the Phase 2/3 placeholder) + **`components/dashboard/DashboardPageClient.tsx`** — the A2 screen: greeting + "days to close of month" subtitle, "Registrar pago"/"Nueva cuota" action buttons, 4 KPI `Card`s (cobrado en {mes} with a per-currency %-change line, morosos count + `ProgressBar`, saldo pendiente, saldo a favor — all per-currency, never a combined number), a 6-month per-currency income chart (one `LineChart` per currency, Once UI's bundled `recharts` — no separate chart lib added, per CLAUDE.md), a "casas con deuda" table sourced from `computeMorosos`, and a scrollable "últimos pagos" list reusing Phase 5's `groupPaymentsByBatch` helper, each row linking to its existing `/pagos/[batchId]` receipt page.
- **`app/[locale]/(admin)/reporte/page.tsx`** + **`components/reports/MonthlyReportClient.tsx`** — the A6 screen: a month `Select` (last 12 months, localized month names via `date-fns/locale`), currency filter `Chip`s (Todas/USD/Bs/USDT — view-only filter, never a cross-currency sum) and status filter `Chip`s, a per-house/per-currency table (expected/paid/pending/favor/status), and per-currency totals cards above the table.
- `proxy.ts`'s `PROTECTED_PATHS` now also gates `/reporte`; `messages/es.json`/`en.json` got the dashboard namespace rewritten (was a Phase 2 placeholder) plus a new `reports` namespace (both locales).

**Assumption made (needs confirmation):** `grace_period_days` defaults to **0** (a house is "moroso" the instant any installment is one calendar day past due and unpaid, with no forgiveness window) since no specific default was locked — change the value directly on the `condo_communities` row (no admin settings UI for it yet; that's a natural Phase 8/Configuración addition) if a grace window is actually wanted.

### ✅ Phase 7: Resident Portal — COMPLETE
**Goal:** Residents self-serve view their cuotas, saldo, and payment history.
**Depends on:** Phase 3 ✅, Phase 6 ✅

**No new migration** — every table this phase reads (`condo_houses`, `condo_house_residents`, `condo_installments`, `condo_installment_templates`, `condo_payments`, `condo_house_credits`, `condo_communities`) already existed from Phases 1-6. All resident reads go through the service-role client (`lib/supabase/service.ts`), manually filtered by `house_id` — never RLS/the anon client — per Phase 3's locked Pattern A, so no new resident-facing RLS policy was needed either.

**Built:** V2/V3/V4 (RSDT-01..03), reusing Phase 6's per-currency reporting math re-scoped from "every house" to the signed-in resident's one house, plus the Server-Action/Server-Component/Client-Component split established in every prior phase.
- **`lib/resident/queries.ts`** — `getResidentPortalData(houseId)`, the single service-role fetch (house, residents, installments joined with their template's `installment_type`, payments, credits, community) shared by all three resident pages — a small enough per-house dataset that one shared, slightly-overfetching helper beat three narrower ones.
- **`lib/resident/portal.ts`** — pure helpers: `displayStatus` (derives the mockup's four color-coded states — pagada/adelantada/pendiente/vencida — plus a `partial` bucket the V3 mockup predates but the rest of this codebase already surfaces separately since Phase 5), `upcomingInstallments` ("Lo que viene" — next non-paid, non-overdue, soonest-first), `groupByDueMonth` (V3's month-grid grouping key).
- **`app/[locale]/(resident)/layout.tsx`** — new shared shell for all three resident pages: a top bar with "Cerrar sesión" (moved out of the old mi-hogar placeholder) and **`components/resident/ResidentTabBar.tsx`**, the mockup's bottom tab bar (Mi hogar / Mis cuotas / Mis pagos, active-route highlighted).
- **`app/[locale]/(resident)/mi-hogar/page.tsx`** + **`components/resident/MiHogarClient.tsx`** (V2, replacing the Phase 3 placeholder) — greeting, per-currency saldo cards (credit via `creditsByCurrency`, debt-since-date via `computeMorosos` scoped to `[house]` — RSDT-02), house info card (contact fields + residents list), "Lo que viene" upcoming list, a "Reportar un pago que hice" button that's a `tel:` link to the community's phone (per PLAN.md's standing note: no in-app payment-reporting workflow, NOTF-* is deferred).
- **`app/[locale]/(resident)/mis-cuotas/page.tsx`** + **`components/resident/MisCuotasClient.tsx`** (V3 + V3b) — Pendientes/Histórico `SegmentedControl`; a red "Deuda acumulada" card (V3b) rendered only when `computeMorosos` returns rows, with per-currency owed/owed-since, the overdue line items, and a `tel:` "Escribir a la junta" CTA; a month-grouped `Grid` of pending recurring-cuota cards; a separate "Cuotas especiales" list for pending special-cuota installments (split via the joined template's `installment_type`); Histórico tab lists paid installments newest-first.
- **`app/[locale]/(resident)/mis-pagos/page.tsx`** + **`components/resident/MisPagosClient.tsx`** (V4) — year `Chip` filter (derived from the resident's own payment dates, plus "Todos") + per-currency period totals, reusing Phase 5's `groupPaymentsByBatch` helper (`components/payments/types.ts`) directly rather than re-deriving batch/receipt grouping logic.
- `proxy.ts`'s `RESIDENT_PROTECTED_PATHS` now also gates `/mis-cuotas` and `/mis-pagos`; `messages/es.json`/`en.json` got a new `residentNav` namespace plus full `residentHome` (replacing the Phase 3 placeholder copy), `residentCuotas`, and `residentPayments` namespaces (both locales, verified key-parity between them).

**V6 (Mi perfil) intentionally NOT built**, per the Design Reference's standing note — no resident-initiated PIN-change UI exists anywhere. V5 (Contactar a la junta) also not built as its own screen — its only in-scope piece (a way to reach the board) is satisfied by the `tel:` links already on V2/V3b.

### 🔲 Phase 8: Internationalization & Polish — IN PROGRESS
**Goal:** Full Spanish/English coverage across every screen, production-ready.
**Depends on:** Phase 7 ✅

**No new migration.**

**Progress (2026-09-06):** Closed the two biggest I18N-01/I18N-02 gaps found during the audit pass — every screen's *static* UI copy already went through `messages/es.json`/`en.json` in Phases 1-7 (verified: both files still have full key parity, 296 keys each, checked programmatically), but two categories of user-facing text were hardcoded Spanish outside that system:
- **Locale switching (I18N-02) didn't exist at all.** Added `i18n/navigation.ts` (next-intl's documented `createNavigation(routing)` wrapper — locale-aware `Link`/`useRouter`/`usePathname`) and `components/LocaleSwitcher.tsx` (a two-button ES/EN toggle using `router.replace({pathname, query}, {locale})`, next-intl's documented "change locale for the current page" pattern — preserves both the route and any query string, satisfying I18N-02's "doesn't lose the user's place"). Mounted in the three top-level shells: `(auth)/layout.tsx` (visible pre-login, covers login/signup/forgot-password/reset-password/verify-email/resident-login), `(resident)/layout.tsx`'s top bar, and the admin dashboard's nav row (`components/dashboard/DashboardPageClient.tsx`) — the other admin screens (houses/cuotas/pagos/reporte) don't have their own nav bar to begin with (only the dashboard does; navigating back to it is the existing pattern), so this isn't a new gap introduced here.
- **Zod validation messages and Server Action error/success strings were hardcoded Spanish** in every `lib/validation/*.ts` and `lib/actions/*.ts` file — meaning an English-locale user would still see Spanish "El monto debe ser mayor a 0." field errors and Spanish "Tu sesión expiró..." Server Action errors, defeating I18N-01 for the entire form-validation and error-path surface (the happy-path static copy was fine; only these dynamic/validation messages were the gap). Fixed by converting every schema in `lib/validation/{auth,houses,cuotas,payments,residentAuth}.ts` into a **factory function** taking a translator (`(key: string) => string`, from a new `validation.<feature>` messages namespace) instead of a bare `z.object(...)` with baked-in strings — e.g. `loginSchema(t)` instead of `loginSchema`, with `type LoginInput = z.infer<ReturnType<typeof loginSchema>>` for the type export. Every Server Action in `lib/actions/{auth,houses,cuotas,payments,residentAuth}.ts` now takes an explicit `locale: string` parameter (next-intl's documented requirement for Server Actions — `getTranslations`/`getRequestConfig`'s automatic locale detection does not extend to Server Actions/Route Handlers, confirmed via context7 docs lookup — the locale must be passed explicitly from the client) and calls `getTranslations({ locale, namespace })` (new `common` namespace for generic cross-feature strings like "session expired"/"invalid data"/"community not found", plus new `errors.*` keys added to each feature's existing namespace, plus the new `validation.*` namespace for schema messages) instead of hardcoding Spanish. Every calling Client Component now grabs `useLocale()` (next-intl) and passes it through to both the schema factory (via a `useTranslations('validation.<feature>')` translator) and the Server Action call. Verified end-to-end: `npm run build` passes (strict TS catches any missed call-site argument), `npx eslint .` shows no new warnings, both `/login` and `/en/login` render correctly via a local dev-server smoke check with no `MISSING_MESSAGE` errors, and the `data-locale-switcher` marker renders on both auth and resident-login pages.
- **Known minor gap, not fixed (low priority):** `lib/actions/cuotas.ts`'s auto-credit-sweep still writes a hardcoded Spanish payment note (`'Aplicado automáticamente desde saldo a favor.'`) into `condo_payments.notes` at cuota-creation time. This is stored data (not live-rendered UI copy), fixed at write time regardless of the viewer's later locale — same category of issue a real i18n system would solve via storing a translation key instead of literal text, but out of scope for this pass given it's an internal system-generated note, not admin/resident-authored content. Revisit only if bilingual audit trails become a real requirement.

**Progress (2026-09-06, second session):**
- **Shared admin sidebar nav built** (`components/admin/AdminSidebar.tsx` + `app/[locale]/(admin)/layout.tsx`), closing the "should admin screens get a shared nav/header" polish question flagged in the prior session — every admin screen (`/dashboard`, `/houses`, `/cuotas`, `/pagos`, `/pagos/nuevo`, `/pagos/[batchId]`, `/reporte`) now renders inside one shared layout with a persistent left sidebar, matching `design/reference/AdminNav.dc.html`'s grouped-nav layout (General / Cobranza / Reportes) but built with Once UI's own icon set + design tokens instead of the mockup's inline SVGs (Once UI's bundled icon set is narrower than the mockup's custom icons — picked the closest semantic match per item: `linearGauge` for Panel, `person` for Casas, `calendar` for Cuotas, `plus` for Registrar pago, `clipboard` for Reporte, `document` for Historial de pagos). The sidebar mounts `LocaleSwitcher` and the `logout` Server Action once, and highlights the active route via `usePathname()`. The admin layout also re-verifies the session via `getClaims()` (defense in depth — proxy.ts already gates every one of these paths — same rationale `(resident)/layout.tsx` already established for the resident side) and passes the signed-in admin's email down for the sidebar's account footer. `components/dashboard/DashboardPageClient.tsx`'s old ad hoc nav row (cross-links + `LocaleSwitcher` + logout form, previously the *only* nav surface in the whole admin app) was removed since the sidebar now covers all of it; the KPI/chart/table content is unchanged. `messages/es.json`/`en.json` gained a new `adminNav` namespace (both locales, verified key-parity: 310 keys each). **Known accepted gap:** the sidebar is a fixed 232px-wide desktop layout with no small-screen collapse/hamburger variant — consistent with the rest of the admin surface being built desktop-first per the mockup (1280px), not a regression this chunk introduced. Full mobile nav for admin screens remains an open item below.
- **English copy given a full read-through pass** (`messages/en.json`, all 310 keys read against their Spanish source side by side): overall already solid — Phase 1-7 authored it carefully alongside the Spanish original rather than needing a rewrite. Two small tone fixes made: `dashboard.kpis.morosos.title` ("Delinquent" → "Delinquent accounts" — a bare adjective read oddly as a standalone KPI card title) and `dashboard.debtTable.empty` ("No house is delinquent." → "No houses are delinquent." — plural agreement more natural for an empty-state message). Deliberately left untouched: "cuota" stays untranslated in English copy throughout (e.g. "New cuota", "My cuotas") while "installment" is used specifically for the division/generation mechanics (e.g. "Split into installments", "Number of installments") — checked this is applied consistently across every namespace, not a bug; it's the established bilingual convention from Phases 2-7, not something this pass should unwind.

**Progress (2026-09-06, third session):**
- **Mobile-responsive admin nav.** `components/admin/AdminSidebar.tsx` now renders two variants from one shared `navGroups()`/`accountFooter` render (so desktop and mobile can never drift out of sync): the existing fixed 232px desktop `Column` is hidden at/below Once UI's `s` breakpoint (768px, via `s={{ hide: true }}`), replaced by a slim sticky top bar (hidden by default, shown only via `s={{ hide: false }}`) with a hamburger `IconButton` that opens the same nav content inside a `Dialog`. Tapping a nav link inside the mobile dialog closes it (`onNavigate` callback threaded through `SmartLink`'s `onClick`). `app/[locale]/(admin)/layout.tsx`'s wrapping `Row` gained `s={{ direction: 'column' }}` so the mobile top bar stacks above page content instead of sitting beside it. Once UI's bundled default icon set has no hamburger/menu glyph, so `resources/icons.ts` (the project's already-established custom-icon-merge pattern, previously just `home`) gained a `menu: HiOutlineBars3` entry (`react-icons/hi2`, already a transitive dependency via Once UI — no new package). New `adminNav.openMenu`/`adminNav.menuTitle` keys added to both `messages/es.json`/`en.json`. This closes the "admin screens are desktop-only" gap flagged at the end of the prior session — houses/cuotas/pagos/reporte/dashboard now all get a usable mobile nav automatically since they all render inside the one shared `(admin)/layout.tsx`.
- **Shared loading-skeleton pattern.** `components/shared/PageSkeleton.tsx` exports three small `Skeleton`-based layouts (`ListPageSkeleton`, `DashboardSkeleton`, `ResidentPageSkeleton`) matching each screen family's general shape (heading + filter row + table-row blocks; heading + KPI-card row + chart + list; greeting + stacked cards). Dropped into a `loading.tsx` file for every data-fetching admin route (`dashboard`, `houses`, `cuotas`, `pagos`, `reporte`) and resident route (`mi-hogar`, `mis-cuotas`, `mis-pagos`) — Next's App Router treats a route segment's `page.tsx` + sibling `loading.tsx` as an automatic Suspense boundary, so no manual `<Suspense>` wiring was needed; these show automatically while each page's async Server Component awaits its Supabase query. (`pagos/nuevo` and `pagos/[batchId]` inherit `pagos/loading.tsx` per Next's nested-segment behavior rather than getting their own — acceptable, a generic list-shaped skeleton flashing briefly before a form/detail page renders is still strictly better than a blank screen.)
- **Toast confirmation wired up.** Once UI's `ToastProvider` was already mounted (`components/Providers.tsx`, since Phase 1 scaffolding) but nothing ever rendered the queue or called `addToast` — the "toasts" pattern flagged as under-used in the prior session's notes. Added `components/GlobalToaster.tsx` (a small client component calling `useToast()` and rendering `<Toaster toasts={toasts} removeToast={removeToast} />`), mounted once inside `Providers.tsx` alongside every other provider. Wired the one place the mockups actually call for a toast (A5's "toast confirmation on save"): `components/payments/PaymentFormClient.tsx`'s `onSubmit` now calls `addToast({ variant: 'success', message: t('toastSuccess') })` right before redirecting to the new payment's receipt page — the toast queue lives in a provider above the page tree, so it survives the client-side navigation and is visible on the receipt page. New `payments.new.toastSuccess` key in both message files.
- Verified via `npm run build` (passes) and `npx eslint .` (zero new warnings/errors — the two pre-existing warnings, `CuotaFormClient.tsx`'s React Compiler incompatible-library notice and `design/reference/support.js`'s deprecated-API warnings, both predate this session and are untouched by it).

**Still remaining for this phase (next unit of work):**
- Empty states beyond what individual screens already render inline were not specifically re-audited this session — most list/table screens already have an `empty` message (verified in earlier sessions); if a genuine gap turns up on closer inspection, fix it directly.
- Revisit any of this project's standing "**Assumption made (needs confirmation)**" notes across Phases 2-7 if the user has weighed in (none had, as of this session — nothing to change yet). This is the one remaining item before Phase 8 (and the whole v1 roadmap) can flip to ✅ COMPLETE — since it depends on user input, the practical next action is to ask the user directly rather than keep looping on unattended polish.

---

## Design Reference

A Claude Design canvas mockup (14 screens, Once UI, Spanish copy) exists at `design/reference/` — `Condominio App.dc.html` (only screens A1 and part of A2 preserved verbatim as concrete style examples; open it in a browser via a local static server to preview), `AdminNav.dc.html` (full, the admin sidebar), `support.js` (preview runtime only — not part of the app, don't import it). The full screen list and what each contains is captured below since the source file was trimmed for size — **use this as the UX/copy/layout reference when building each phase's screens.**

**Admin (desktop 1280px):**
- **A1 · Login Admin** (Phase 2) — email+password form, "Entrar como junta" heading, error state (wrong password, `aria-invalid`, "Te quedan 3 intentos"), "Mantener sesión" checkbox, "Olvidé mi contraseña" link, "¿Eres vecino? Entra con tu casa y PIN" link. *Ignore the mockup's "Solo la administradora y el tesorero tienen cuenta" copy — contradicts the locked single-admin-allowlist decision; keep copy singular.*
- **A2 · Dashboard** (Phase 6, uses Phase 4/5 data) — greeting + days-to-close-of-month, "Registrar pago"/"Nueva cuota" buttons, 4 KPI cards (Cobrado en {mes} per-currency w/ %-change badge, Morosos count + progress bar, Saldo pendiente per-currency, Saldo a favor highlight), 6-month per-currency income chart (3 separate scales, never combined), "Casas con deuda" table, scrollable "Últimos pagos" list.
- **A3 · Casas y vecinos** (Phase 3) — search + house/status filter chips, table (Casa, Nombre, Dueño, Teléfono, Email, Estado badge, edit/ver-pagos action icons).
- **A3b · Modal crear/editar casa** (Phase 3) — Código, Número de casa, Nombre, Dueño, Teléfono, Moneda habitual, Email (opcional). *Mockup doesn't show a PIN field — add one per the locked house-level-PIN decision.*
- **A4 · Crear cuota** (Phase 4) — Tipo de cuota (Recurrente/Única/Especial radio cards), Descripción, Monto + Moneda, "Dividir en cuotas" checkbox (Número de cuotas, Distribución Automática/Manual, Primera cuota date), Casas aplicables (Todas/Seleccionar chips), right-panel live preview (generated installments, total, non-conversion info banner, Resumen: cuotas generadas / recaudación esperada / cierre date).
- **A4b · Crear cuota (variante Recurrente)** (Phase 4) — Cadencia (Semanal/Mensual/Anual), Fecha de inicio, Número de cuotas, Monto por cuota + Moneda, summary bar (date range + total + scope).
- **A5 · Registrar pago** (Phase 5) — Casa selector, pending-cuotas checklist table, Monto recibido + Moneda, Fecha del pago (calendar widget), Referencia (opcional), Notas, right-panel "Resumen del pago" (line items, total, "Queda al día hasta {mes}" success box showing resulting saldo state, antes/después house status), toast confirmation on save.
- **A6 · Reporte mensual** (Phase 6) — month picker, CSV/PDF export buttons, currency filter chips (Todas/USD/Bs/USDT — filters view only, never sums across them), status filter, table + a **separate footer total row per currency** (esperado/cobrado/pendiente/favor).
- **A7 · Historial de pagos por casa** (Phase 6) — search + date-range + currency filters, "Pagado en {año}" + "Saldo a favor" stat tiles, payment table with a Detalle link.
- **A7b · Detalle de pago** (modal, Phase 5/6) — payment header (date+amount), Casa, Cuotas cubiertas, Moneda, Referencia, Registrado por, notes quote, "Anular pago" (danger)/"Cerrar".
- **A8 · Configuración** (Phase 2/3, admin profile+community settings) — Mi perfil, La comunidad (nombre/dirección/teléfono de la junta), Notificaciones toggles, "Cerrar sesión".

**Resident (mobile 390px):**
- **V1 · Login vecino** (Phase 3) — "Mi casa" selector (shows house code/name/owner for confirmation), "Mi PIN" 4-digit masked input, "Entrar" button, "¿Olvidaste tu PIN? Escríbele a Gladys al {tel}" (matches the locked admin-only-PIN-reset decision — contacting the admin, not self-service).
- **V2 · Mi hogar** (Phase 7) — greeting, saldo a favor/pendiente highlight card, house info card, "Lo que viene" (upcoming installments), "Reportar un pago que hice" button, bottom tab bar.
- **V3 · Mis cuotas** (Phase 7) — Pendientes/Histórico tabs, month-grid calendar color-coded (pagada/adelantada/pendiente/vencida), cuota especial list section.
- **V3b · Cuota vencida state** (Phase 7) — red "Deuda acumulada" card, overdue items list, "Escribir a la junta" CTA.
- **V4 · Mis pagos** (Phase 7) — period filter chips, payment history list, per-period total.
- **V5 · Contactar a la junta** (out of v1 scope — NOTF-* is v2/deferred; do not build a messaging feature, this screen is aspirational in the mockup).
- **V6 · Mi perfil** (Phase 7) — profile fields, "Cambiar mi PIN" row. *Contradicts the locked admin-only-PIN-assignment decision — do NOT build resident-initiated PIN change; keep this row out or make it link to "contact the admin" instead.*

**Responsive/component reference (R1-R3):** same dashboard reflowed at 768px/390px, plus a components sheet (button variants, status badges, input states, loading skeletons, empty state, error toast) — useful as a general Once UI usage reference across all phases, not tied to one.



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

Finish Phase 8 (Internationalization & Polish) — the last remaining phase. I18N-01 and I18N-02 are functionally done (full key-parity verified, locale switcher live on every top-level shell including the new admin sidebar), and the general polish pass is now mostly done too: mobile-responsive admin nav (`components/admin/AdminSidebar.tsx` + its `Dialog`-based mobile drawer), a shared loading-skeleton pattern (`components/shared/PageSkeleton.tsx` + a `loading.tsx` per data-fetching admin/resident route), and a global toast confirmation on payment save (`components/GlobalToaster.tsx`, wired into `PaymentFormClient.tsx`) all shipped this session. What's left:
- A closer empty-state audit if a genuine gap turns up (most list/table screens already have one — not re-verified exhaustively this session).
- **Revisit any of this project's standing "Assumption made (needs confirmation)" notes across Phases 2-7** — none had been addressed by the user as of this session. This is the one item that can't be resolved by more unattended coding; it needs the user's actual answer. Grep PLAN.md for that heading to list them all out, present them to the user, and once answered (or explicitly deferred), flip Phase 8's header to ✅ COMPLETE — that closes out the entire v1 roadmap.

**Before starting Phase 8:** push every still-pending migration if not already done — Phase 3 (`supabase/migrations/20260906120000_phase3_house_pin_and_rls.sql`), Phase 4 (`supabase/migrations/20260906130000_phase4_cuota_rls.sql`), Phase 5 (`supabase/migrations/20260906140000_phase5_payments.sql`), Phase 6 (`supabase/migrations/20260906150000_phase6_reporting.sql`) — see each phase's "Action needed" note above (Phase 7 needed no new migration). Also set `RESIDENT_SESSION_SECRET` (Phase 3) if not already done.

No formal planning-doc process required going forward; work directly from this file and update the phase status here as things land.

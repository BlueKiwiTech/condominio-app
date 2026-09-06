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
- ✅ **AUTH-01**: Admin can sign up with email and password (Supabase Auth)
- ✅ **AUTH-02**: Admin receives email verification after signup *(code complete; live-project email-template config is a required manual step — see Phase 2 "Action needed")*
- ✅ **AUTH-03**: Admin can reset password via email link
- ✅ **AUTH-04**: Admin session persists across browser refresh
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

Build out Phase 3 (Houses & Resident Access) — the `pin_hash` schema correction (move it from `condo_house_residents` to `condo_houses`, per the "Schema Correction Needed in Phase 3" section above), houses/residents admin CRUD (A3/A3b screens), and the resident house+PIN login (Pattern A, custom signed cookie via `jose`, V1 screen). No formal planning-doc process required going forward; work directly from this file and update the phase status here as things land.

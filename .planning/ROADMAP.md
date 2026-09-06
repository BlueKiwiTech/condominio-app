# Roadmap: Condominio App — ASOBARCELONA

## Overview

This roadmap takes the app from an empty repo to a fully bilingual, deployed dues-management system for ASOBARCELONA. The path is strictly dependency-ordered at the start (scaffold + schema → admin auth → houses/resident access) because houses are the foreign-key target for everything downstream. From there it follows the money: cuota definitions must exist before payments can be registered against them, and payments must exist before saldo/morosos reporting can be computed and trusted — directly serving the project's core value ("the admin can always answer who owes what, since when"). The resident portal is deliberately built last among features, since it needs both resident login (Phase 3) and accurate saldo/morosos (Phase 6) to have anything meaningful to show. Internationalization and final polish close out the roadmap once every screen that needs translating actually exists.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Deployment** - Scaffold the app, correct and migrate the Supabase schema, and stand up the Vercel deployment pipeline
- [ ] **Phase 2: Admin Authentication** - Admins can sign up, verify, log in, stay logged in, and recover their accounts
- [ ] **Phase 3: Houses & Resident Access** - Admin manages houses/residents; residents log in independently via house + PIN
- [ ] **Phase 4: Cuota Engine** - Admin defines recurring and special cuotas that generate correct per-house payable installments
- [ ] **Phase 5: Payments** - Admin registers payments against pending cuotas; residents retrieve receipts
- [ ] **Phase 6: Reporting & Delinquency** - Admin dashboard, morosos list, and monthly reports built on live, per-currency computation
- [ ] **Phase 7: Resident Portal** - Residents self-serve view their cuotas, saldo, and payment history
- [ ] **Phase 8: Internationalization & Polish** - Full Spanish/English coverage across every screen, production-ready

## Phase Details

### Phase 1: Foundation & Deployment
**Goal**: The app is scaffolded, deployable, and backed by a correctly-shaped, secured Supabase schema.
**Depends on**: Nothing (first phase)
**Requirements**: DPLY-01, DPLY-02
**Success Criteria** (what must be TRUE):
  1. Visiting the deployed Vercel URL renders the Next.js + Once UI component shell without build errors, with environment variables correctly wired to the Supabase project.
  2. The Supabase project has all core tables (communities, houses, house_residents, cuota_templates, cuotas, payments, audit_logs) created via version-controlled migrations, with RLS enabled deny-by-default on every table.
  3. Running the migrations against a fresh database reproduces the schema exactly (no manual/undocumented schema changes).
**Plans**: 6 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold Next.js 16 + install all Phase 1 dependencies
- [x] 01-02-PLAN.md — Wire next-intl [locale] routing + Once UI provider shell
- [x] 01-03-PLAN.md — Author the corrected 7-table Supabase migration (RLS, zero policies)
- [ ] 01-04-PLAN.md — Create Supabase project, push migration [BLOCKING], verify RLS + reproducibility
- [ ] 01-05-PLAN.md — Supabase SSR client helpers (server/client/proxy.ts)
- [ ] 01-06-PLAN.md — Vercel deployment: env vars, deploy, smoke check, secret-leak verification
**UI hint**: yes

### Phase 2: Admin Authentication
**Goal**: Admins can securely sign up, verify, log in, and recover access to their accounts.
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. Admin can sign up with email and password on a signup form and receives a verification email before gaining full access.
  2. Admin can log in via a login form and remains authenticated across a browser refresh; unauthenticated visitors attempting to reach an admin page are redirected to login.
  3. Admin can request a password reset email and complete the reset via the emailed link.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Houses & Resident Access
**Goal**: Admin manages the community's houses and resident credentials, and residents can independently log in to their own account.
**Depends on**: Phase 2
**Requirements**: HOUS-01, HOUS-02, HOUS-03, HOUS-04, HOUS-05, AUTH-05, AUTH-06, AUTH-07
**Success Criteria** (what must be TRUE):
  1. Admin can create, edit, delete, and list houses (house number, name, owner name/phone/email) via admin forms.
  2. Admin can add one or more residents (name, phone, PIN) to a house.
  3. Resident can log in on the login form by selecting their house from a dropdown and entering their PIN, with no email required.
  4. Repeated incorrect PIN attempts are rate-limited/locked out per house, and PINs are never stored or compared in plaintext.
  5. An authenticated admin can access all houses' data while a logged-in resident can access only their own house's data (enforced server-side/via RLS, verified for both roles).
**Plans**: TBD
**UI hint**: yes

### Phase 4: Cuota Engine
**Goal**: Admin can define recurring and special cuotas that generate correct, per-house payable installments.
**Depends on**: Phase 3
**Requirements**: CUOT-01, CUOT-02, CUOT-03, CUOT-04, CUOT-05, CUOT-06, CUOT-07
**Success Criteria** (what must be TRUE):
  1. Admin can create a recurring cuota (name, cadence, amount, currency, start date, installment count, target houses) via a cuota form, and the system generates one cuota instance per installment per applicable house.
  2. Admin can create a special/one-time cuota and optionally split it into N installments with staggered due dates (parent/child structure).
  3. Re-submitting or double-clicking cuota creation never produces duplicate installments — generation is transactional and idempotent.
  4. Admin can edit or delete a cuota (or template) as long as no payment has been registered against it.
  5. Admin can view a list of all cuotas with accurate pending/paid/overdue status.
**Plans**: TBD
**UI hint**: yes

### Phase 5: Payments
**Goal**: Admin can register payments against pending cuotas in a single action, and residents can retrieve proof of payment.
**Depends on**: Phase 4
**Requirements**: PMNT-01, PMNT-02, PMNT-03, PMNT-04, PMNT-05, PMNT-06, PMNT-07, PMNT-08
**Success Criteria** (what must be TRUE):
  1. Admin selects a house and sees its pending cuotas.
  2. Admin selects one or more pending cuotas and registers a single payment covering them via a payment form, with amount pre-filled from their sum (adjustable for partial payment), currency validated to match the cuota(s), date defaulting to today, and an optional notes field.
  3. Registering a payment updates the affected cuota(s)' status (pending/partially paid/paid) in the same transaction.
  4. Admin can view payment history, filterable by house.
  5. Resident can view a printable/viewable receipt (comprobante) for any of their house's registered payments, showing house, cuota(s), amount, date, currency, and the admin who registered it.
**Plans**: TBD
**UI hint**: yes

### Phase 6: Reporting & Delinquency
**Goal**: Admin can always answer "who owes what, since when" with accurate, live-computed numbers.
**Depends on**: Phase 5
**Requirements**: RPRT-01, RPRT-02, RPRT-03, RPRT-04, RPRT-05
**Success Criteria** (what must be TRUE):
  1. Admin dashboard shows KPIs (total collected this month, total outstanding, number of morosos houses).
  2. Admin dashboard shows a morosos list (house, owner, amount owed, owed-since date, days overdue, currency) computed live at query time, never from stale stored state.
  3. Every saldo/morosos figure is grouped and displayed per currency (USD, Bs, USDT) — never summed across currencies.
  4. Admin can view a monthly report for a selected month/year showing, per house, expected vs. paid vs. balance vs. status.
  5. Days-overdue and due-date calculations are calendar-day-safe in a fixed timezone, never off by a day from raw UTC handling.
**Plans**: TBD
**UI hint**: yes

### Phase 7: Resident Portal
**Goal**: Residents can self-serve view their own cuotas, balance, and payment history.
**Depends on**: Phase 3, Phase 6
**Requirements**: RSDT-01, RSDT-02, RSDT-03
**Success Criteria** (what must be TRUE):
  1. Resident can view their own cuotas as a calendar/grid, color-coded by status (pending/paid/overdue/advance-paid).
  2. Resident can view their own current saldo, framed as "credit" when positive or "debt since [oldest unpaid date]" when negative.
  3. Resident can view their own payment history.
**Plans**: TBD
**UI hint**: yes

### Phase 8: Internationalization & Polish
**Goal**: The app is fully bilingual and ready for production use.
**Depends on**: Phase 7
**Requirements**: I18N-01, I18N-02
**Success Criteria** (what must be TRUE):
  1. All admin- and resident-facing UI text is available in Spanish (default) and English.
  2. Switching locale does not lose the user's current page or in-progress state.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Deployment | 2/6 | In progress | - |
| 2. Admin Authentication | 0/? | Not started | - |
| 3. Houses & Resident Access | 0/? | Not started | - |
| 4. Cuota Engine | 0/? | Not started | - |
| 5. Payments | 0/? | Not started | - |
| 6. Reporting & Delinquency | 0/? | Not started | - |
| 7. Resident Portal | 0/? | Not started | - |
| 8. Internationalization & Polish | 0/? | Not started | - |

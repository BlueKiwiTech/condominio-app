# Requirements: Condominio App — ASOBARCELONA

**Defined:** 2026-09-04
**Core Value:** The admin can always answer "who owes what, since when" — accurate morosos and saldo tracking is the thing that must work, before anything else.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication (AUTH)

- [ ] **AUTH-01**: Admin can sign up with email and password (Supabase Auth)
- [ ] **AUTH-02**: Admin receives email verification after signup
- [ ] **AUTH-03**: Admin can reset password via email link
- [ ] **AUTH-04**: Admin session persists across browser refresh, via current `@supabase/ssr` App Router patterns
- [ ] **AUTH-05**: Resident can log in by selecting their house from a dropdown and entering a PIN — no email required
- [ ] **AUTH-06**: Resident PIN is hashed at rest (never stored or compared in plaintext) and the login endpoint is rate-limited against brute-force guessing (4-digit PIN space is small)
- [ ] **AUTH-07**: RLS (or an equivalent server-enforced authorization layer) ensures admins can access all community data and residents can access only their own house's data

### Houses (HOUS)

- [ ] **HOUS-01**: Admin can create a house (house number, name, owner name/phone/email)
- [ ] **HOUS-02**: Admin can edit a house's details
- [ ] **HOUS-03**: Admin can delete a house
- [ ] **HOUS-04**: Admin can view a list of all houses
- [ ] **HOUS-05**: Admin can add one or more residents (name, phone, PIN) to a house

### Cuotas (CUOT)

- [ ] **CUOT-01**: Admin can create a recurring cuota (name, cadence: weekly/monthly/annual, amount, currency, start date, number of installments), applied to all houses or a selected subset
- [ ] **CUOT-02**: Creating a recurring cuota generates one cuota instance per installment per applicable house (not a single shared record)
- [ ] **CUOT-03**: Admin can create a special/one-time cuota (name, amount, currency)
- [ ] **CUOT-04**: Admin can optionally divide a special cuota into N smaller installments with staggered due dates (parent/child structure)
- [ ] **CUOT-05**: Cuota generation (recurring and divisible) is transactional and idempotent — a retry or double-click does not create duplicate installments
- [ ] **CUOT-06**: Admin can edit or delete a cuota (or cuota template) before payments exist against it
- [ ] **CUOT-07**: Admin can view a list of all cuotas with their status (pending/paid/overdue)

### Payments (PMNT)

- [ ] **PMNT-01**: Admin can select a house and see its pending cuotas
- [ ] **PMNT-02**: Admin can register a payment against one or more selected pending cuotas in a single action (one payment reference can cover multiple cuotas)
- [ ] **PMNT-03**: Payment amount pre-fills from the sum of selected cuotas but can be adjusted (supports partial payment)
- [ ] **PMNT-04**: Payment currency must match the cuota's currency
- [ ] **PMNT-05**: Payment date defaults to today but can be changed; optional notes field
- [ ] **PMNT-06**: Registering a payment updates the affected cuota(s)' status (pending/partially paid/paid)
- [ ] **PMNT-07**: Admin can view payment history (all payments, filterable by house)
- [ ] **PMNT-08**: Resident can view a printable/viewable receipt (comprobante) for any of their house's registered payments — house, cuota(s), amount, date, currency, admin who registered it

### Reporting & Delinquency (RPRT)

- [ ] **RPRT-01**: Admin dashboard shows KPIs (e.g., total collected this month, total outstanding, number of morosos houses)
- [ ] **RPRT-02**: Admin dashboard shows a morosos (delinquent) list: house, owner, amount owed, owed-since date, days overdue, currency — computed at query time, not from stale stored state
- [ ] **RPRT-03**: Morosos and saldo calculations are grouped/computed per currency (USD, Bs, USDT never summed together)
- [ ] **RPRT-04**: Admin can view a monthly report for a selected month/year: per house, expected vs. paid vs. balance vs. status
- [ ] **RPRT-05**: Date/due-date/overdue calculations use calendar-day-safe logic pinned to a fixed timezone (not raw UTC string splitting), so "days overdue" is never off by a day

### Resident Portal (RSDT)

- [ ] **RSDT-01**: Resident can view their own cuotas as a calendar/grid, color-coded by status (pending/paid/overdue/advance-paid)
- [ ] **RSDT-02**: Resident can view their own current saldo — positive framed as "credit," negative framed as "debt since [oldest unpaid date]"
- [ ] **RSDT-03**: Resident can view their own payment history

### Internationalization (I18N)

- [ ] **I18N-01**: All admin and resident-facing UI text is available in Spanish (default) and English
- [ ] **I18N-02**: Locale switching does not lose the user's place in the app

### Deployment (DPLY)

- [x] **DPLY-01**: App is deployed to Vercel with environment variables configured for the Supabase project
- [x] **DPLY-02**: Supabase project has RLS enabled on every table and migrations are version-controlled

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Reporting

- **RPRT-06**: CSV/Excel export of monthly reports
- **RPRT-07**: Browsable admin UI for the audit log

### Notifications

- **NOTF-01**: In-app banner/highlight for upcoming due dates (no push/SMS)
- **NOTF-02**: WhatsApp/SMS automated payment reminders

### Financial Rules

- **FNCE-01**: Automated late-fee/penalty rules after a configurable grace period

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multi-tenant / multi-community support | Single-tenant build for ASOBARCELONA; `communities` table exists as a single-row placeholder only, per user decision |
| Currency conversion between USD/Bs/USDT | User explicitly chose to display amounts as-entered, never converted — also avoids exchange-rate feed complexity in a volatile-currency market |
| Online/card/crypto payment processing (Stripe, ACH, gateway integration) | Doesn't match how this community actually pays (cash/transfer/crypto wallet, then admin registers manually); no major processor natively handles Bs or USDT |
| Full accounting suite (expense tracking, budgets, general ledger) | Core value is income/dues tracking only, not full financial management |
| Maintenance/work orders, amenity booking, architectural review, e-voting, document repository | None serve the stated core value; each is its own sub-domain that would dilute focus |
| Automated late-fee/penalty calculation | No rules engine requested; deferred to v2 if the board wants software-enforced penalties |
| WhatsApp/SMS automated reminders | Requires external API integration/cost not yet committed to; resident self-check portal partially substitutes in v1 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DPLY-01 | Phase 1 — Foundation & Deployment | Complete |
| DPLY-02 | Phase 1 — Foundation & Deployment | Complete (1 accepted gap: fresh-DB reproducibility deferred) |
| AUTH-01 | Phase 2 — Admin Authentication | Pending |
| AUTH-02 | Phase 2 — Admin Authentication | Pending |
| AUTH-03 | Phase 2 — Admin Authentication | Pending |
| AUTH-04 | Phase 2 — Admin Authentication | Pending |
| HOUS-01 | Phase 3 — Houses & Resident Access | Pending |
| HOUS-02 | Phase 3 — Houses & Resident Access | Pending |
| HOUS-03 | Phase 3 — Houses & Resident Access | Pending |
| HOUS-04 | Phase 3 — Houses & Resident Access | Pending |
| HOUS-05 | Phase 3 — Houses & Resident Access | Pending |
| AUTH-05 | Phase 3 — Houses & Resident Access | Pending |
| AUTH-06 | Phase 3 — Houses & Resident Access | Pending |
| AUTH-07 | Phase 3 — Houses & Resident Access | Pending |
| CUOT-01 | Phase 4 — Cuota Engine | Pending |
| CUOT-02 | Phase 4 — Cuota Engine | Pending |
| CUOT-03 | Phase 4 — Cuota Engine | Pending |
| CUOT-04 | Phase 4 — Cuota Engine | Pending |
| CUOT-05 | Phase 4 — Cuota Engine | Pending |
| CUOT-06 | Phase 4 — Cuota Engine | Pending |
| CUOT-07 | Phase 4 — Cuota Engine | Pending |
| PMNT-01 | Phase 5 — Payments | Pending |
| PMNT-02 | Phase 5 — Payments | Pending |
| PMNT-03 | Phase 5 — Payments | Pending |
| PMNT-04 | Phase 5 — Payments | Pending |
| PMNT-05 | Phase 5 — Payments | Pending |
| PMNT-06 | Phase 5 — Payments | Pending |
| PMNT-07 | Phase 5 — Payments | Pending |
| PMNT-08 | Phase 5 — Payments | Pending |
| RPRT-01 | Phase 6 — Reporting & Delinquency | Pending |
| RPRT-02 | Phase 6 — Reporting & Delinquency | Pending |
| RPRT-03 | Phase 6 — Reporting & Delinquency | Pending |
| RPRT-04 | Phase 6 — Reporting & Delinquency | Pending |
| RPRT-05 | Phase 6 — Reporting & Delinquency | Pending |
| RSDT-01 | Phase 7 — Resident Portal | Pending |
| RSDT-02 | Phase 7 — Resident Portal | Pending |
| RSDT-03 | Phase 7 — Resident Portal | Pending |
| I18N-01 | Phase 8 — Internationalization & Polish | Pending |
| I18N-02 | Phase 8 — Internationalization & Polish | Pending |

**Coverage:**
- v1 requirements: 39 total
- Mapped to phases: 39/39 ✓
- Unmapped: 0

---
*Requirements defined: 2026-09-04*
*Last updated: 2026-09-04 after roadmap creation*

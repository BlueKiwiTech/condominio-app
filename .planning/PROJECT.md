# Condominio App — ASOBARCELONA

## What This Is

A payment-management web app for ASOBARCELONA, a closed community (calle cerrada / condominio / HOA). Admins define recurring and special "cuotas" (dues), register payments per house, and track who's behind. Residents log in with their house + a PIN to check their own balance and payment history — no email required for residents. Built single-tenant for this one community (not a multi-tenant SaaS).

## Core Value

The admin can always answer "who owes what, since when" — accurate morosos (delinquent accounts) and saldo (balance) tracking is the thing that must work, before anything else.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Admin can sign up/log in with email + password (Supabase Auth), with email verification and password reset
- [ ] Resident can log in by selecting their house from a dropdown and entering a PIN (no email)
- [ ] RLS enforces: admins see all data, residents see only their own house's data
- [ ] Admin can create/edit/delete houses (house number, name, owner name/phone/email)
- [ ] Admin can create a recurring cuota (name, cadence: weekly/monthly/annual, amount, currency, start date, # installments), applied to all houses or a selected subset — generates one cuota record per installment per applicable house
- [ ] Admin can create a special/unique cuota, optionally divided into N smaller installments with staggered due dates
- [ ] Admin can register a payment against one or more pending cuotas for a house (currency must match the cuota's currency, date defaults to today, optional notes)
- [ ] Admin dashboard shows KPIs and a morosos (delinquent) list: house, owner, amount owed, owed-since date, days overdue, currency
- [ ] Admin can view a monthly report: per house, expected vs paid vs balance vs status, for a selected month/year
- [ ] Resident can view their own cuotas as a calendar/grid, color-coded pending/paid/overdue/advance-paid
- [ ] Resident can see their own saldo (positive = credit, negative = debt with oldest unpaid date) and payment history
- [ ] Currency is tracked per cuota/payment as one of USD, Bs, or USDT, displayed with no conversion between currencies
- [ ] App is bilingual (Spanish default, English available) via i18n
- [ ] App is deployed on Vercel with a Supabase Postgres backend

### Out of Scope

- Multi-tenant / multi-community support — this build is single-tenant for ASOBARCELONA; the `communities` table exists in the schema for future-proofing but only one row is ever used in v1
- Currency conversion between USD/Bs/USDT — amounts are tracked and displayed as-entered, never converted
- Online/card payment processing — payments are registered manually by the admin after being received out-of-band (cash, transfer, etc.)
- CSV export of reports — noted as optional in the original spec, deferred past v1
- Audit log UI — the `audit_logs` table may be written to, but no admin-facing UI to browse it in v1

## Context

- This is a rewrite/fresh build from a detailed handoff spec supplied by the user (agasocial team), preserved at `docs/handoff-prompt.md` in this repo.
- Domain vocabulary is Spanish-first: "cuota" (dues/fee), "vecino" (resident/neighbor), "moroso" (delinquent account), "saldo" (balance). Currency options (USD, Bs, USDT) indicate a Venezuela-adjacent context — expect Bolívares (Bs) and USDT (crypto stablecoin) as real, actively-used payment currencies, not edge cases.
- Two structurally different auth flows share one app: admins via standard Supabase Auth (email/password), residents via a custom house-selection + PIN flow with no email. This dual-auth setup is the trickiest architectural piece and needs care in RLS policy design.
- Cuotas have a self-referential parent/child structure (`parent_cuota_id`) to support splitting a special cuota into installments — this recursive generation logic (both for recurring cuotas across installments and for divided special cuotas) is core business logic, not incidental.
- Design system: Once UI (open-source, MIT-licensed component library). A Claude Design canvas link was shared for visual reference but not yet fetched/reviewed in this session.

## Constraints

- **Tech stack**: Next.js 14+ (TypeScript, App Router), Supabase (Postgres + Auth), Vercel — specified directly by the user, not open for reconsideration without discussion
- **Design system**: Once UI — specified by the user
- **i18n**: Spanish is the default locale, English keys also supported
- **Security**: Resident PINs must be hashed (bcrypt or equivalent), never stored/compared in plaintext; RLS must be enabled on all tables; service role key stays server-only

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Single-tenant for ASOBARCELONA, not multi-tenant SaaS | User confirmed this is for one specific community; multi-tenant onboarding/isolation adds significant scope with no near-term payoff | — Pending |
| Core value is admin-side morosos/saldo tracking accuracy | User confirmed this over resident self-service as the thing that must work first | — Pending |
| No currency conversion; USD/Bs/USDT tracked and shown as-is | Directly specified in the original handoff spec | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-04 after initialization*

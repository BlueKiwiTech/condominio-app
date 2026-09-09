# Gastos (Condo Expenses) — Design

**Date:** 2026-09-08
**Status:** Approved by user, ready for implementation planning.

## Purpose

Admins need to track the condominium's outgoing expenses (fixed and variable) alongside the existing cuota/payment (incoming) tracking. Pure admin feature — residents never see gastos. Core value: admin can see what's owed to vendors/staff and what's been paid, per currency, without conflating it with resident dues.

## Scope

In scope: recording fixed (indefinite, recurring) and variable (finite installments) expenses, marking them paid, categorizing them, and surfacing "gastos pendientes del mes" on the admin dashboard.

Out of scope (do not build without a separate decision): partial payment of a gasto, overdue/mora tracking for gastos, receipt/invoice attachments, category CRUD UI (categories are seeded, fixed for now), multi-select "pay several gastos at once", currency conversion/netting against income.

## Rejected alternatives

- **Single `condo_expenses` table with `is_recurring` self-reference** — rejected: forces the cron's "find the last instance of this series" logic into a self-join instead of a clean FK to a template row, reintroducing the exact template/instance conflation the codebase already corrected for cuotas (see PLAN.md Architecture section).
- **Reuse `condo_installments`/`condo_installment_templates` with a `direction` column** — rejected: those tables are architected around `house_id` (per-house instances, RLS scoped to house). Gastos are community-wide, not house-scoped. Forcing this through means either a nullable `house_id` (breaks existing house-scoped RLS assumptions) or a fake placeholder house — both worse than two new tables.

## Schema

### `condo_expense_categories`
Lookup table. Seeded with 5 rows: Nómina, Servicios, Mantenimiento, Seguridad, Otros. No CRUD UI in this feature (deferred).

- `id uuid primary key`
- `name text not null`

### `condo_expense_templates`
The expense *definition*, community-wide (no `house_id`).

- `id uuid primary key`
- `community_id uuid not null references condo_communities`
- `name text not null` — e.g. "Sueldo vigilante", "Internet CANTV"
- `category_id uuid not null references condo_expense_categories`
- `provider text` — vendor/beneficiary name
- `kind text not null` — `'fixed' | 'variable'`
- `cadence text` — `'weekly'|'biweekly'|'monthly'|'quarterly'|'annual'`; required when `kind='fixed'`, null when `kind='variable'`
- `currency text not null` — `'USD'|'Bs'|'USDT'`
- `default_amount numeric not null` — meaning depends on `kind`:
  - `kind='fixed'`: the seed value copied as-is into each new instance's `amount`; the actual per-period amount is then edited on the instance, not here.
  - `kind='variable'`: the **total** amount for the whole expense, split across `installment_count` instances at generation time (same `splitAmount` logic already used for special-divided cuotas in `lib/cuotas/generate.ts` — integer-cents split, remainder absorbed by the last installment so the sum is exact).
- `start_date date not null`
- `installment_count int` — required when `kind='variable'` (finite series, staggered due dates, same pattern as special cuotas' `template_id` + `installment_number`); null when `kind='fixed'` (indefinite — no total)
- `active boolean not null default true` — sets to false to stop generating future instances of a fixed template without deleting history
- `created_at timestamptz not null default now()`

### `condo_expenses`
The expense *instance* — what gets listed, edited, and marked paid.

- `id uuid primary key`
- `template_id uuid not null references condo_expense_templates`
- `category_id uuid not null` — denormalized copy from the template at generation time (a later category rename shouldn't rewrite history)
- `provider text` — denormalized copy, same reasoning
- `currency text not null` — denormalized copy
- `amount numeric not null` — starts as `default_amount`, freely editable while `status='pending'`
- `installment_number int` — set only for `kind='variable'` instances
- `period_date date not null` — which week/month/quarter/year this instance belongs to; drives both the cron's idempotency guard and the "this month" dashboard KPI
- `status text not null default 'pending'` — `'pending'|'paid'` only; no overdue/mora state
- `paid_date date`
- `notes text`
- `created_at timestamptz not null default now()`
- Unique constraint on `(template_id, period_date)` — idempotency guard for the cron (mirrors the NULL-loophole fix already applied to cuota installment idempotency in `20260906033502_schema_hardening.sql`)

No price-history table (amount changes aren't audited — not requested). No `amount_paid` column separate from `amount` (gastos are binary pending/paid, no partial payments).

RLS: deny-by-default like every other table; admin-only policies (no resident policy needed since residents never access gastos).

## Generation mechanics

- **Fixed templates**: a daily Vercel Cron, added to the existing `vercel.json` (repo already uses this file, not `vercel.ts`) — `{ "path": "/api/cron/generate-expenses", "schedule": "0 6 * * *" }` — walks all `active=true, kind='fixed'` templates. For each, computes whether the next `period_date` (based on `cadence` from the last generated instance, or `start_date` if none exist yet) has arrived, and inserts the new pending instance — guarded by the `(template_id, period_date)` unique constraint so a retry or double-run cron invocation can't duplicate.
- **Variable templates**: all `installment_count` instances are generated at template-creation time in one transaction, with staggered `period_date`s — same idempotent-generation approach already used for special cuotas, no cron involved.

## Admin UI

New "Gastos" section in the admin sidebar nav.

- **List view**: filterable by status (pending/paid), category, provider, month. Shows originating template name, amount, period, status.
- **Create template form**: fixed variant (name, category, provider, cadence, currency, default amount, start date) or variable variant (same fields minus cadence, plus installment count) — zod + react-hook-form, matching existing form conventions.
- **Mark as paid**: single-instance action — admin adjusts `amount` if it changed since the estimate, sets `paid_date` (defaults today), optional notes, sets `status='paid'`. No multi-select batch payment (each gasto is a distinct bill, unlike cuotas which group by house).

## Dashboard integration

In the existing 5-column KPI grid (`components/dashboard/DashboardPageClient.tsx`), replace the **"Saldo a favor" (credit)** tile with a new **"Gastos pendientes del mes"** tile:
- Computed via a new `sumByCurrency`-based aggregator (same pattern as `lib/reporting/dashboard.ts`'s existing helpers) over `condo_expenses` where `period_date` falls in the current month and `status='pending'`.
- Shown **per currency**, never summed across USD/Bs/USDT (same RPRT-03 rule already enforced everywhere else in reporting).
- The existing credit computation (`creditsByCurrency`, `condo_house_credits`) is untouched elsewhere (e.g. resident portal's own saldo view per RSDT-02) — only removed from this specific dashboard tile.

## Testing

No automated test suite exists anywhere in this repo (confirmed: no `test` script, no `*.test.ts`, no `__tests__`). Verification stays manual/behavioral, consistent with every prior phase in PLAN.md:

- Idempotency: running the cron twice in the same period must not create duplicate instances (unique constraint + guard) — verify via two manual invocations of the cron route.
- Currency isolation: dashboard KPI and list filters must never sum across currencies — verify visually with mixed-currency seed data.
- RLS: resident-scoped client must not be able to read `condo_expense_templates`/`condo_expenses` at all — verify via a direct query using the resident-scoped client.
- Variable template creation: N instances generated transactionally with correct staggered `period_date`s and split amounts, matching `installment_count` — verify via manual creation + a DB query.

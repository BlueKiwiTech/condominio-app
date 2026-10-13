# Multi-tenancy Foundation — Design

**Status:** Approved, pending implementation plan
**Scope:** Schema + RLS foundation only. No tenant-routing UI, no self-service community signup, no admin-invite flow.

## Why

The app is pivoting from single-tenant (ASOBARCELONA only) to a sellable SaaS product that will host multiple communities. Today there is exactly one `condo_communities` row, created lazily on first admin signup, and the whole schema/RLS/auth layer assumes it's the only one that will ever exist.

## Current state (confirmed by reading the migrations)

- `condo_houses` and `condo_installment_templates` already carry a `community_id` column. Nothing else does.
- **Every** admin RLS policy in the app (10+ migrations, ~15 policies, across `condo_houses`, `condo_house_residents`, `condo_installment_templates`, `condo_installments`, `condo_payments`, `condo_house_credits`, `condo_audit_logs`, `condo_payment_reports`, `condo_installment_price_history`, `condo_exchange_rates`, the `gastos` tables) uses the same shape:
  ```sql
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  ```
  This checks "is this user an admin of *any* community," never the row's own `community_id`. It's invisible today because only one community exists. The moment a second one does, every admin can read/write every other community's data.
- `condo_communities.admin_id` is a single nullable FK — one admin per community, no way to have more than one.
- `condo_houses.house_number` is globally `UNIQUE`, and `condo_verify_house_pin(house_number, pin)` (the resident-login RPC) looks a house up by `house_number` alone, with no community disambiguation.
- Admin signup (`lib/actions/auth.ts`) lazily creates/links the single `condo_communities` row on first signup, gated by a single hardcoded `ADMIN_ALLOWLIST_EMAIL`.

## Decisions

1. **Tenant identification/UI is explicitly out of scope for this phase.** Only one community (ASOBARCELONA) exists in production. This phase makes the data model and RLS tenant-correct; it does not build subdomain routing, a community picker, or self-service onboarding. That's a deliberate, separate follow-up.

2. **`community_id` is denormalized directly onto every table**, not derived through joins (e.g. via `house_id`). This matches Supabase's own RLS guidance: a plain equality check on an indexed column is simpler and cheaper than a join/subquery on every policy, and avoids recursive-RLS pitfalls.

   Tables needing the column added: `condo_house_residents`, `condo_installments`, `condo_payments`, `condo_audit_logs`, `condo_house_credits`, `condo_payment_reports`, `condo_installment_price_history`, `condo_exchange_rates`, `condo_expense_categories`, `condo_expenses`. (`condo_houses`, `condo_installment_templates`, `condo_expense_templates` already have it.)

   Each new column: `not null references condo_communities(id)`, backed by an index (or added to an existing composite index where one already exists on that table).

3. **Multiple admins per community**, via a new join table:
   ```sql
   create table condo_community_admins (
     community_id uuid not null references condo_communities(id) on delete cascade,
     user_id uuid not null references auth.users(id) on delete cascade,
     created_at timestamptz not null default now(),
     primary key (community_id, user_id)
   );
   ```
   `condo_communities.admin_id` is dropped. Admins for new communities are provisioned directly by the developer (Supabase dashboard/SQL) — an `auth.users` row plus a `condo_community_admins` row — not through a public signup flow. The existing `/signup` + `ADMIN_ALLOWLIST_EMAIL` path is left working as-is for ASOBARCELONA's existing admin(s); it is not reworked into general tenant onboarding in this phase.

4. **Every admin RLS policy is rewritten** from the "any community" check to a real per-row tenant check:
   ```sql
   using (community_id in (select community_id from condo_community_admins where user_id = auth.uid()))
   with check (community_id in (select community_id from condo_community_admins where user_id = auth.uid()))
   ```
   Applied uniformly to all ~15 existing policies plus new policies for the tables gaining `community_id` for the first time. `condo_communities` itself gets an analogous policy keyed on its own `id`.

5. **`condo_houses.house_number` uniqueness changes from global to per-community**: `unique (community_id, house_number)` instead of `unique (house_number)`. This is a data-integrity fix independent of any login UI — without it, a second community could never have a "House 12" if the first one already does.

   **Known, accepted gap:** `condo_verify_house_pin` still looks up by `house_number` alone. Once a second community exists with an overlapping house number, resident login becomes ambiguous. This is deliberately not fixed now (decision #1) — it must be resolved when tenant-routing UI is built, and should be called out in `PLAN.md` as a blocker for onboarding any second community, not silently left broken.

6. **Resident session cookie gains `community_id`** alongside the existing `house_id` in the signed `jose` payload — cheap to add now while that code is already being touched for the schema change, avoids a second cookie-shape migration later. The resident-scoped service-role queries aren't required to filter by it yet (only one tenant exists), but the field is there for when they need to.

7. **Backfill migration**: every existing row across the newly-changed tables gets `community_id` set to the current single ASOBARCELONA `condo_communities` row before each column is set `NOT NULL`.

## Out of scope (explicitly deferred, not forgotten)

- Subdomain or slug-based tenant routing.
- Self-service community/admin signup.
- Resident-login community disambiguation (blocked by the above).
- Billing/plan management.
- Any UI for switching between or managing multiple communities as an admin.

## Rollout shape

One migration (or a tight sequence): join table → policy rewrite across all tables → new `community_id` columns → backfill → `house_number` constraint change → `NOT NULL` enforcement. Existing Server Actions/queries don't need `community_id` threaded through application code yet since production still has exactly one tenant — but new code going forward should start passing/scoping by it where practical.

# Multi-tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every table's data tenant-scoped to a `condo_communities` row and fix every admin RLS policy so it actually checks a row's own community, ahead of onboarding a second community.

**Architecture:** Add `community_id` directly (denormalized) to the 10 tables that don't yet have it, backed by BEFORE INSERT triggers that auto-derive it from each row's existing house/template/admin relationship so no application code needs to change to keep working. Replace the single `condo_communities.admin_id` FK with a `condo_community_admins` join table (multiple admins per community, provisioned directly in the database — no self-service invite flow) and a `security definer` helper function, then rewrite every admin RLS policy across all 14 tables to check the row's own `community_id` through that function instead of "is this user an admin of any community." Fix the two uniqueness constraints (`house_number`, expense category `name`) that assumed a single tenant.

**Tech Stack:** Postgres/Supabase migrations (SQL), `pgcrypto`/`jose` (resident auth, touched only in Task 8), TypeScript/Next.js Server Actions.

**Spec:** `docs/superpowers/specs/2026-09-14-multitenancy-foundation-design.md`

## Global Constraints

- Every table, trigger, and function uses the `condo_` prefix (locked naming convention).
- RLS stays enabled on every table; every rewritten admin policy must check the row's own `community_id` — never "is this user an admin of any community."
- `community_id` is denormalized directly onto every table (not derived via joins at query time) per the approved design.
- Migrations are written in this repo but **applied by the user** via the Supabase Dashboard SQL Editor or their own CLI session — never assume a migration has been run against the live project. Each task below is verified locally (code self-review, `npm run build`, `npx eslint .`) — **not** against a live or local Postgres instance (no Docker/local Supabase testing this phase, per user decision).
- Out of scope, do not build: tenant-routing UI (subdomain/slug), self-service community/admin signup, resident-login community disambiguation, billing, any admin UI for switching between communities.
- Known, accepted gap this plan does not fix: `condo_verify_house_pin` still looks up by `house_number` alone — once a second community has an overlapping house number, resident login becomes ambiguous. Must be called out in `PLAN.md`, not silently left broken.

---

### Task 1: `condo_community_admins` join table + admin-check helper function

**Files:**
- Create: `supabase/migrations/20260914100000_community_admins.sql`

**Interfaces:**
- Produces: table `condo_community_admins(community_id uuid, user_id uuid, created_at timestamptz)`, primary key `(community_id, user_id)`; function `condo_is_community_admin(target_community_id uuid) returns boolean` (`security definer`, `stable`, executable by `authenticated`).
- Consumes: existing `condo_communities(id, admin_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- Multiple admins per community (design doc decision C). Admins are
-- provisioned directly in the database by the developer -- there is no
-- self-service invite flow. condo_communities.admin_id (single FK) is
-- dropped once nothing depends on it (Task 5).
create table condo_community_admins (
  community_id uuid not null references condo_communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index condo_community_admins_user_idx on condo_community_admins (user_id);

-- Deny-by-default, zero policies -- same posture Phase 1 used for every
-- table at creation (initial_schema.sql). Nothing queries this table
-- through the cookie-scoped `authenticated` client today: only the
-- service-role client (lib/actions/auth.ts, Task 2) and the SECURITY
-- DEFINER function below touch it, both of which bypass RLS.
alter table condo_community_admins enable row level security;

-- Backfill: the single existing admin_id becomes a row here.
insert into condo_community_admins (community_id, user_id)
select id, admin_id from condo_communities where admin_id is not null
on conflict (community_id, user_id) do nothing;

-- condo_is_community_admin: the one helper every admin RLS policy in this
-- migration series will call (Task 4). SECURITY DEFINER + a locked-down
-- search_path so it can read condo_community_admins regardless of the
-- caller's own RLS (same rationale as condo_verify_house_pin in Phase 3's
-- migration) -- and per supabase-postgres-best-practices' RLS-performance
-- guidance, wrapping auth.uid() in a SELECT lets Postgres cache it once per
-- statement instead of re-evaluating per row.
create or replace function condo_is_community_admin(target_community_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.condo_community_admins
    where community_id = target_community_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function condo_is_community_admin(uuid) from public;
grant execute on function condo_is_community_admin(uuid) to authenticated;
```

- [ ] **Step 2: Self-review the migration**

Read the file back and confirm:
- `condo_community_admins` has exactly the three columns above, composite PK, both FKs `on delete cascade`.
- RLS is enabled with **zero** policies (matches this codebase's own Phase-1 deny-by-default convention for a brand-new table).
- `condo_is_community_admin` is `security definer`, `set search_path = ''`, `stable`, and `auth.uid()` is wrapped in `(select ...)`.
- `execute` is revoked from `public` and granted only to `authenticated` (matches `condo_hash_pin`'s existing grant pattern in `20260906120000_phase3_house_pin_and_rls.sql`).
- The backfill `insert` only touches rows where `admin_id is not null` and no-ops on conflict.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260914100000_community_admins.sql
git commit -m "feat(db): add condo_community_admins join table and admin-check helper"
```

---

### Task 2: Point admin signup at the join table

**Files:**
- Modify: `lib/actions/auth.ts:29-51` (the `linkAdminToCommunity` function)

**Interfaces:**
- Consumes: table `condo_community_admins` (Task 1).
- Produces: `linkAdminToCommunity(userId: string): Promise<void>` — same signature, called unchanged from `signup()` at line 77.

- [ ] **Step 1: Replace `linkAdminToCommunity`**

```ts
/**
 * Links the newly-created auth.users account to the single condo_communities
 * row (creating it on first signup if it doesn't exist yet), then records
 * this user as one of that community's admins in condo_community_admins.
 * Must run via the service-role client — signUp() returns a null session
 * while "Confirm email" is enabled (AUTH-02), so there is no auth.uid()-backed
 * session yet for any RLS policy to authorize these writes.
 */
async function linkAdminToCommunity(userId: string) {
  const service = createServiceClient();
  const { data: community } = await service
    .from('condo_communities')
    .select('id')
    .limit(1)
    .maybeSingle();

  let communityId = community?.id as string | undefined;
  if (!communityId) {
    const { data: created } = await service
      .from('condo_communities')
      .insert({ name: 'ASOBARCELONA' })
      .select('id')
      .single();
    communityId = created?.id;
  }
  if (!communityId) return;

  await service
    .from('condo_community_admins')
    .upsert(
      { community_id: communityId, user_id: userId },
      { onConflict: 'community_id,user_id', ignoreDuplicates: true },
    );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: PASS, no TypeScript errors.

- [ ] **Step 3: Run lint**

Run: `npx eslint .`
Expected: no new warnings/errors beyond the two pre-existing ones already documented in `PLAN.md` (Phase 8 notes).

- [ ] **Step 4: Commit**

```bash
git add lib/actions/auth.ts
git commit -m "feat(auth): link admin signups through condo_community_admins"
```

---

### Task 3: Add `community_id` to the remaining 10 tables, backfill, enforce NOT NULL

**Files:**
- Create: `supabase/migrations/20260914110000_community_id_remaining_tables.sql`

**Interfaces:**
- Produces: `community_id uuid not null references condo_communities(id)` (indexed) on `condo_house_residents`, `condo_installments`, `condo_payments`, `condo_house_credits`, `condo_payment_reports`, `condo_installment_price_history`, `condo_exchange_rates`, `condo_expense_categories`, `condo_expenses`, `condo_audit_logs`. Produces function `condo_default_community_id() returns uuid` (`stable`).
- Consumes: `condo_houses.community_id`, `condo_installment_templates.community_id`, `condo_expense_templates.community_id` (all pre-existing), `condo_community_admins` (Task 1).

- [ ] **Step 1: Write the migration**

```sql
-- Denormalized community_id on every remaining table (design doc decision
-- B) -- a plain equality check in RLS, not a join through house_id/
-- template_id at query time.

-- condo_default_community_id(): "the one community that exists today."
-- Used by this migration's backfill for tables with no natural parent link,
-- and reused by the autofill triggers in Task 6 for the same tables going
-- forward.
create or replace function condo_default_community_id()
returns uuid
language sql
stable
as $$
  select id from condo_communities order by created_at limit 1;
$$;

-- 1. condo_house_residents (derive via house_id)
alter table condo_house_residents add column community_id uuid references condo_communities(id);
update condo_house_residents r
  set community_id = h.community_id
  from condo_houses h
  where h.id = r.house_id and r.community_id is null;
alter table condo_house_residents alter column community_id set not null;
create index condo_house_residents_community_idx on condo_house_residents (community_id);

-- 2. condo_installments (derive via house_id)
alter table condo_installments add column community_id uuid references condo_communities(id);
update condo_installments i
  set community_id = h.community_id
  from condo_houses h
  where h.id = i.house_id and i.community_id is null;
alter table condo_installments alter column community_id set not null;
create index condo_installments_community_idx on condo_installments (community_id);

-- 3. condo_payments (derive via house_id)
alter table condo_payments add column community_id uuid references condo_communities(id);
update condo_payments p
  set community_id = h.community_id
  from condo_houses h
  where h.id = p.house_id and p.community_id is null;
alter table condo_payments alter column community_id set not null;
create index condo_payments_community_idx on condo_payments (community_id);

-- 4. condo_house_credits (derive via house_id)
alter table condo_house_credits add column community_id uuid references condo_communities(id);
update condo_house_credits c
  set community_id = h.community_id
  from condo_houses h
  where h.id = c.house_id and c.community_id is null;
alter table condo_house_credits alter column community_id set not null;
create index condo_house_credits_community_idx on condo_house_credits (community_id);

-- 5. condo_payment_reports (derive via house_id)
alter table condo_payment_reports add column community_id uuid references condo_communities(id);
update condo_payment_reports pr
  set community_id = h.community_id
  from condo_houses h
  where h.id = pr.house_id and pr.community_id is null;
alter table condo_payment_reports alter column community_id set not null;
create index condo_payment_reports_community_idx on condo_payment_reports (community_id);

-- 6. condo_installment_price_history (derive via template_id -> condo_installment_templates)
alter table condo_installment_price_history add column community_id uuid references condo_communities(id);
update condo_installment_price_history ph
  set community_id = t.community_id
  from condo_installment_templates t
  where t.id = ph.template_id and ph.community_id is null;
alter table condo_installment_price_history alter column community_id set not null;
create index condo_installment_price_history_community_idx on condo_installment_price_history (community_id);

-- 7. condo_expenses (derive via template_id -> condo_expense_templates)
alter table condo_expenses add column community_id uuid references condo_communities(id);
update condo_expenses e
  set community_id = t.community_id
  from condo_expense_templates t
  where t.id = e.template_id and e.community_id is null;
alter table condo_expenses alter column community_id set not null;
create index condo_expenses_community_idx on condo_expenses (community_id);

-- 8. condo_exchange_rates (no natural parent -- community-wide reference data)
alter table condo_exchange_rates add column community_id uuid references condo_communities(id);
update condo_exchange_rates set community_id = condo_default_community_id() where community_id is null;
alter table condo_exchange_rates alter column community_id set not null;
create index condo_exchange_rates_community_idx on condo_exchange_rates (community_id);

-- 9. condo_expense_categories (no natural parent -- shared seed data today)
alter table condo_expense_categories add column community_id uuid references condo_communities(id);
update condo_expense_categories set community_id = condo_default_community_id() where community_id is null;
alter table condo_expense_categories alter column community_id set not null;
create index condo_expense_categories_community_idx on condo_expense_categories (community_id);

-- 10. condo_audit_logs (derive via user_id -> condo_community_admins, else default)
alter table condo_audit_logs add column community_id uuid references condo_communities(id);
update condo_audit_logs a
  set community_id = ca.community_id
  from condo_community_admins ca
  where ca.user_id = a.user_id and a.community_id is null;
update condo_audit_logs set community_id = condo_default_community_id() where community_id is null;
alter table condo_audit_logs alter column community_id set not null;
create index condo_audit_logs_community_idx on condo_audit_logs (community_id);
```

- [ ] **Step 2: Self-review the migration**

Read the file back and confirm, for all 10 tables: `add column` (nullable) → backfill `update`(s) → `alter column ... set not null` → `create index`, in that order, and that `condo_default_community_id()` is defined before its first use. Cross-check the table list against the spec's list in `docs/superpowers/specs/2026-09-14-multitenancy-foundation-design.md` (decision #2) — all 10 must be present, none extra, none missing.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260914110000_community_id_remaining_tables.sql
git commit -m "feat(db): add community_id to every remaining tenant-scoped table"
```

---

### Task 4: Rewrite every admin RLS policy to check the row's own community

**Files:**
- Create: `supabase/migrations/20260914120000_rewrite_admin_rls_policies.sql`

**Interfaces:**
- Consumes: `condo_is_community_admin(uuid)` (Task 1), `community_id` on all 14 `condo_*` tables (pre-existing on 3, added in Task 3 on the other 10... wait 11, see note).
- Produces: same 15 policy names as before, rewritten definitions.

> Note: `condo_expense_templates` already had `community_id` since its own migration — it is included in this task's rewrite even though Task 3 didn't touch its column.

- [ ] **Step 1: Write the migration**

```sql
-- Replaces every "is this user an admin of ANY community" policy
-- (`exists (select 1 from condo_communities c where c.admin_id = auth.uid())`)
-- with a real per-row tenant check via condo_is_community_admin(). This is
-- the actual multi-tenancy bug fix (design doc section B) -- until this
-- migration runs, every one of these policies lets any admin read/write
-- every other community's rows once a second community exists.

-- condo_communities (checks its own id, not a community_id column)
drop policy condo_communities_admin_all on condo_communities;
create policy condo_communities_admin_all on condo_communities
  for all
  using (condo_is_community_admin(id))
  with check (condo_is_community_admin(id));

-- condo_houses
drop policy condo_houses_admin_all on condo_houses;
create policy condo_houses_admin_all on condo_houses
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_house_residents
drop policy condo_house_residents_admin_all on condo_house_residents;
create policy condo_house_residents_admin_all on condo_house_residents
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_installment_templates
drop policy condo_installment_templates_admin_all on condo_installment_templates;
create policy condo_installment_templates_admin_all on condo_installment_templates
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_installments
drop policy condo_installments_admin_all on condo_installments;
create policy condo_installments_admin_all on condo_installments
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_payments
drop policy condo_payments_admin_all on condo_payments;
create policy condo_payments_admin_all on condo_payments
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_house_credits
drop policy condo_house_credits_admin_all on condo_house_credits;
create policy condo_house_credits_admin_all on condo_house_credits
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_audit_logs (select + insert only, no update/delete -- unchanged from original)
drop policy condo_audit_logs_admin_read_write on condo_audit_logs;
drop policy condo_audit_logs_admin_insert on condo_audit_logs;
create policy condo_audit_logs_admin_read_write on condo_audit_logs
  for select
  using (condo_is_community_admin(community_id));
create policy condo_audit_logs_admin_insert on condo_audit_logs
  for insert
  with check (condo_is_community_admin(community_id));

-- condo_installment_price_history
drop policy condo_installment_price_history_admin_all on condo_installment_price_history;
create policy condo_installment_price_history_admin_all on condo_installment_price_history
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_exchange_rates
drop policy condo_exchange_rates_admin_all on condo_exchange_rates;
create policy condo_exchange_rates_admin_all on condo_exchange_rates
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_payment_reports
drop policy condo_payment_reports_admin_all on condo_payment_reports;
create policy condo_payment_reports_admin_all on condo_payment_reports
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_expense_categories
drop policy condo_expense_categories_admin_all on condo_expense_categories;
create policy condo_expense_categories_admin_all on condo_expense_categories
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_expense_templates
drop policy condo_expense_templates_admin_all on condo_expense_templates;
create policy condo_expense_templates_admin_all on condo_expense_templates
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_expenses
drop policy condo_expenses_admin_all on condo_expenses;
create policy condo_expenses_admin_all on condo_expenses
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));
```

- [ ] **Step 2: Self-review the migration**

Run this check against the migration file and the historical grep, side by side:

```bash
grep -c "^drop policy" supabase/migrations/20260914120000_rewrite_admin_rls_policies.sql
grep -c "^create policy" supabase/migrations/20260914120000_rewrite_admin_rls_policies.sql
```

Expected: 15 drops, 15 creates. Confirm every policy name matches exactly what exists in the current migrations (`condo_communities_admin_all`, `condo_houses_admin_all`, `condo_house_residents_admin_all`, `condo_installment_templates_admin_all`, `condo_installments_admin_all`, `condo_payments_admin_all`, `condo_house_credits_admin_all`, `condo_audit_logs_admin_read_write`, `condo_audit_logs_admin_insert`, `condo_installment_price_history_admin_all`, `condo_exchange_rates_admin_all`, `condo_payment_reports_admin_all`, `condo_expense_categories_admin_all`, `condo_expense_templates_admin_all`, `condo_expenses_admin_all` — 15 names) and that no policy still contains the old `c.admin_id = auth.uid()` shape.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260914120000_rewrite_admin_rls_policies.sql
git commit -m "fix(db): scope every admin RLS policy to its own community_id"
```

---

### Task 5: Drop the legacy `condo_communities.admin_id` column

**Files:**
- Create: `supabase/migrations/20260914130000_drop_communities_admin_id.sql`

**Interfaces:**
- Consumes: nothing (this only removes something nothing else should reference by now).

- [ ] **Step 1: Confirm nothing references `admin_id` anymore**

Run: `grep -rn "admin_id" lib app supabase/migrations --include="*.ts" --include="*.tsx" --include="*.sql" | grep -v "20260914"`
Expected: no matches outside migration files already superseded by Task 1-4 (the only remaining historical hits should be inside the *old* migrations, which is fine — those are immutable history, not live code).

- [ ] **Step 2: Write the migration**

```sql
-- Nothing reads or writes admin_id anymore: lib/actions/auth.ts writes
-- condo_community_admins instead (Task 2), and every RLS policy checks
-- condo_is_community_admin()/community_id instead of admin_id (Task 4).
alter table condo_communities drop column admin_id;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260914130000_drop_communities_admin_id.sql
git commit -m "chore(db): drop condo_communities.admin_id, superseded by condo_community_admins"
```

---

### Task 6: Auto-fill `community_id` on insert via BEFORE INSERT triggers

**Files:**
- Create: `supabase/migrations/20260914140000_community_id_autofill_triggers.sql`

**Interfaces:**
- Consumes: `condo_default_community_id()` (Task 3), `condo_community_admins` (Task 1), `community_id` columns from Task 3.
- Produces: trigger functions `condo_autofill_community_id_from_house()`, `condo_autofill_community_id_from_installment_template()`, `condo_autofill_community_id_from_expense_template()`, `condo_autofill_community_id_default()`, `condo_autofill_community_id_audit()`, and one `BEFORE INSERT` trigger per table wired to the matching function.

This is what keeps every existing Server Action working unchanged: none of them set `community_id` explicitly on `condo_house_residents`/`condo_installments`/`condo_payments`/`condo_house_credits`/`condo_payment_reports`/`condo_installment_price_history`/`condo_expenses`/`condo_exchange_rates`/`condo_audit_logs` today (confirmed by reading `lib/actions/houses.ts`, `lib/actions/cuotas.ts`, `lib/payments/creditSweep.ts`, `lib/payments/applyAllocation.ts`, `lib/actions/residentPayments.ts`, `lib/actions/gastos.ts`, `lib/actions/exchangeRate.ts`, `app/api/cron/*`, `lib/audit.ts`) — these triggers derive it from each row's own existing FK instead of requiring application code changes.

- [ ] **Step 1: Write the migration**

```sql
-- 1. Via house_id -- condo_house_residents, condo_installments,
-- condo_payments, condo_house_credits, condo_payment_reports all have a
-- not-null `house_id` column.
create or replace function condo_autofill_community_id_from_house()
returns trigger
language plpgsql
as $$
begin
  if new.community_id is null then
    select community_id into new.community_id from condo_houses where id = new.house_id;
  end if;
  return new;
end;
$$;

create trigger condo_house_residents_autofill_community
  before insert on condo_house_residents
  for each row execute function condo_autofill_community_id_from_house();

create trigger condo_installments_autofill_community
  before insert on condo_installments
  for each row execute function condo_autofill_community_id_from_house();

create trigger condo_payments_autofill_community
  before insert on condo_payments
  for each row execute function condo_autofill_community_id_from_house();

create trigger condo_house_credits_autofill_community
  before insert on condo_house_credits
  for each row execute function condo_autofill_community_id_from_house();

create trigger condo_payment_reports_autofill_community
  before insert on condo_payment_reports
  for each row execute function condo_autofill_community_id_from_house();

-- 2. Via template_id -> condo_installment_templates
create or replace function condo_autofill_community_id_from_installment_template()
returns trigger
language plpgsql
as $$
begin
  if new.community_id is null then
    select community_id into new.community_id from condo_installment_templates where id = new.template_id;
  end if;
  return new;
end;
$$;

create trigger condo_installment_price_history_autofill_community
  before insert on condo_installment_price_history
  for each row execute function condo_autofill_community_id_from_installment_template();

-- 3. Via template_id -> condo_expense_templates
create or replace function condo_autofill_community_id_from_expense_template()
returns trigger
language plpgsql
as $$
begin
  if new.community_id is null then
    select community_id into new.community_id from condo_expense_templates where id = new.template_id;
  end if;
  return new;
end;
$$;

create trigger condo_expenses_autofill_community
  before insert on condo_expenses
  for each row execute function condo_autofill_community_id_from_expense_template();

-- 4. No natural parent -- fall back to "the one community that exists
-- today" (condo_default_community_id(), defined in Task 3's migration).
create or replace function condo_autofill_community_id_default()
returns trigger
language plpgsql
as $$
begin
  if new.community_id is null then
    new.community_id := condo_default_community_id();
  end if;
  return new;
end;
$$;

create trigger condo_exchange_rates_autofill_community
  before insert on condo_exchange_rates
  for each row execute function condo_autofill_community_id_default();

create trigger condo_expense_categories_autofill_community
  before insert on condo_expense_categories
  for each row execute function condo_autofill_community_id_default();

-- 5. condo_audit_logs -- derive from the acting admin's own community via
-- condo_community_admins, else fall back to the default. SECURITY DEFINER
-- is required here (same reasoning as condo_is_community_admin, Task 1):
-- condo_community_admins has zero RLS policies, so a plain (non-definer)
-- trigger running as the `authenticated` caller would see zero rows and
-- always fall through to the default.
create or replace function condo_autofill_community_id_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.community_id is not null then
    return new;
  end if;
  if new.user_id is not null then
    select community_id into new.community_id
      from public.condo_community_admins
      where user_id = new.user_id
      limit 1;
  end if;
  if new.community_id is null then
    new.community_id := public.condo_default_community_id();
  end if;
  return new;
end;
$$;

create trigger condo_audit_logs_autofill_community
  before insert on condo_audit_logs
  for each row execute function condo_autofill_community_id_audit();
```

- [ ] **Step 2: Self-review the migration**

Read the file back and confirm: 5 trigger functions, 10 triggers total (5 via house, 1 via installment template, 1 via expense template, 2 via default, 1 via audit), every trigger is `before insert ... for each row`, and the audit function is the only one marked `security definer` (matching the reasoning documented in Task 1 for why `condo_is_community_admin` needed it).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260914140000_community_id_autofill_triggers.sql
git commit -m "feat(db): auto-derive community_id on insert so existing writes keep working"
```

---

### Task 7: Fix uniqueness constraints that assumed a single tenant

**Files:**
- Create: `supabase/migrations/20260914150000_per_community_uniqueness.sql`

**Interfaces:**
- Consumes: `community_id` on `condo_houses` (pre-existing), `condo_expense_categories` (Task 3).
- Produces: replaces `condo_houses_house_number_key` with `condo_houses_community_house_number_key` `unique (community_id, house_number)`; replaces `condo_expense_categories_name_key` with `condo_expense_categories_community_name_key` `unique (community_id, name)`.

- [ ] **Step 1: Confirm the constraint names**

Both constraints were created as plain inline `unique` column modifiers (`house_number varchar unique not null` in `supabase/migrations/20260906005943_initial_schema.sql:21`, `name varchar not null unique` in `supabase/migrations/20260909020000_gastos_schema.sql:10`), and neither was ever renamed by a later migration (confirmed: no `rename constraint` for either table in any migration file). Postgres's deterministic default name for a single-column inline `unique` constraint is `<table>_<column>_key`, so these are `condo_houses_house_number_key` and `condo_expense_categories_name_key`.

- [ ] **Step 2: Write the migration**

```sql
-- Both of these were globally unique, which breaks the moment a second
-- community exists and wants to reuse a house number or a category name
-- the first community already has. Scope both to per-community instead.
--
-- KNOWN, ACCEPTED GAP (design doc decision #5): condo_verify_house_pin
-- still looks up by house_number ALONE, with no community disambiguation.
-- This constraint change makes it POSSIBLE for two communities to each
-- have a "House 12" -- but resident login itself will not know which one
-- a given login attempt means until the tenant-routing UI (explicitly out
-- of scope for this phase) exists. Do not onboard a second community with
-- an overlapping house_number until that UI ships.
alter table condo_houses drop constraint condo_houses_house_number_key;
alter table condo_houses add constraint condo_houses_community_house_number_key unique (community_id, house_number);

alter table condo_expense_categories drop constraint condo_expense_categories_name_key;
alter table condo_expense_categories add constraint condo_expense_categories_community_name_key unique (community_id, name);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260914150000_per_community_uniqueness.sql
git commit -m "fix(db): scope house_number and expense category name uniqueness per community"
```

---

### Task 8: Carry `community_id` through resident login

**Files:**
- Create: `supabase/migrations/20260914160000_resident_pin_verify_returns_community.sql`
- Modify: `lib/auth/residentToken.ts`
- Modify: `lib/auth/residentSession.ts`
- Modify: `lib/actions/residentAuth.ts:11-17,57`

**Interfaces:**
- Produces: `condo_verify_house_pin` RPC now also returns `community_id` on success; `ResidentSessionPayload` gains `community_id: string`; `signResidentToken(houseId: string, communityId: string)`; `createResidentSession(houseId: string, communityId: string)`.
- Consumes: `condo_houses.community_id` (pre-existing).
- No other file changes: every existing consumer of `getResidentSession()`/`ResidentSessionPayload` (checked: `proxy.ts`, `lib/actions/residentPayments.ts`, `lib/actions/residentPaymentOcr.ts`, `app/[locale]/(resident)/**`) only reads `house_id`/`role`, so adding a field is non-breaking and none of those files need edits.

- [ ] **Step 1: Update `condo_verify_house_pin` to also return `community_id`**

```sql
-- condo_verify_house_pin now also returns the house's community_id on
-- success, so the resident's signed session cookie can carry it (Step 2-4
-- below). Logic is otherwise byte-for-byte identical to the Phase 3
-- version in 20260906120000_phase3_house_pin_and_rls.sql.
create or replace function condo_verify_house_pin(p_house_number varchar, p_pin varchar)
returns jsonb
language plpgsql
as $$
declare
  h condo_houses%rowtype;
  max_attempts constant int := 5;
  lockout_minutes constant int := 15;
  new_attempts int;
  lock_until timestamptz;
begin
  select * into h from condo_houses where house_number = p_house_number;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if h.pin_hash is null then
    return jsonb_build_object('success', false, 'reason', 'no_pin');
  end if;

  if h.pin_locked_until is not null and h.pin_locked_until > now() then
    return jsonb_build_object('success', false, 'reason', 'locked', 'locked_until', h.pin_locked_until);
  end if;

  if extensions.crypt(p_pin, h.pin_hash) = h.pin_hash then
    update condo_houses
      set failed_pin_attempts = 0, pin_locked_until = null
      where id = h.id;
    return jsonb_build_object('success', true, 'house_id', h.id, 'community_id', h.community_id);
  end if;

  new_attempts := coalesce(h.failed_pin_attempts, 0) + 1;
  lock_until := case when new_attempts >= max_attempts
    then now() + (lockout_minutes || ' minutes')::interval
    else null
  end;

  update condo_houses
    set failed_pin_attempts = new_attempts, pin_locked_until = lock_until
    where id = h.id;

  return jsonb_build_object(
    'success', false,
    'reason', case when lock_until is not null then 'locked' else 'invalid' end,
    'locked_until', lock_until,
    'attempts_remaining', greatest(max_attempts - new_attempts, 0)
  );
end;
$$;
```

- [ ] **Step 2: Update `lib/auth/residentToken.ts`**

```ts
export type ResidentSessionPayload = {
  house_id: string;
  community_id: string;
  role: 'resident';
};

function getSecret() {
  const secret = process.env.RESIDENT_SESSION_SECRET;
  if (!secret) throw new Error('RESIDENT_SESSION_SECRET is not set.');
  return new TextEncoder().encode(secret);
}

export async function signResidentToken(houseId: string, communityId: string): Promise<string> {
  return new SignJWT({ house_id: houseId, community_id: communityId, role: 'resident' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${RESIDENT_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyResidentToken(
  token: string,
): Promise<ResidentSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (
      payload.role !== 'resident' ||
      typeof payload.house_id !== 'string' ||
      typeof payload.community_id !== 'string'
    ) {
      return null;
    }
    return { house_id: payload.house_id, community_id: payload.community_id, role: 'resident' };
  } catch {
    return null;
  }
}
```

(Only the type, `signResidentToken`, and `verifyResidentToken` change — `RESIDENT_SESSION_COOKIE_NAME` and `RESIDENT_SESSION_MAX_AGE_SECONDS` stay as they are.)

- [ ] **Step 3: Update `lib/auth/residentSession.ts`**

```ts
export async function createResidentSession(houseId: string, communityId: string): Promise<void> {
  const token = await signResidentToken(houseId, communityId);
  const cookieStore = await cookies();
  cookieStore.set(RESIDENT_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RESIDENT_SESSION_MAX_AGE_SECONDS,
  });
}
```

(`getResidentSession` and `clearResidentSession` are unchanged.)

- [ ] **Step 4: Update `lib/actions/residentAuth.ts`**

```ts
type VerifyPinResult = {
  success: boolean;
  reason?: 'not_found' | 'no_pin' | 'locked' | 'invalid';
  house_id?: string;
  community_id?: string;
  locked_until?: string;
  attempts_remaining?: number;
};
```

And change the success branch (currently `await createResidentSession(result.house_id!); redirect('/mi-hogar');`) to:

```ts
  await createResidentSession(result.house_id!, result.community_id!);
  redirect('/mi-hogar');
```

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: PASS. If it fails, it means some other file destructures `ResidentSessionPayload` in a way that breaks with the new required field — re-check the consumer list in this task's Interfaces section (`grep -rn "ResidentSessionPayload\|getResidentSession" lib app proxy.ts`) and confirm none were missed.

- [ ] **Step 6: Run lint**

Run: `npx eslint .`
Expected: no new warnings/errors.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260914160000_resident_pin_verify_returns_community.sql lib/auth/residentToken.ts lib/auth/residentSession.ts lib/actions/residentAuth.ts
git commit -m "feat(resident-auth): carry community_id in the resident session cookie"
```

---

### Task 9: Update `PLAN.md` and do a final consistency pass

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Full repo consistency check**

```bash
npm run build
npx eslint .
grep -rn "admin_id" lib app supabase/migrations --include="*.ts" --include="*.tsx" --include="*.sql" | grep -v "2026091[34]"
ls supabase/migrations/202609141*.sql
```

Expected: build passes, lint clean, the `admin_id` grep returns nothing outside historical (pre-Task-5) migration files, and exactly 7 new migration files are listed (Tasks 1, 3, 4, 5, 6, 7, 8).

- [ ] **Step 2: Update `PLAN.md`**

Add a new dated entry (after the existing Phase 8 status, following this document's own "Action needed" convention used throughout every prior phase) that:
- Lists all 7 new migration files, in order, as needing to be pushed to the live project via the Supabase Dashboard SQL Editor (same "Action needed" phrasing every phase before this one uses).
- States plainly that only one community exists in production today (ASOBARCELONA) and this change is invisible in the running app until a second one is created.
- Documents the accepted gap from Task 7: resident login (`condo_verify_house_pin`) still resolves by `house_number` alone with no community disambiguation — a second community must not reuse an existing house number until the tenant-routing UI (out of scope here) exists to disambiguate.
- Notes that new communities' admins are created directly in the database (`auth.users` row + a `condo_community_admins` row) — there is still no self-service admin invite flow.
- Cross-references `docs/superpowers/specs/2026-09-14-multitenancy-foundation-design.md` for full rationale.

- [ ] **Step 3: Commit**

```bash
git add PLAN.md
git commit -m "docs: record multi-tenancy foundation migration status in PLAN.md"
```

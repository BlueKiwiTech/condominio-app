-- Phase 5 (Payments): schema additions for partial-payment tracking, saldo a
-- favor (credit), sequential receipt numbering, and the first admin RLS
-- policies for condo_payments (had RLS enabled with ZERO policies since
-- Phase 1's deny-by-default migration -- same gap AUTH-07 flagged for
-- condo_installments before Phase 4 closed it).

-- 1. Partial-payment tracking on condo_installments.
--    amount_paid is a running total, updated by the payment-registration
--    Server Action (lib/actions/payments.ts) -- NOT computed live from a
--    SUM(condo_payments) join, so pending-cuota list queries stay a single
--    table scan. condo_payments remains the authoritative ledger; this is a
--    denormalized cache of it, same trade-off already accepted for
--    condo_installments.name (denormalized from the template).
alter table condo_installments
  add column amount_paid decimal(12,2) not null default 0;

-- PLAN.md PMNT-06 requires a 'partial' status ("pending/partial/paid") that
-- the original Phase 1 schema didn't anticipate (it only reserved 'advance'
-- for a future "paid before due date" resident-calendar concept, per
-- ARCHITECTURE.md -- unrelated to partial payment amounts). Extend, don't
-- replace, the existing check constraint.
alter table condo_installments drop constraint if exists condo_installments_status_check;
alter table condo_installments
  add constraint condo_installments_status_check
  check (status in ('pending', 'partial', 'paid', 'advance'));

-- 2. condo_payments gains a "reference" field (A5 mockup's optional
-- "Referencia" — e.g. a bank transfer confirmation number) and a sequential,
-- community-wide receipt number (PLAN.md Phase 5 decision: "sequential
-- receipt number, community-wide"). One value is assigned per payment BATCH
-- (all condo_payments rows sharing a payment_batch_id get the same receipt
-- number) — nullable at the column level since it's assigned in application
-- code, not a column default, but guarded against accidental duplicates by
-- the partial unique index below.
alter table condo_payments
  add column reference varchar,
  add column receipt_number integer;

create unique index condo_payments_receipt_number_uidx
  on condo_payments (receipt_number)
  where receipt_number is not null;

create sequence if not exists condo_payments_receipt_seq start 1;

-- condo_next_receipt_number: called once per payment batch (registerPayment,
-- and the credit-auto-apply sweep in lib/actions/cuotas.ts) to reserve the
-- next community-wide sequential number, shared across every row in that
-- batch. Pure sequence bump, touches no tables -- safe to expose to
-- `authenticated` (same pattern as condo_hash_pin in Phase 3's migration).
create or replace function condo_next_receipt_number()
returns integer
language sql
as $$
  select nextval('condo_payments_receipt_seq')::integer;
$$;

revoke execute on function condo_next_receipt_number() from public;
grant execute on function condo_next_receipt_number() to authenticated;

-- 3. Saldo a favor (credit) per house, per currency -- PLAN.md Phase 5
-- decision: "the excess becomes saldo a favor (credit) on the house,
-- auto-applied to the next cuota that becomes due". Balance is always
-- scoped to one currency (RPRT-03's never-sum-across-currencies rule
-- applies here too, not just reporting).
create table condo_house_credits (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references condo_houses(id) on delete cascade,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  balance decimal(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (house_id, currency)
);
create index condo_house_credits_house_idx on condo_house_credits (house_id);
alter table condo_house_credits enable row level security;

-- 4. Admin RLS policies -- same single-community/single-admin scoping
-- pattern as Phase 3 (condo_houses) and Phase 4 (condo_installments). No
-- resident policy: residents can't reach payment data until Phase 7, and
-- when they do it will go through the service-role client per Pattern A,
-- not RLS.
create policy condo_payments_admin_all on condo_payments
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

create policy condo_house_credits_admin_all on condo_house_credits
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

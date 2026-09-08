-- Resident self-service "I made a payment" reports (Phase 7 follow-up,
-- user-requested). Deliberately NOT the same as an admin-confirmed
-- condo_payments row -- a resident claiming to have paid is not proof of
-- payment, so submitting one of these never touches condo_installments,
-- condo_payments, or condo_house_credits by itself. It's a pending claim
-- (amount/currency/date/reference/notes + which pending cuotas it's meant
-- to cover) for the admin to verify against their bank statement and then
-- register for real via the existing "Registrar pago" flow.
--
-- No admin UI reads this table yet -- out of scope for this change
-- (admin-side work was explicitly not touched here). Rows just accumulate
-- until that's built; `status` already exists so that follow-up doesn't
-- need its own schema migration.
create table condo_payment_reports (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references condo_houses(id) on delete cascade,
  amount decimal(12,2) not null,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  payment_date date not null,
  reference varchar,
  notes text,
  installment_ids uuid[] not null default '{}',
  status varchar not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

alter table condo_payment_reports enable row level security;

-- Same single-community/single-admin scoping pattern as every other
-- condo_* admin policy. Residents never touch this via RLS -- Pattern A
-- means every resident write goes through the service-role client
-- (lib/actions/residentPayments.ts), scoped by house_id in application
-- code, same as every other resident read/write.
create policy condo_payment_reports_admin_all on condo_payment_reports
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

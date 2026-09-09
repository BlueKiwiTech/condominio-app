-- Gastos (condo expenses): fixed (indefinite, cadence-driven) and variable
-- (finite installment count) expense tracking, admin-only -- see
-- docs/superpowers/specs/2026-09-08-gastos-design.md for full rationale.
-- Same template/instance split already used for cuotas
-- (condo_installment_templates/condo_installments), but community-wide
-- (no house_id) since a gasto isn't owed by a specific house.

create table condo_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name varchar not null unique
);

insert into condo_expense_categories (name) values
  ('Nómina'), ('Servicios'), ('Mantenimiento'), ('Seguridad'), ('Otros');

create table condo_expense_templates (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references condo_communities(id),
  name varchar not null,
  category_id uuid not null references condo_expense_categories(id),
  provider varchar,
  kind varchar not null check (kind in ('fixed', 'variable')),
  cadence varchar check (cadence in ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual')),  -- null for variable
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  -- fixed: per-period seed amount, copied as-is into each new instance.
  -- variable: TOTAL amount, split across installment_count instances
  -- (lib/cuotas/generate.ts's splitAmount, reused by lib/gastos/generate.ts).
  default_amount decimal(12,2) not null,
  start_date date not null,
  installment_count int check (installment_count is null or installment_count > 0),  -- null for fixed (indefinite)
  active boolean not null default true,  -- false stops future generation without deleting history
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per period/installment -- what gets listed, edited, and marked
-- paid. category_id/provider/currency are denormalized copies from the
-- template at generation time so a later category rename doesn't rewrite
-- history (same reasoning as condo_installments.name).
create table condo_expenses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references condo_expense_templates(id),
  category_id uuid not null references condo_expense_categories(id),
  provider varchar,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  amount decimal(12,2) not null,
  installment_number int,  -- set only for kind='variable' instances
  period_date date not null,
  status varchar not null default 'pending' check (status in ('pending', 'paid')),
  paid_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Idempotency guard: the cron (fixed) and the transactional variable
  -- generation (lib/actions/gastos.ts) both rely on this to be safe against
  -- a retry/double-run never creating a duplicate instance.
  unique (template_id, period_date)
);
create index condo_expenses_status_period_idx on condo_expenses (status, period_date);
create index condo_expenses_template_idx on condo_expenses (template_id);

-- Admin-only, deny-by-default backstop. RLS enabled + policy in the same
-- migration -- unlike Phase 1's initial schema, admin auth already exists
-- by this point in the project, so there's no need to split "enable RLS"
-- and "add policy" across two migrations the way Phase 1 -> Phase 2/3 did.
-- Residents never read these tables -- pure admin feature (design doc).
alter table condo_expense_categories enable row level security;
alter table condo_expense_templates enable row level security;
alter table condo_expenses enable row level security;

create policy condo_expense_categories_admin_all on condo_expense_categories
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

create policy condo_expense_templates_admin_all on condo_expense_templates
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

create policy condo_expenses_admin_all on condo_expenses
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

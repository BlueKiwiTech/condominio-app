-- pgcrypto: not needed for gen_random_uuid() (native since PG13), but Phase 3's
-- PIN hashing (crypt()/gen_salt('bf')) will need it -- enabling now is a zero-cost,
-- forward-looking addition since this migration already owns "the schema" (Claude's
-- discretion per 01-CONTEXT.md, RESEARCH.md Open Question 3 recommendation).
create extension if not exists pgcrypto;

-- communities: admin_id intentionally nullable (D-03) -- no NOT NULL, no seed insert (D-02)
create table communities (
  id uuid primary key default gen_random_uuid(),
  name varchar not null,
  address varchar,
  phone varchar,
  admin_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table houses (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id),
  house_number varchar unique not null,
  house_name varchar,
  owner_name varchar,
  owner_phone varchar,
  owner_email varchar,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table house_residents (
  id uuid primary key default gen_random_uuid(),
  house_id uuid references houses(id) on delete cascade,
  resident_name varchar not null,
  resident_phone varchar,
  pin_hash varchar,  -- set in Phase 3; nullable now
  created_at timestamptz not null default now()
);

-- ARCHITECTURE.md amendment #1: template (admin input) vs. instance (payable row) split
create table cuota_templates (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references communities(id),
  name varchar not null,
  description text,
  cuota_type varchar not null check (cuota_type in ('recurring', 'special')),
  cadence varchar check (cadence in ('weekly', 'monthly', 'annual')),  -- null for special
  amount decimal(12,2) not null,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  start_date date not null,
  number_of_installments int not null default 1,
  is_divided boolean not null default false,
  applicable_houses uuid[] not null default '{}',  -- targeting input only; empty = all houses
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ARCHITECTURE.md amendment #1 + #3: payable instance rows, one per house per installment,
-- status only ever written by payment-registration logic ('pending' at creation,
-- 'paid'/'advance' by a transaction) -- 'overdue' is NEVER stored, always computed at
-- query time (due_date < today AND status != 'paid'), per ARCHITECTURE.md Anti-Pattern 2.
create table cuotas (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references cuota_templates(id),
  house_id uuid not null references houses(id),
  parent_cuota_id uuid references cuotas(id),  -- links instance rows for divided special cuotas
  installment_number int not null default 1,
  name varchar not null,  -- denormalized from template for display resilience
  amount decimal(12,2) not null,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  due_date date not null,
  status varchar not null default 'pending' check (status in ('pending', 'paid', 'advance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Pitfall 3 (PITFALLS.md): DB-level idempotency guard against duplicate generation
  unique (template_id, house_id, installment_number)
);
create index cuotas_house_status_idx on cuotas (house_id, status);
create index cuotas_due_date_status_idx on cuotas (due_date, status);

-- ARCHITECTURE.md amendment #2: one payments row per paid cuota, grouped by an
-- optional client-generated batch id so the UI can still show "one register-payment action"
create table payments (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id),
  cuota_id uuid not null references cuotas(id),
  payment_batch_id uuid,
  amount_paid decimal(12,2) not null,
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  payment_date date not null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index payments_house_idx on payments (house_id);
create index payments_cuota_idx on payments (cuota_id);
create index payments_batch_idx on payments (payment_batch_id);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action varchar,
  entity_type varchar,
  entity_id uuid,
  created_at timestamptz not null default now()
);

-- DPLY-02: RLS enabled, ZERO policies, on every table -- this IS deny-by-default.
-- Do not write policies in this migration; Phase 2 (admin) and Phase 3 (resident)
-- add role-scoped policies once auth.uid()-backed sessions exist. service_role /
-- the new secret key always bypasses RLS regardless of policy count.
alter table communities enable row level security;
alter table houses enable row level security;
alter table house_residents enable row level security;
alter table cuota_templates enable row level security;
alter table cuotas enable row level security;
alter table payments enable row level security;
alter table audit_logs enable row level security;

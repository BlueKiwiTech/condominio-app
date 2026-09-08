-- USD/Bs exchange rate reference (user-requested, 2026-09-08). Purely
-- informational -- it does NOT auto-convert anything (payments stay
-- free-currency, PLAN.md's "cada quien saca la cuenta" decision); it just
-- gives the admin a reference number.
--
-- Two independent rates, not one: `bcv` (the official Banco Central de
-- Venezuela rate, bcv.org.ve) and `binance` (the informal USDT/VES P2P
-- rate most residents actually reference day to day). Sourced from
-- cotizave.com's aggregator API (chosen over scraping Binance's own
-- undocumented P2P endpoint directly, which is known to be unstable/
-- unofficial) -- see app/api/cron/exchange-rate/route.ts.
--
-- Append-only history rather than a single mutable row per type: every
-- refresh (scheduled or manual) inserts a new row, "current" is just the
-- latest row for that rate_type by updated_at. Cheap, and keeps a real
-- audit trail of what the rate was and when/how it was set, for free.
create table condo_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  rate_type varchar not null check (rate_type in ('bcv', 'binance')),
  rate decimal(14,4) not null check (rate > 0),
  source varchar not null check (source in ('cron', 'admin')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create index condo_exchange_rates_type_updated_idx on condo_exchange_rates (rate_type, updated_at desc);

alter table condo_exchange_rates enable row level security;

-- Same single-community/single-admin scoping pattern as every other
-- condo_* admin policy. The cron route (app/api/cron/exchange-rate)
-- inserts via the service-role client, bypassing RLS entirely -- it has no
-- admin session to satisfy this policy with.
create policy condo_exchange_rates_admin_all on condo_exchange_rates
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

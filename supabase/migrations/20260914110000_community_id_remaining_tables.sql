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

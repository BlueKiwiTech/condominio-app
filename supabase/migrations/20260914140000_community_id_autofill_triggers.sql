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

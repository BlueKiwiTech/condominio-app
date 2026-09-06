-- Follow-up fixes from 01-REVIEW.md (code review of Phase 1) -- fixing forward
-- rather than editing the already-applied initial_schema.sql migration.

-- WR-02: pgcrypto was created without an explicit schema in the initial
-- migration and landed in public. supabase/config.toml's
-- extra_search_path = ["public", "extensions"] confirms `extensions` is the
-- intended home for this pattern.
create schema if not exists extensions;
alter extension pgcrypto set schema extensions;

-- WR-03: unique (template_id, house_id, installment_number) does not catch
-- duplicates among rows where template_id is NULL, since Postgres treats
-- NULL as distinct from every other NULL in a unique constraint. This
-- partial index closes that gap for special (non-template) installments
-- without changing the nullable template_id design (ARCHITECTURE.md).
create unique index condo_installments_no_template_uidx
  on condo_installments (house_id, installment_number)
  where template_id is null;

-- WR-04: nothing enforced that a payment's currency matches its
-- installment's currency. CLAUDE.md/PROJECT.md treat per-currency
-- correctness (never summing USD/Bs/USDT) as the thing that must not break;
-- this closes the gap at the database level so a future application bug
-- can't silently corrupt saldo/morosos reporting.
create or replace function condo_payments_currency_guard() returns trigger as $$
begin
  if new.currency <> (select currency from condo_installments where id = new.installment_id) then
    raise exception 'payment currency % does not match installment currency for installment %',
      new.currency, new.installment_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger condo_payments_currency_guard_trg
before insert or update on condo_payments
for each row execute function condo_payments_currency_guard();

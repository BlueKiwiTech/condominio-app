-- Payment currency and rate used when paying an expense (change
-- gastos-pago-multimoneda).
--
-- Marking an expense as paid now records in which currency it was paid and,
-- when either the expense or the payment is in Bs, the rate that converted it
-- (one payment per expense, no partials):
--   exchange_rate        Bs per unit of the chosen rate (always > 0)
--   exchange_rate_type   'bcv' | 'eur' | 'custom' (admin-typed)
--   paid_currency        'USD' | 'Bs' -- only when it differs from the
--                        expense's own currency
--   paid_amount          what was actually paid, in paid_currency (> 0)
--   reference_amount     only for a Bs expense paid in Bs: amount /
--                        exchange_rate, rounded to 2 decimals
--   reference_currency   currency of that equivalent: USD for bcv/custom,
--                        EUR for eur
-- When the payment currency differs from the expense's, `amount` keeps what
-- was owed and paid_* holds what was paid; when they match, `amount` is
-- overwritten as before. `amount` is never converted, so the per-currency
-- totals keep working untouched.
--
-- All six are NULL for same-currency USD/USDT expenses and for expenses paid
-- before this migration (the rate they were paid with was never recorded, so
-- there is nothing to backfill). The pair/dependency checks keep them
-- consistent.
--
-- Re-runnable: columns use `if not exists`, constraints are dropped and
-- recreated. The first version of this file was never applied to production;
-- a LOCAL database that did apply it and stored test rows with the Binance
-- rate type (or a USDT equivalent) fails the narrower checks below -- reset
-- it with `supabase db reset` rather than rewriting data. No RLS or index
-- changes (condo_expenses stays admin-only).
alter table condo_expenses
  add column if not exists exchange_rate decimal(14,4),
  add column if not exists exchange_rate_type varchar,
  add column if not exists reference_amount decimal(12,2),
  add column if not exists reference_currency varchar,
  add column if not exists paid_currency varchar,
  add column if not exists paid_amount decimal(12,2);

-- Replaced by the pair checks below (first version of this migration).
alter table condo_expenses drop constraint if exists condo_expenses_payment_rate_all_or_none_check;

alter table condo_expenses drop constraint if exists condo_expenses_exchange_rate_type_check;
alter table condo_expenses
  add constraint condo_expenses_exchange_rate_type_check
  check (exchange_rate_type is null or exchange_rate_type in ('bcv', 'eur', 'custom'));

alter table condo_expenses drop constraint if exists condo_expenses_reference_currency_check;
alter table condo_expenses
  add constraint condo_expenses_reference_currency_check
  check (reference_currency is null or reference_currency in ('USD', 'EUR'));

alter table condo_expenses drop constraint if exists condo_expenses_paid_currency_check;
alter table condo_expenses
  add constraint condo_expenses_paid_currency_check
  check (paid_currency is null or paid_currency in ('USD', 'Bs'));

alter table condo_expenses drop constraint if exists condo_expenses_exchange_rate_positive_check;
alter table condo_expenses
  add constraint condo_expenses_exchange_rate_positive_check
  check (exchange_rate is null or exchange_rate > 0);

alter table condo_expenses drop constraint if exists condo_expenses_paid_amount_positive_check;
alter table condo_expenses
  add constraint condo_expenses_paid_amount_positive_check
  check (paid_amount is null or paid_amount > 0);

-- Pairs travel together...
alter table condo_expenses drop constraint if exists condo_expenses_rate_pair_check;
alter table condo_expenses
  add constraint condo_expenses_rate_pair_check
  check ((exchange_rate is null) = (exchange_rate_type is null));

alter table condo_expenses drop constraint if exists condo_expenses_reference_pair_check;
alter table condo_expenses
  add constraint condo_expenses_reference_pair_check
  check ((reference_amount is null) = (reference_currency is null));

alter table condo_expenses drop constraint if exists condo_expenses_paid_pair_check;
alter table condo_expenses
  add constraint condo_expenses_paid_pair_check
  check ((paid_currency is null) = (paid_amount is null));

-- ...and what was paid / the equivalent only exist together with a rate.
alter table condo_expenses drop constraint if exists condo_expenses_rate_dependency_check;
alter table condo_expenses
  add constraint condo_expenses_rate_dependency_check
  check (exchange_rate is not null or (reference_amount is null and paid_amount is null));

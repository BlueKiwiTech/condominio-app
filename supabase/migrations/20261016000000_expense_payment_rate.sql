-- Rate used when paying an expense in Bs (change gastos-pago-multimoneda).
--
-- Marking an expense as paid now records which rate valued the payment and
-- the resulting equivalent, per row (one payment per expense, no partials):
--   exchange_rate        Bs per unit of the chosen rate (always > 0)
--   exchange_rate_type   'bcv' | 'eur' | 'binance' | 'custom' (admin-typed)
--   reference_amount     amount / exchange_rate, rounded to 2 decimals
--   reference_currency   currency of that equivalent: USD for bcv/custom,
--                        EUR for eur, USDT for binance
-- `amount` stays in the expense's own currency and is never converted, so
-- the per-currency totals keep working untouched.
--
-- All four are NULL for expenses in USD/USDT and for expenses paid before
-- this migration (the rate they were paid with was never recorded, so there
-- is nothing to backfill). The "all or none" check keeps them consistent.
--
-- Re-runnable: columns use `if not exists`, constraints are dropped and
-- recreated. No RLS or index changes (condo_expenses stays admin-only).
alter table condo_expenses
  add column if not exists exchange_rate decimal(14,4),
  add column if not exists exchange_rate_type varchar,
  add column if not exists reference_amount decimal(12,2),
  add column if not exists reference_currency varchar;

alter table condo_expenses drop constraint if exists condo_expenses_exchange_rate_type_check;
alter table condo_expenses
  add constraint condo_expenses_exchange_rate_type_check
  check (exchange_rate_type is null or exchange_rate_type in ('bcv', 'eur', 'binance', 'custom'));

alter table condo_expenses drop constraint if exists condo_expenses_reference_currency_check;
alter table condo_expenses
  add constraint condo_expenses_reference_currency_check
  check (reference_currency is null or reference_currency in ('USD', 'EUR', 'USDT'));

alter table condo_expenses drop constraint if exists condo_expenses_exchange_rate_positive_check;
alter table condo_expenses
  add constraint condo_expenses_exchange_rate_positive_check
  check (exchange_rate is null or exchange_rate > 0);

alter table condo_expenses drop constraint if exists condo_expenses_payment_rate_all_or_none_check;
alter table condo_expenses
  add constraint condo_expenses_payment_rate_all_or_none_check
  check (
    (exchange_rate is null and exchange_rate_type is null and reference_amount is null and reference_currency is null)
    or (exchange_rate is not null and exchange_rate_type is not null and reference_amount is not null and reference_currency is not null)
  );

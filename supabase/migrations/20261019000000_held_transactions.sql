-- "En espera de tasa" (change pagos-en-espera-por-tasa).
--
-- A payment or expense that needs a BCV rate the system doesn't have yet (for
-- its own date) is no longer rejected: it is stored with status 'on_hold' and
-- released automatically once the rate arrives (after the rates cron or a
-- manual rate). No new table: the rows that already hold everything needed to
-- repeat the operation just get one more status.
--
--   condo_payment_reports.status   + 'on_hold'
--   condo_payment_reports.created_by         admin who registered the payment;
--                                            NULL when a resident created the
--                                            report. Decides what releasing
--                                            does (admin payment: applied
--                                            automatically; resident report:
--                                            goes back to 'pending').
--   *.release_claimed_at           lease taken by whoever is releasing the row
--                                  right now (expires after 10 minutes), so
--                                  the cron and a manual rate can't release
--                                  the same row twice.
--   condo_expenses.status          + 'on_hold'
--
-- An expense on hold stores what the admin typed (payment currency and amount
-- paid, or the final amount) and the chosen rate TYPE, but not the rate yet:
-- exchange_rate (and, for Bs paid in Bs, the equivalent) are filled in when it
-- is released. So the two expense checks that tie the rate columns together
-- (from 20261016000000_expense_payment_rate.sql) are relaxed for 'on_hold'
-- only and stay as strict as before for 'pending' and 'paid'.
--
-- Re-runnable: columns use `if not exists`, constraints are dropped and
-- recreated. No backfill, no RLS or index changes.
alter table condo_payment_reports
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists release_claimed_at timestamptz;

alter table condo_expenses
  add column if not exists release_claimed_at timestamptz;

alter table condo_payment_reports drop constraint if exists condo_payment_reports_status_check;
alter table condo_payment_reports
  add constraint condo_payment_reports_status_check
  check (status in ('pending', 'on_hold', 'confirmed', 'rejected'));

alter table condo_expenses drop constraint if exists condo_expenses_status_check;
alter table condo_expenses
  add constraint condo_expenses_status_check
  check (status in ('pending', 'on_hold', 'paid'));

-- exchange_rate / exchange_rate_type travel together, except while on hold
-- (the type is chosen, the rate isn't known yet).
alter table condo_expenses drop constraint if exists condo_expenses_rate_pair_check;
alter table condo_expenses
  add constraint condo_expenses_rate_pair_check
  check ((exchange_rate is null) = (exchange_rate_type is null) or status = 'on_hold');

-- What was paid / the equivalent only exist together with a rate, except while
-- on hold (the admin already typed what was paid).
alter table condo_expenses drop constraint if exists condo_expenses_rate_dependency_check;
alter table condo_expenses
  add constraint condo_expenses_rate_dependency_check
  check (exchange_rate is not null or (reference_amount is null and paid_amount is null) or status = 'on_hold');

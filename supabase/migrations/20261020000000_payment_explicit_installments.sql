-- Abono a cuotas especiales elegidas (change abono-a-cuotas-especiales).
--
-- When the admin picks special cuotas on the payment form, the payment applies
-- ONLY to them and skips the 30-day conversion window. If that payment has to
-- wait for a rate (status 'on_hold') and is applied later on release, the
-- release must know the cuotas were chosen explicitly, so it doesn't re-apply
-- the window. This flag records that on the report.
--
-- Re-runnable (`if not exists`); no backfill (existing rows keep false, i.e. the
-- old behaviour), no RLS or index changes.
alter table condo_payment_reports
  add column if not exists explicit_installments boolean not null default false;

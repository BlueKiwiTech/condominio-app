-- Audit trail for the provider's own dates + euro rate (change tasa-bcv-calendario).
--
-- `effective_date` is the validity date the source (cotizave.com) publishes
-- for the BCV/EUR reference rates; `source_updated_at` is the source's own
-- timestamp. Both are audit data only: freshness and "rate as of a date"
-- keep using `updated_at` (insertion time, 24h rule), so neither column
-- takes part in any conversion. NULL when the source gives no date
-- (binance, admin manual rates, rows from before this migration) --
-- never invented from the insertion time.
--
-- Also admits the `eur` rate type (BCV euro), stored for a later change.
--
-- Re-runnable: columns use `if not exists`, the check is dropped/recreated.
-- No backfill, no index or RLS changes.
alter table condo_exchange_rates
  add column if not exists effective_date date,
  add column if not exists source_updated_at timestamptz;

alter table condo_exchange_rates drop constraint if exists condo_exchange_rates_rate_type_check;
alter table condo_exchange_rates
  add constraint condo_exchange_rates_rate_type_check check (rate_type in ('bcv', 'eur', 'binance'));

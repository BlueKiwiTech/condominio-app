-- One-time data cleanup before delivering the system to ASOBARCELONA.
-- NOT a migration -- run manually once (Supabase SQL editor or psql), then
-- discard. Putting this under supabase/migrations/ would re-run it on every
-- future `supabase db reset` and wipe production data again.
--
-- Wipes every cuota, gasto, abono (payment) and their derived records
-- (price history, wallet/saldo-a-favor balances, resident payment reports,
-- audit logs). Keeps configuration: comunidades, casas, residentes/PINs,
-- admins, categorías de gasto, and the BCV/Binance exchange-rate reference
-- table -- none of those are "cuotas y gastos" data.
--
-- Verified against every migration under supabase/migrations/ (2026-09-26):
-- these are the only tables with cuota/gasto/payment data, and no table
-- outside this list holds a foreign key into any of them, so a single
-- TRUNCATE (no CASCADE) is enough -- if that's ever no longer true, this
-- statement fails loudly instead of silently truncating something extra.
begin;

truncate table
  condo_payments,                    -- abonos
  condo_payment_reports,             -- resident "I paid" self-reports
  condo_house_credits,               -- saldo a favor / wallet balances
  condo_installment_price_history,   -- price-change audit trail on cuota templates
  condo_installments,                -- cuota instances (payable rows)
  condo_installment_templates,       -- cuota templates
  condo_expenses,                    -- gasto instances
  condo_expense_templates,           -- gasto templates
  condo_audit_logs;                  -- action log (references the deleted entities above)

-- Receipt numbers are sequential and community-wide (condo_payments.receipt_number).
-- With every payment gone, restart at 1 so the first receipt issued after
-- delivery isn't a jarring #438. Comment out if you'd rather keep counting up.
alter sequence condo_payments_receipt_seq restart with 1;

commit;

-- NOT included -- do this separately only if you also want to purge the
-- actual screenshot files residents attached to payment reports (contains
-- bank account/ID numbers -- irreversible once deleted):
--
--   delete from storage.objects where bucket_id = 'payment-report-screenshots';

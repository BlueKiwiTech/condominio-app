-- Links a confirmed condo_payment_reports row back to the real condo_payments
-- batch it produced. Confirming a report used to be JUST a status flag (see
-- 20260908090000_resident_payment_reports.sql's header comment) -- the admin
-- had to separately re-enter the same data via "Registrar pago", and if they
-- forgot, the cuota/saldo never actually updated even though the report was
-- marked confirmed. lib/actions/paymentReports.ts's confirmPaymentReport now
-- runs the same allocation "Registrar pago" does (lib/payments/
-- applyAllocation.ts), using the report's own stored amount/currency/
-- payment_date/reference/notes/installment_ids, and stamps the resulting
-- batch/receipt back here so the UI (admin queue + resident /mis-pagos) can
-- show the real receipt instead of a dead-end "Confirmado" tag.
--
-- No FK on resulting_payment_batch_id -- condo_payments.payment_batch_id
-- itself is already just a plain, unconstrained grouping convention (see
-- initial_schema.sql), not a referenceable key.
alter table condo_payment_reports
  add column resulting_payment_batch_id uuid,
  add column resulting_receipt_number integer;

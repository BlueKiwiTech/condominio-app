-- User decision (2026-09-08): a cuota's amount is denominated in one
-- currency, but a payment against it can be received in ANY currency --
-- efectivo, transferencia en Bs, USDT vía Binance, whatever the resident
-- actually paid with. There's no FX-conversion feature in this app (out of
-- scope, PLAN.md), so reconciling the exchange rate is the admin's own job
-- ("cada quien saca la cuenta") -- the system just records what currency
-- was received and lets the admin apply the resulting amount toward
-- whichever cuota(s) they choose, same as it already did for pure numbers.
--
-- This drops the guard added in 20260906033502_schema_hardening.sql (WR-04)
-- that forced condo_payments.currency to match its linked installment's
-- currency -- that assumption no longer holds now that payment and cuota
-- currency are independent by design, not an error case to catch.
drop trigger if exists condo_payments_currency_guard_trg on condo_payments;
drop function if exists condo_payments_currency_guard();

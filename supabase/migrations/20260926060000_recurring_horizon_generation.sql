-- Recurring Horizon Generation (cuotas + gastos) design:
-- docs/superpowers/specs/2026-09-26-recurring-horizon-generation-design.md
--
-- Recurring cuotas move from a fixed admin-entered installment count
-- (generated once, in full, at creation) to an open-ended model matching
-- fixed gastos' existing shape: NULL installment count = indefinite,
-- topped up through a rolling horizon by a daily cron
-- (app/api/cron/generate-cuotas/route.ts). Every EXISTING recurring cuota
-- template already has a real number_of_installments value and is left
-- exactly as-is -- the new cuotas cron/generation function is gated on
-- `number_of_installments IS NULL`, so legacy rows (and every special
-- template, which always has a real count too) are structurally invisible
-- to it. No data backfill needed.
alter table condo_installment_templates alter column number_of_installments drop not null;

-- Mirrors condo_expense_templates.active exactly (20260909020000_gastos_schema.sql)
-- -- lets the admin stop an open-ended template's future generation without
-- deleting its history. Needed because deleteInstallmentTemplate (CUOT-06)
-- is a hard delete blocked once any payment exists, so it can't serve as
-- "pause this series." Defaulting every existing row to true is a no-op for
-- legacy/special templates, which the new cron never selects regardless of
-- this flag's value.
alter table condo_installment_templates add column active boolean not null default true;

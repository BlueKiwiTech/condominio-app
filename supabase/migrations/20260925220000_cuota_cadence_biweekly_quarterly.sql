-- Cuotas' "Nueva cuota" form only offered weekly/monthly/annual while Gastos
-- offers weekly/biweekly/monthly/quarterly/annual for the same concept —
-- widen condo_installment_templates.cadence to match (see
-- condo_expense_templates.cadence in 20260909020000_gastos_schema.sql).
alter table condo_installment_templates drop constraint if exists condo_installment_templates_cadence_check;
alter table condo_installment_templates
  add constraint condo_installment_templates_cadence_check
  check (cadence in ('weekly', 'biweekly', 'monthly', 'quarterly', 'annual'));

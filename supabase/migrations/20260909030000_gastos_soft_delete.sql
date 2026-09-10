-- Soft delete for gastos: an admin needs to remove a mistaken expense
-- template/instance from view without losing the underlying financial
-- record. deleted_at stays null until deleted; every read (list page,
-- cron, dashboard) filters `deleted_at is null`. Paid expenses are never
-- deletable (enforced in lib/actions/gastos.ts, not here) -- soft delete
-- only ever touches pending rows.
alter table condo_expense_templates add column deleted_at timestamptz;
alter table condo_expenses add column deleted_at timestamptz;

create index condo_expense_templates_deleted_at_idx on condo_expense_templates (deleted_at);
create index condo_expenses_deleted_at_idx on condo_expenses (deleted_at);

-- Soft delete for cuota installments: deactivating a recurring cuota
-- template needs its still-pending (untouched, unpaid) already-generated
-- installments to disappear from admin/resident views without losing the
-- financial record. Mirrors condo_expenses' identical deleted_at column
-- (20260909030000_gastos_soft_delete.sql). Every display/selection read
-- filters `deleted_at is null`; the recurring generator's resume-from-last-
-- row query (lib/cuotas/recurringGeneration.ts) deliberately does NOT filter
-- it, so reactivating a template continues the sequence forward instead of
-- regenerating (and conflicting with) voided rows.
alter table condo_installments add column deleted_at timestamptz;

create index condo_installments_deleted_at_idx on condo_installments (deleted_at);

-- Price-change log for cuota templates. The admin asked for a "bitácora de
-- cambios de precio" instead of a silent overwrite: every time an edit
-- actually changes condo_installment_templates.amount, a row lands here
-- recording old/new amount, the effective_from cutoff used (if any --
-- lib/actions/cuotas.ts's updateInstallmentTemplate, no schema change of
-- its own), and who/when. The "current" price is still just
-- condo_installment_templates.amount (already the newest value) -- this
-- table is purely the audit trail on top, read-only from the app's
-- perspective except for the insert updateInstallmentTemplate does.
create table condo_installment_price_history (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references condo_installment_templates(id) on delete cascade,
  old_amount decimal(12,2) not null,
  new_amount decimal(12,2) not null,
  effective_from date,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);

alter table condo_installment_price_history enable row level security;

-- Same single-community/single-admin scoping pattern as every other
-- condo_installment_* policy (Phase 4's 20260906130000 migration).
create policy condo_installment_price_history_admin_all on condo_installment_price_history
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

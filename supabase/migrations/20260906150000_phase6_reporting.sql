-- Phase 6 (Reporting & Delinquency): grace-period setting for morosos
-- computation. PLAN.md's Phase 6 decision: "Grace period before 'moroso':
-- configurable, not hardcoded -- a setting (e.g. grace_period_days,
-- admin-configurable, could be set to 0/1 for no effective grace)". No new
-- RLS policy is needed -- condo_communities already has an admin-scoped
-- policy from Phase 3 (condo_communities_admin_all), which covers every
-- column on the table, this one included.
--
-- Default 0: a house becomes "moroso" as soon as ANY installment is past its
-- due_date and unpaid, with no forgiveness window, until the admin
-- configures a different value (assumption -- flagged in PLAN.md as no
-- specific default was otherwise locked).
alter table condo_communities
  add column grace_period_days int not null default 0;

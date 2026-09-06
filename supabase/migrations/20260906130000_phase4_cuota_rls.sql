-- Phase 4 (Cuota Engine): admin RLS policies for condo_installment_templates
-- and condo_installments. Both tables have had RLS enabled with ZERO policies
-- since Phase 1's deny-by-default migration -- PLAN.md's AUTH-07 note says
-- "later phases' tables get their own admin policies when those features
-- ship". Same single-community/single-admin scoping pattern as Phase 3's
-- migration (condo_houses/condo_house_residents policies).
--
-- Residents never touch these tables through RLS at all in Phase 4 (no
-- resident-facing cuota views exist yet -- that's Phase 7) so no resident
-- policy is added here.
create policy condo_installment_templates_admin_all on condo_installment_templates
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

create policy condo_installments_admin_all on condo_installments
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

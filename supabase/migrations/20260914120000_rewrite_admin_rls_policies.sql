-- Replaces every "is this user an admin of ANY community" policy
-- (`exists (select 1 from condo_communities c where c.admin_id = auth.uid())`)
-- with a real per-row tenant check via condo_is_community_admin(). This is
-- the actual multi-tenancy bug fix (design doc section B) -- until this
-- migration runs, every one of these policies lets any admin read/write
-- every other community's rows once a second community exists.

-- condo_communities (checks its own id, not a community_id column)
drop policy condo_communities_admin_all on condo_communities;
create policy condo_communities_admin_all on condo_communities
  for all
  using (condo_is_community_admin(id))
  with check (condo_is_community_admin(id));

-- condo_houses
drop policy condo_houses_admin_all on condo_houses;
create policy condo_houses_admin_all on condo_houses
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_house_residents
drop policy condo_house_residents_admin_all on condo_house_residents;
create policy condo_house_residents_admin_all on condo_house_residents
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_installment_templates
drop policy condo_installment_templates_admin_all on condo_installment_templates;
create policy condo_installment_templates_admin_all on condo_installment_templates
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_installments
drop policy condo_installments_admin_all on condo_installments;
create policy condo_installments_admin_all on condo_installments
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_payments
drop policy condo_payments_admin_all on condo_payments;
create policy condo_payments_admin_all on condo_payments
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_house_credits
drop policy condo_house_credits_admin_all on condo_house_credits;
create policy condo_house_credits_admin_all on condo_house_credits
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_audit_logs (select + insert only, no update/delete -- unchanged from original)
drop policy condo_audit_logs_admin_read_write on condo_audit_logs;
drop policy condo_audit_logs_admin_insert on condo_audit_logs;
create policy condo_audit_logs_admin_read_write on condo_audit_logs
  for select
  using (condo_is_community_admin(community_id));
create policy condo_audit_logs_admin_insert on condo_audit_logs
  for insert
  with check (condo_is_community_admin(community_id));

-- condo_installment_price_history
drop policy condo_installment_price_history_admin_all on condo_installment_price_history;
create policy condo_installment_price_history_admin_all on condo_installment_price_history
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_exchange_rates
drop policy condo_exchange_rates_admin_all on condo_exchange_rates;
create policy condo_exchange_rates_admin_all on condo_exchange_rates
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_payment_reports
drop policy condo_payment_reports_admin_all on condo_payment_reports;
create policy condo_payment_reports_admin_all on condo_payment_reports
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_expense_categories
drop policy condo_expense_categories_admin_all on condo_expense_categories;
create policy condo_expense_categories_admin_all on condo_expense_categories
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_expense_templates
drop policy condo_expense_templates_admin_all on condo_expense_templates;
create policy condo_expense_templates_admin_all on condo_expense_templates
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

-- condo_expenses
drop policy condo_expenses_admin_all on condo_expenses;
create policy condo_expenses_admin_all on condo_expenses
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

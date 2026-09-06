-- Confirms RLS is enabled with ZERO policies (deny-by-default) on all 7 core
-- tables (DPLY-02). Run via: supabase db query --linked --file scripts/check-rls.sql
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in ('condo_communities','condo_houses','condo_house_residents','condo_installment_templates','condo_installments','condo_payments','condo_audit_logs')
order by relname;

select tablename, policyname
from pg_policies
where tablename in ('condo_communities','condo_houses','condo_house_residents','condo_installment_templates','condo_installments','condo_payments','condo_audit_logs');

-- condo_audit_logs was created in the initial schema with RLS enabled and
-- ZERO policies (deny-by-default per that migration's own comment), and was
-- never given one in any later migration. lib/audit.ts's logAudit() writes
-- through the cookie-scoped authenticated client (same client as every other
-- admin Server Action, lib/supabase/server.ts), so every insert into this
-- table was being silently rejected by RLS -- the table was never actually
-- reachable from application code.
--
-- select+insert only (not "for all" like the other *_admin_all policies):
-- an audit trail that the same admin session can update or delete isn't much
-- of an audit trail. Nothing in the app ever needs to mutate or remove a row
-- here.
create policy condo_audit_logs_admin_read_write on condo_audit_logs
  for select
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

create policy condo_audit_logs_admin_insert on condo_audit_logs
  for insert
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

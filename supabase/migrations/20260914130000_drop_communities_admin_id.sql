-- Task 5: Drop legacy admin_id column
-- Nothing reads or writes admin_id anymore: lib/actions/auth.ts writes
-- condo_community_admins instead (Task 2), and every RLS policy checks
-- condo_is_community_admin()/community_id instead of admin_id (Task 4).
alter table condo_communities drop column admin_id;

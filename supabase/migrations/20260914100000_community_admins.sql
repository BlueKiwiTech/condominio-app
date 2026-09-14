-- Multiple admins per community (design doc decision C). Admins are
-- provisioned directly in the database by the developer -- there is no
-- self-service invite flow. condo_communities.admin_id (single FK) is
-- dropped once nothing depends on it (Task 5).
create table condo_community_admins (
  community_id uuid not null references condo_communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index condo_community_admins_user_idx on condo_community_admins (user_id);

-- Deny-by-default, zero policies -- same posture Phase 1 used for every
-- table at creation (initial_schema.sql). Nothing queries this table
-- through the cookie-scoped `authenticated` client today: only the
-- service-role client (lib/actions/auth.ts, Task 2) and the SECURITY
-- DEFINER function below touch it, both of which bypass RLS.
alter table condo_community_admins enable row level security;

-- Backfill: the single existing admin_id becomes a row here.
insert into condo_community_admins (community_id, user_id)
select id, admin_id from condo_communities where admin_id is not null
on conflict (community_id, user_id) do nothing;

-- condo_is_community_admin: the one helper every admin RLS policy in this
-- migration series will call (Task 4). SECURITY DEFINER + a locked-down
-- search_path so it can read condo_community_admins regardless of the
-- caller's own RLS (same rationale as condo_verify_house_pin in Phase 3's
-- migration) -- and per supabase-postgres-best-practices' RLS-performance
-- guidance, wrapping auth.uid() in a SELECT lets Postgres cache it once per
-- statement instead of re-evaluating per row.
create or replace function condo_is_community_admin(target_community_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.condo_community_admins
    where community_id = target_community_id
      and user_id = (select auth.uid())
  );
$$;

revoke execute on function condo_is_community_admin(uuid) from public;
grant execute on function condo_is_community_admin(uuid) to authenticated;

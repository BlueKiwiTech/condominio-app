-- Phase 3 (Houses & Resident Access): schema correction + first RLS policies.
--
-- 1. PIN correction (PLAN.md "Schema Correction Needed in Phase 3"): PIN is
--    one-per-HOUSE, not one-per-resident. Move pin_hash off
--    condo_house_residents and onto condo_houses, plus lockout-tracking
--    columns for AUTH-06 (5 failed attempts -> 15-minute lockout, per house).
alter table condo_houses
  add column pin_hash varchar,
  add column failed_pin_attempts int not null default 0,
  add column pin_locked_until timestamptz;

alter table condo_house_residents
  drop column pin_hash;

-- 2. Admin RLS policies (AUTH-07 partial: "admins see everything"). Single
-- admin per single community (CLAUDE.md: not multi-tenant) -- an
-- authenticated user counts as "the admin" iff they are condo_communities.admin_id.
-- Resident access does NOT go through these policies at all: residents never
-- get a Supabase Auth session (Pattern A, PLAN.md Phase 3 decisions), so
-- their reads always go through the service-role client in application code,
-- manually scoped by house_id -- RLS here is a backstop for the admin path only.
create policy condo_communities_admin_all on condo_communities
  for all
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

create policy condo_houses_admin_all on condo_houses
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

create policy condo_house_residents_admin_all on condo_house_residents
  for all
  using (exists (select 1 from condo_communities c where c.admin_id = auth.uid()))
  with check (exists (select 1 from condo_communities c where c.admin_id = auth.uid()));

-- 3. PIN hashing/verification via pgcrypto (PLAN.md Phase 3 decision: "PIN
-- hash comparison via pgcrypto"), not app-side bcryptjs -- keeps the
-- brute-force lockout counter atomic with the verification itself and never
-- pulls the hash out to app code for comparison.
--
-- condo_hash_pin: called by admin Server Actions (house create/edit) via the
-- cookie-based authenticated client to produce a value for pin_hash. Pure
-- function, touches no tables, safe to expose to `authenticated`.
create or replace function condo_hash_pin(p_pin varchar)
returns varchar
language sql
as $$
  select extensions.crypt(p_pin, extensions.gen_salt('bf'));
$$;

revoke execute on function condo_hash_pin(varchar) from public;
grant execute on function condo_hash_pin(varchar) to authenticated;

-- condo_verify_house_pin: called ONLY via the service-role client from the
-- resident-login Server Action (lib/actions/residentAuth.ts). Deliberately
-- SECURITY INVOKER (the default, not SECURITY DEFINER): if a caller without
-- the service-role key ever invokes this RPC directly (e.g. anon hitting
-- PostgREST straight), the internal SELECT/UPDATE against condo_houses runs
-- under that caller's own RLS -- and anon has zero policies on condo_houses,
-- so it silently sees no rows and always falls through to 'not_found'. Only
-- the service-role key (which bypasses RLS entirely) can make this function
-- actually authenticate anyone.
create or replace function condo_verify_house_pin(p_house_number varchar, p_pin varchar)
returns jsonb
language plpgsql
as $$
declare
  h condo_houses%rowtype;
  max_attempts constant int := 5;
  lockout_minutes constant int := 15;
  new_attempts int;
  lock_until timestamptz;
begin
  select * into h from condo_houses where house_number = p_house_number;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'not_found');
  end if;

  if h.pin_hash is null then
    return jsonb_build_object('success', false, 'reason', 'no_pin');
  end if;

  if h.pin_locked_until is not null and h.pin_locked_until > now() then
    return jsonb_build_object('success', false, 'reason', 'locked', 'locked_until', h.pin_locked_until);
  end if;

  if extensions.crypt(p_pin, h.pin_hash) = h.pin_hash then
    update condo_houses
      set failed_pin_attempts = 0, pin_locked_until = null
      where id = h.id;
    return jsonb_build_object('success', true, 'house_id', h.id);
  end if;

  new_attempts := coalesce(h.failed_pin_attempts, 0) + 1;
  lock_until := case when new_attempts >= max_attempts
    then now() + (lockout_minutes || ' minutes')::interval
    else null
  end;

  update condo_houses
    set failed_pin_attempts = new_attempts, pin_locked_until = lock_until
    where id = h.id;

  return jsonb_build_object(
    'success', false,
    'reason', case when lock_until is not null then 'locked' else 'invalid' end,
    'locked_until', lock_until,
    'attempts_remaining', greatest(max_attempts - new_attempts, 0)
  );
end;
$$;

revoke execute on function condo_verify_house_pin(varchar, varchar) from public;
grant execute on function condo_verify_house_pin(varchar, varchar) to service_role;

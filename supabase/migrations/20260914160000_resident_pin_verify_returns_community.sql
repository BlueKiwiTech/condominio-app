-- condo_verify_house_pin now also returns the house's community_id on
-- success, so the resident's signed session cookie can carry it (Step 2-4
-- below). Logic is otherwise byte-for-byte identical to the Phase 3
-- version in 20260906120000_phase3_house_pin_and_rls.sql.
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
    return jsonb_build_object('success', true, 'house_id', h.id, 'community_id', h.community_id);
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

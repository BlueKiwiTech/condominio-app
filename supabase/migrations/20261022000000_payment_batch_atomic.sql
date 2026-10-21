-- Abonos concurrentes (QA round 1, H-01): the whole payment is now ONE transaction.
--
-- Before, applyPaymentAllocation read the cuotas and the house credit, computed the
-- allocation in the app and then wrote the payment rows, the cuotas and the credit as
-- separate calls. Two payments to the same house at the same time both read the same
-- state: the second overwrote the credit of the first and could pay the same cuota
-- twice. condo_apply_payment_batch (replaced here, new signature) now
--   1. serializes the payments of the same house with a transaction advisory lock,
--   2. checks that every cuota to update and the house credit are still EXACTLY as the
--      app read them (otherwise it returns {"ok": false, "reason": "conflict"} and
--      writes nothing; the app re-evaluates with the fresh state and retries), and
--   3. writes the payment rows, the community movement (payment_in), the cuota updates
--      and the credit balance together, or nothing.
-- This also removes the old "payment rows written but cuotas/credit not updated" gap.
--
-- Returns {"ok": true}, or {"ok": false, "reason": "house_not_found" | "invalid_rows" | "conflict"}.
-- p_installment_updates: [{id, expected_amount, expected_amount_paid, expected_status, new_amount_paid, new_status}]
-- (expected_amount is checked too: a price edited between the read and the write is a conflict,
-- so a cuota is never marked paid against an old amount)
-- Re-runnable (`drop ... if exists`, `create or replace`); the previous function has a
-- different signature, so it is dropped explicitly. Nothing is migrated: no data changes.
drop function if exists condo_apply_payment_batch(uuid, uuid, jsonb, text, numeric, date, uuid);

create or replace function condo_apply_payment_batch(
  p_house_id uuid,
  p_batch_id uuid,
  p_rows jsonb,
  p_currency text,
  p_amount_received numeric,
  p_occurred_on date,
  p_created_by uuid,
  p_installment_updates jsonb,
  p_expected_credit numeric,
  p_new_credit numeric
)
returns jsonb
language plpgsql
security definer
-- `public`, not '': inserting into condo_payments fires the autofill trigger
-- (condo_autofill_community_id_from_house), which references condo_houses
-- unqualified and inherits this function's search_path.
set search_path = public, pg_temp
as $$
declare
  v_community uuid;
  v_service boolean := coalesce((select auth.role()), '') = 'service_role';
  v_actor uuid;
  v_received numeric := round(p_amount_received, 2);
  v_credit numeric;
begin
  select community_id into v_community from public.condo_houses where id = p_house_id;
  if v_community is null then
    return jsonb_build_object('ok', false, 'reason', 'house_not_found');
  end if;
  perform public.condo_assert_can_write_balance(v_community);

  -- The author is the caller, never a parameter (the service role -- releasing a
  -- held payment without a session -- passes the admin who registered it).
  v_actor := case when v_service then p_created_by else (select auth.uid()) end;

  -- Every row must belong to the house the caller was authorized for, and every
  -- cuota to that house: this function inserts with its owner's privileges, so
  -- it can't rely on the RLS policy of condo_payments.
  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(house_id uuid, installment_id uuid)
    where r.house_id is distinct from p_house_id
       or (r.installment_id is not null and not exists (
             select 1 from public.condo_installments i
             where i.id = r.installment_id and i.house_id = p_house_id))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rows');
  end if;

  -- One payment at a time per house. The lock is released at the end of the transaction.
  perform pg_advisory_xact_lock(hashtextextended(p_house_id::text, 20261022));

  -- Lock the cuotas to update (in id order) and check they are still what the app read.
  perform 1
  from public.condo_installments i
  where i.id in (select (u ->> 'id')::uuid from jsonb_array_elements(p_installment_updates) u)
  order by i.id
  for update;

  if exists (
    select 1
    from jsonb_to_recordset(p_installment_updates) as u(
      id uuid, expected_amount numeric, expected_amount_paid numeric, expected_status text, new_amount_paid numeric, new_status text
    )
    where not exists (
      select 1 from public.condo_installments i
      where i.id = u.id and i.house_id = p_house_id and i.deleted_at is null
        and i.status = u.expected_status and i.amount_paid = u.expected_amount_paid
        and i.amount = u.expected_amount
    )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  select c.balance into v_credit
  from public.condo_house_credits c
  where c.house_id = p_house_id and c.currency = p_currency
  for update;
  if coalesce(v_credit, 0) <> coalesce(p_expected_credit, 0) then
    return jsonb_build_object('ok', false, 'reason', 'conflict');
  end if;

  insert into public.condo_payments (
    house_id, installment_id, payment_batch_id, amount_paid, currency,
    payment_date, reference, notes, receipt_number, created_by, funding_breakdown
  )
  select
    r.house_id, r.installment_id, r.payment_batch_id, r.amount_paid, r.currency,
    r.payment_date, r.reference, r.notes, r.receipt_number, v_actor, r.funding_breakdown
  from jsonb_to_recordset(p_rows) as r(
    house_id uuid, installment_id uuid, payment_batch_id uuid, amount_paid numeric,
    currency text, payment_date date, reference text, notes text,
    receipt_number integer, created_by uuid, funding_breakdown jsonb
  );

  if v_received > 0 then
    perform public.condo_record_movement(
      v_community, 'payment_in', p_currency, v_received, p_batch_id, p_occurred_on, null, v_actor, false
    );
  end if;

  update public.condo_installments i
  set amount_paid = u.new_amount_paid, status = u.new_status
  from jsonb_to_recordset(p_installment_updates) as u(
    id uuid, expected_amount numeric, expected_amount_paid numeric, expected_status text, new_amount_paid numeric, new_status text
  )
  where i.id = u.id;

  insert into public.condo_house_credits (house_id, currency, balance, updated_at)
  values (p_house_id, p_currency, round(coalesce(p_new_credit, 0), 2), now())
  on conflict (house_id, currency) do update set balance = excluded.balance, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function condo_apply_payment_batch(uuid, uuid, jsonb, text, numeric, date, uuid, jsonb, numeric, numeric) from public, anon;
grant execute on function condo_apply_payment_batch(uuid, uuid, jsonb, text, numeric, date, uuid, jsonb, numeric, numeric) to authenticated, service_role;

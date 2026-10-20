-- Saldo de la comunidad como balance guardado + libro de movimientos (change
-- saldo-comunidad-libro).
--
-- Until now the community balance was derived on every read from condo_payments,
-- condo_house_credits and condo_expenses. It is now stored:
--   condo_community_balances   one row per community and currency (never mixed)
--   condo_community_movements  append-only ledger: opening | payment_in |
--                              expense_out | adjustment, signed amount
-- and only changes through the SQL functions below, which move the balance and
-- write the movement in ONE transaction:
--   condo_apply_payment_batch  inserts a payment batch + its payment_in
--   condo_pay_expense          checks funds, pays the expense and writes
--                              expense_out (locks the balance row, so two
--                              simultaneous payments can't spend the same money)
--   condo_add_community_movement  opening balance (once per currency) and
--                              manual adjustments (reason required)
-- Idempotent by reference: one movement per (community, type, reference_id).
--
-- Re-runnable: tables/indexes/policies use `if not exists` or are recreated,
-- functions use `create or replace`, and the backfill only runs while the
-- ledger is empty. The balance starts at what the previous derived formula
-- (lib/reporting/communityBalance.ts) produced, so the visible balance doesn't
-- jump on deploy; the real opening balance is entered afterwards by the admin.

-- ---------------------------------------------------------------- tables
create table if not exists condo_community_balances (
  community_id uuid not null references condo_communities(id),
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  balance numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (community_id, currency)
);

create table if not exists condo_community_movements (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references condo_communities(id),
  type varchar not null check (type in ('opening', 'payment_in', 'expense_out', 'adjustment')),
  currency varchar not null check (currency in ('USD', 'Bs', 'USDT')),
  amount numeric(14, 2) not null check (amount <> 0),
  -- payment_batch_id for payment_in, expense id for expense_out; null for
  -- opening/adjustment. Never a foreign key: the ledger must outlive its source rows.
  reference_id uuid,
  -- Calendar day of the business event (payment_date / paid_date / registration day).
  occurred_on date not null,
  note text,
  created_by uuid references auth.users(id),
  -- Copied from auth.users when the movement is written, so the ledger can show
  -- who did it without reading auth.users (which admins can't).
  author_email text,
  created_at timestamptz not null default now()
);

create unique index if not exists condo_community_movements_ref_uidx
  on condo_community_movements (community_id, type, reference_id)
  where reference_id is not null;
create unique index if not exists condo_community_movements_opening_uidx
  on condo_community_movements (community_id, currency)
  where type = 'opening';
create index if not exists condo_community_movements_list_idx
  on condo_community_movements (community_id, created_at desc, id desc);

-- ------------------------------------------------------------------- RLS
-- Admins read; nobody writes directly (only the security-definer functions do).
alter table condo_community_balances enable row level security;
alter table condo_community_movements enable row level security;

drop policy if exists condo_community_balances_admin_read on condo_community_balances;
create policy condo_community_balances_admin_read on condo_community_balances
  for select
  using (condo_is_community_admin(community_id));

drop policy if exists condo_community_movements_admin_read on condo_community_movements;
create policy condo_community_movements_admin_read on condo_community_movements
  for select
  using (condo_is_community_admin(community_id));

-- ------------------------------------------------------------- internals
-- Who may call the write functions: an admin of that community, or the service
-- role (the rates cron releases held payments without an admin session).
create or replace function condo_assert_can_write_balance(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'service_role' then
    return;
  end if;
  if not public.condo_is_community_admin(p_community_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end;
$$;

-- Moves the balance and writes the movement. Locks the (community, currency)
-- balance row so concurrent callers serialize. Returns:
--   {"ok": true}                                      recorded
--   {"ok": true, "duplicate": true}                   same (type, reference) already recorded
--   {"ok": false, "reason": "insufficient", "available": n}   p_require_funds and not enough
create or replace function condo_record_movement(
  p_community_id uuid,
  p_type text,
  p_currency text,
  p_amount numeric,
  p_reference_id uuid,
  p_occurred_on date,
  p_note text,
  p_created_by uuid,
  p_require_funds boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
  v_created boolean;
begin
  -- Defence in depth: this function is internal (not granted to API roles), but
  -- it never trusts its caller.
  perform public.condo_assert_can_write_balance(p_community_id);

  insert into public.condo_community_balances (community_id, currency, balance)
  values (p_community_id, p_currency, 0)
  on conflict (community_id, currency) do nothing;
  v_created := found;

  select balance into v_balance
  from public.condo_community_balances
  where community_id = p_community_id and currency = p_currency
  for update;

  if p_reference_id is not null and exists (
    select 1 from public.condo_community_movements
    where community_id = p_community_id and type = p_type and reference_id = p_reference_id
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_require_funds and v_balance + p_amount < 0 then
    -- Don't leave a zero row behind for a currency that never had a movement.
    if v_created then
      delete from public.condo_community_balances
      where community_id = p_community_id and currency = p_currency;
    end if;
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'available', v_balance);
  end if;

  insert into public.condo_community_movements
    (community_id, type, currency, amount, reference_id, occurred_on, note, created_by, author_email)
  values
    (p_community_id, p_type, p_currency, p_amount, p_reference_id, p_occurred_on, p_note, p_created_by,
     (select u.email from auth.users u where u.id = p_created_by));

  update public.condo_community_balances
  set balance = balance + p_amount, updated_at = now()
  where community_id = p_community_id and currency = p_currency;

  return jsonb_build_object('ok', true);
end;
$$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default privileges, and `revoke ... from public` does not remove those, so
-- they are revoked by name. The internal helpers are not callable from the API at all.
revoke all on function condo_assert_can_write_balance(uuid) from public, anon, authenticated;
revoke all on function condo_record_movement(uuid, text, text, numeric, uuid, date, text, uuid, boolean) from public, anon, authenticated;

-- --------------------------------------------------- payment batch (+ in)
-- Inserts the rows of one payment batch and the payment_in movement for the
-- money actually received (amount_received, in its own currency) atomically.
-- p_rows: [{house_id, installment_id, payment_batch_id, amount_paid, currency,
--           payment_date, reference, notes, receipt_number, created_by,
--           funding_breakdown}, ...]
create or replace function condo_apply_payment_batch(
  p_house_id uuid,
  p_batch_id uuid,
  p_rows jsonb,
  p_currency text,
  p_amount_received numeric,
  p_occurred_on date,
  p_created_by uuid
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

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function condo_apply_payment_batch(uuid, uuid, jsonb, text, numeric, date, uuid) from public, anon;
grant execute on function condo_apply_payment_batch(uuid, uuid, jsonb, text, numeric, date, uuid) to authenticated, service_role;

-- ------------------------------------------------- pay expense (- out)
-- Pays a pending expense atomically: checks the balance of the currency the
-- money leaves in, updates the expense with the columns the action computed
-- (same ones it wrote directly before) and records expense_out. Returns
--   {"ok": true}
--   {"ok": false, "reason": "not_found" | "not_pending"}
--   {"ok": false, "reason": "insufficient", "available": n}
create or replace function condo_pay_expense(
  p_expense_id uuid,
  p_amount numeric,
  p_paid_date date,
  p_notes text,
  p_status text,
  p_exchange_rate numeric,
  p_exchange_rate_type text,
  p_reference_amount numeric,
  p_reference_currency text,
  p_paid_currency text,
  p_paid_amount numeric,
  p_cash_currency text,
  p_cash_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_community uuid;
  v_status text;
  v_result jsonb;
begin
  if p_status not in ('paid', 'on_hold') or p_cash_amount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  select community_id, status into v_community, v_status
  from public.condo_expenses
  where id = p_expense_id and deleted_at is null
  for update;
  if v_community is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  perform public.condo_assert_can_write_balance(v_community);
  if v_status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'not_pending');
  end if;

  v_result := public.condo_record_movement(
    v_community, 'expense_out', p_cash_currency, -p_cash_amount, p_expense_id, p_paid_date,
    null, (select auth.uid()), true
  );
  if not (v_result ->> 'ok')::boolean then
    return v_result;
  end if;

  update public.condo_expenses
  set amount = coalesce(p_amount, amount),
      paid_date = p_paid_date,
      notes = p_notes,
      status = p_status,
      exchange_rate = p_exchange_rate,
      exchange_rate_type = p_exchange_rate_type,
      reference_amount = p_reference_amount,
      reference_currency = p_reference_currency,
      paid_currency = p_paid_currency,
      paid_amount = p_paid_amount,
      updated_at = now()
  where id = p_expense_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function condo_pay_expense(uuid, numeric, date, text, text, numeric, text, numeric, text, text, numeric, text, numeric) from public, anon;
grant execute on function condo_pay_expense(uuid, numeric, date, text, text, numeric, text, numeric, text, text, numeric, text, numeric) to authenticated, service_role;

-- ---------------------------------------- opening balance and adjustments
-- opening: amount > 0, once per currency. adjustment: amount <> 0, non-blank
-- reason. Returns {"ok": true} or {"ok": false, "reason": "invalid" | "already_exists"}.
create or replace function condo_add_community_movement(
  p_community_id uuid,
  p_type text,
  p_currency text,
  p_amount numeric,
  p_note text,
  p_occurred_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.condo_assert_can_write_balance(p_community_id);

  if p_type not in ('opening', 'adjustment')
     or p_currency not in ('USD', 'Bs', 'USDT')
     or p_amount is null or p_amount = 0
     or (p_type = 'opening' and p_amount < 0)
     or (p_type = 'adjustment' and length(btrim(coalesce(p_note, ''))) = 0) then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if p_type = 'opening' and exists (
    select 1 from public.condo_community_movements
    where community_id = p_community_id and currency = p_currency and type = 'opening'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_exists');
  end if;

  v_result := public.condo_record_movement(
    p_community_id, p_type, p_currency, p_amount, null, p_occurred_on,
    nullif(btrim(coalesce(p_note, '')), ''), (select auth.uid()), false
  );
  return v_result;
exception
  when unique_violation then
    -- two concurrent opening balances for the same currency
    return jsonb_build_object('ok', false, 'reason', 'already_exists');
end;
$$;

revoke all on function condo_add_community_movement(uuid, text, text, numeric, text, date) from public, anon;
grant execute on function condo_add_community_movement(uuid, text, text, numeric, text, date) to authenticated, service_role;

-- --------------------------------------------------------------- backfill
-- Seed each community/currency balance with what the derived formula gave:
--   received = payment rows applied to a cuota (installment_id not null), in the
--              currency each funding_breakdown entry was drawn in (amountDrawn),
--              or amount_paid in the row's currency when there is no breakdown;
--              plus every house credit balance (money received, not yet applied)
--   spent    = expenses paid / on_hold (not deleted), in paid_currency/paid_amount
--              or currency/amount
-- Only while the ledger is empty, and only for non-zero net amounts.
do $$
declare
  r record;
begin
  if exists (select 1 from condo_community_movements) then
    return;
  end if;

  for r in
    with recv as (
      select p.community_id, coalesce(f ->> 'currency', p.currency) as currency, (f ->> 'amountDrawn')::numeric as amt
      from condo_payments p
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(p.funding_breakdown) = 'array' then p.funding_breakdown else '[]'::jsonb end
      ) f
      where p.installment_id is not null
      union all
      select p.community_id, p.currency, p.amount_paid
      from condo_payments p
      where p.installment_id is not null
        and jsonb_array_length(
              case when jsonb_typeof(p.funding_breakdown) = 'array' then p.funding_breakdown else '[]'::jsonb end
            ) = 0
      union all
      select h.community_id, c.currency, c.balance
      from condo_house_credits c
      join condo_houses h on h.id = c.house_id
    ),
    spent as (
      select e.community_id, coalesce(e.paid_currency, e.currency) as currency,
             coalesce(e.paid_amount, e.amount) as amt
      from condo_expenses e
      where e.deleted_at is null and e.status in ('paid', 'on_hold')
    ),
    net as (
      select community_id, currency, round(sum(amt), 2) as amt
      from (
        select community_id, currency, amt from recv
        union all
        select community_id, currency, -amt from spent
      ) x
      group by community_id, currency
    )
    select community_id, currency, amt from net where amt <> 0
  loop
    insert into condo_community_balances (community_id, currency, balance)
    values (r.community_id, r.currency, r.amt)
    on conflict (community_id, currency) do update set balance = excluded.balance, updated_at = now();

    insert into condo_community_movements (community_id, type, currency, amount, occurred_on, note)
    values (r.community_id, 'adjustment', r.currency, r.amt, (now() at time zone 'America/Caracas')::date,
            'Saldo calculado al activar el libro de movimientos');
  end loop;
end;
$$;

-- Additional owner phone numbers for a house, beyond condo_houses.owner_phone
-- (kept in place as the "primary" phone -- no backfill, no rewrite). Follows
-- the condo_house_residents precedent for a 1-to-many relation off
-- condo_houses: denormalized community_id, the existing generic autofill
-- trigger, RLS piggybacking on condo_is_community_admin(community_id).
create table condo_house_phones (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references condo_houses(id) on delete cascade,
  community_id uuid references condo_communities(id),
  phone varchar not null,
  created_at timestamptz not null default now()
);

create index condo_house_phones_house_idx on condo_house_phones (house_id);
create index condo_house_phones_community_idx on condo_house_phones (community_id);

alter table condo_house_phones enable row level security;

create policy condo_house_phones_admin_all on condo_house_phones
  for all
  using (condo_is_community_admin(community_id))
  with check (condo_is_community_admin(community_id));

create trigger condo_house_phones_autofill_community
  before insert on condo_house_phones
  for each row execute function condo_autofill_community_id_from_house();

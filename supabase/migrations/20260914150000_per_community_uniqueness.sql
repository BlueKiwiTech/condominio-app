-- Both of these were globally unique, which breaks the moment a second
-- community exists and wants to reuse a house number or a category name
-- the first community already has. Scope both to per-community instead.
--
-- KNOWN, ACCEPTED GAP (design doc decision #5): condo_verify_house_pin
-- still looks up by house_number ALONE, with no community disambiguation.
-- This constraint change makes it POSSIBLE for two communities to each
-- have a "House 12" -- but resident login itself will not know which one
-- a given login attempt means until the tenant-routing UI (explicitly out
-- of scope for this phase) exists. Do not onboard a second community with
-- an overlapping house_number until that UI ships.

-- Enforce NOT NULL on community_id before scoping the uniqueness constraint.
-- Without this, two NULL community_ids would bypass the unique constraint
-- (Postgres treats NULL as distinct in unique constraints).
-- Now redundant-but-harmless: migration 20260914110000 backfills and enforces
-- this same NOT NULL earlier, so by the time this file runs the column is
-- already NOT NULL. Left in place as a no-op safety net.
alter table condo_houses alter column community_id set not null;

alter table condo_houses drop constraint condo_houses_house_number_key;
alter table condo_houses add constraint condo_houses_community_house_number_key unique (community_id, house_number);

alter table condo_expense_categories drop constraint condo_expense_categories_name_key;
alter table condo_expense_categories add constraint condo_expense_categories_community_name_key unique (community_id, name);

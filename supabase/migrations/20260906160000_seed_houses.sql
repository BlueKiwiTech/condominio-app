-- Seed the community's real houses (código + nombre, provided by the admin)
-- into condo_houses. This is data, not a schema change, but still tracked as
-- a migration per CLAUDE.md's "migrations version-controlled" convention.
--
-- No owner contact info or PIN was supplied for this batch -- both stay
-- NULL. The admin sets each house's PIN via the "Casas y vecinos" edit
-- screen (HOUS-02) before residents can use it to log in; condo_houses.
-- pin_hash is nullable exactly for this reason, and condo_verify_house_pin
-- already treats a NULL pin_hash as 'no_pin' rather than erroring.
--
-- house_number preserves the community's own código exactly as given
-- ("20 01", "21 02", ...) -- that's how these houses are identified on-site,
-- not renumbered for the app's convenience. Four houses share código "20 65"
-- (PEDRALBES 70/71/72/73 -- four separate units at the same address), which
-- would violate house_number's unique constraint verbatim, so those four
-- get the base código plus a "-NN" suffix taken from their own house name,
-- keeping them unique and still traceable back to the source list.
--
-- community_id: single-tenant app (CLAUDE.md), so this grabs whichever one
-- condo_communities row exists (created lazily on the first admin signup,
-- Phase 2). If that row doesn't exist yet in the target project when this
-- runs, the subquery returns NULL and every house is inserted unlinked --
-- fix it up afterward with:
--   update condo_houses set community_id = (select id from condo_communities limit 1)
--   where community_id is null;
--
-- ON CONFLICT DO NOTHING makes this safe to re-run, and safe if any of these
-- houses were already created by hand through the admin UI first.
insert into condo_houses (community_id, house_number, house_name) values
  ((select id from condo_communities limit 1), '20 01', 'MILMANDA'),
  ((select id from condo_communities limit 1), '21 02', 'LUIZENA'),
  ((select id from condo_communities limit 1), '21 03', 'EMILIA'),
  ((select id from condo_communities limit 1), '21 04', 'MARGIMAR'),
  ((select id from condo_communities limit 1), '21 05', 'MARU'),
  ((select id from condo_communities limit 1), '21 06', 'LUGLEMAR'),
  ((select id from condo_communities limit 1), '21 07', 'DARÍA'),
  ((select id from condo_communities limit 1), '21 08', 'NANCY'),
  ((select id from condo_communities limit 1), '21 09', 'CLARETH'),
  ((select id from condo_communities limit 1), '21 10', 'DI LU'),
  ((select id from condo_communities limit 1), '21 11', 'GUARIMBA'),
  ((select id from condo_communities limit 1), '21 12', 'Ma. AUXILIADORA'),
  ((select id from condo_communities limit 1), '21 13', 'DIVINO NIÑO'),
  ((select id from condo_communities limit 1), '21 14', 'PIAROA'),
  ((select id from condo_communities limit 1), '21 15', 'AMPARO'),
  ((select id from condo_communities limit 1), '21 16', 'YOLMAR'),
  ((select id from condo_communities limit 1), '21 17', 'ANA'),
  ((select id from condo_communities limit 1), '21 18', 'YOLANGEL'),
  ((select id from condo_communities limit 1), '21 19', 'MILAGROS'),
  ((select id from condo_communities limit 1), '21 20', 'CLEMENTINA'),
  ((select id from condo_communities limit 1), '21 21', 'MITXO'),
  ((select id from condo_communities limit 1), '21 22', 'ROVI'),
  ((select id from condo_communities limit 1), '21 23', 'CARMEN'),
  ((select id from condo_communities limit 1), '21 24', 'GURE AMETXA'),
  ((select id from condo_communities limit 1), '21 25', 'DORIS'),
  ((select id from condo_communities limit 1), '21 26', 'EL BREZAL'),
  ((select id from condo_communities limit 1), '21 27', 'SAN JOSÉ'),
  ((select id from condo_communities limit 1), '21 28', 'MATILDE'),
  ((select id from condo_communities limit 1), '20 36', 'IRTIMARAL'),
  ((select id from condo_communities limit 1), '20 37', 'MI ORGULLO'),
  ((select id from condo_communities limit 1), '20 38', 'CHICOYANA'),
  ((select id from condo_communities limit 1), '20 39', 'CATILÚ'),
  ((select id from condo_communities limit 1), '20 40', 'MORAIMA'),
  ((select id from condo_communities limit 1), '20 41', 'SANTA ANA'),
  ((select id from condo_communities limit 1), '20 42', 'ÁNGELA'),
  ((select id from condo_communities limit 1), '20 43', 'LUIGI'),
  ((select id from condo_communities limit 1), '20 44', 'ILIANA'),
  ((select id from condo_communities limit 1), '20 45', 'DIMAR'),
  ((select id from condo_communities limit 1), '20 46', 'GIULOMARI'),
  ((select id from condo_communities limit 1), '20 47', 'MARIELA'),
  ((select id from condo_communities limit 1), '20 48', 'MAFALDA'),
  ((select id from condo_communities limit 1), '20 49', 'DOÑA LOLA'),
  ((select id from condo_communities limit 1), '20 50', 'LA TRINIDAD'),
  ((select id from condo_communities limit 1), '20 51', 'NAZARENO'),
  ((select id from condo_communities limit 1), '20 52', 'JOSEFINA'),
  ((select id from condo_communities limit 1), '20 53', 'ALEJANDRÍA'),
  ((select id from condo_communities limit 1), '20 54', 'ROSE MARIE'),
  ((select id from condo_communities limit 1), '20 55', 'LA TORREALBERA'),
  ((select id from condo_communities limit 1), '20 56', 'DIANA'),
  ((select id from condo_communities limit 1), '20 57', 'MARIA JOSEFINA'),
  ((select id from condo_communities limit 1), '20 58', 'NINI'),
  ((select id from condo_communities limit 1), '20 59', 'MARÍA PÍA'),
  ((select id from condo_communities limit 1), '20 60', 'BACATÁ'),
  ((select id from condo_communities limit 1), '20 61', 'CANTUCA'),
  ((select id from condo_communities limit 1), '20 62', 'SAN BERNARDO'),
  ((select id from condo_communities limit 1), '20 63', 'MI CHI BU AU'),
  ((select id from condo_communities limit 1), '20 64', 'PAQUITA'),
  ((select id from condo_communities limit 1), '20 65-70', 'PEDRALBES 70'),
  ((select id from condo_communities limit 1), '20 65-71', 'PEDRALBES 71'),
  ((select id from condo_communities limit 1), '20 65-72', 'PEDRALBES 72'),
  ((select id from condo_communities limit 1), '20 65-73', 'PEDRALBES 73'),
  ((select id from condo_communities limit 1), '20 66', 'MI CHICHA'),
  ((select id from condo_communities limit 1), '20 67', 'LA MILAGROSA'),
  ((select id from condo_communities limit 1), '20 68', 'VENECIA')
on conflict (house_number) do nothing;

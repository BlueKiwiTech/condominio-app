# multitenancy Specification

## Purpose
Hacer que el esquema, RLS y sesiones soporten más de una comunidad sin cambiar el comportamiento de ASOBARCELONA. Solo fundación de datos: no hay enrutamiento por tenant, registro autoservicio ni cambio de comunidad.

## Requirements

### Requirement: community_id on every table
Toda tabla con datos de negocio SHALL tener `community_id uuid not null references condo_communities(id)` con índice, denormalizado directamente (no derivado por joins).

#### Scenario: Fila sin comunidad
- **WHEN** se intenta insertar una fila sin `community_id` en una tabla de negocio
- **THEN** la inserción falla o se autocompleta mediante los triggers de autofill

### Requirement: Multiple admins per community
La relación admin-comunidad SHALL vivir en `condo_community_admins (community_id, user_id)`; `condo_communities.admin_id` SHALL NOT existir.

#### Scenario: Dos admins
- **WHEN** una comunidad tiene dos filas en `condo_community_admins`
- **THEN** ambos usuarios pueden administrar esa comunidad

### Requirement: Per-row tenant RLS
Cada política de admin SHALL comprobar `community_id in (select community_id from condo_community_admins where user_id = auth.uid())` tanto en `using` como en `with check`; `condo_communities` SHALL aplicar la misma lógica sobre su propio `id`.

#### Scenario: Admin de otra comunidad
- **WHEN** un admin de la comunidad A consulta filas de la comunidad B
- **THEN** no obtiene ninguna

### Requirement: Per-community house numbers
`condo_houses` SHALL tener `unique (community_id, house_number)` en lugar de unicidad global.

#### Scenario: Mismo número en dos comunidades
- **WHEN** dos comunidades distintas tienen una casa "12"
- **THEN** ambas existen sin violar la restricción

### Requirement: Resident session carries community
`condo_verify_house_pin` SHALL devolver `community_id` en éxito, y la cookie firmada (jose) del residente SHALL incluir `community_id` junto a `house_id`.

#### Scenario: Login correcto
- **WHEN** un residente verifica su PIN con éxito
- **THEN** la cookie emitida contiene `house_id`, `resident_id`, `community_id` y `role: 'resident'`

### Requirement: Admin provisioning is manual
Los admins de comunidades nuevas SHALL provisionarse directamente (usuario en `auth.users` más fila en `condo_community_admins`); no existe registro público para tenants nuevos.

#### Scenario: Nueva comunidad
- **WHEN** se necesita un admin para una comunidad nueva
- **THEN** el desarrollador lo crea por SQL o dashboard de Supabase

## Known Limitations

- `condo_verify_house_pin` busca la casa solo por `house_number`: con números repetidos entre comunidades el login de residente es ambiguo. SHALL resolverse antes de incorporar una segunda comunidad (requiere enrutamiento/identificación de tenant, fuera de alcance actual).
- Las consultas con alcance de residente aún no filtran por `community_id`; solo por `house_id`.
- El `/signup` con `ADMIN_ALLOWLIST_EMAIL` sigue vigente solo para los admins de ASOBARCELONA.

# houses-residents Specification

## Purpose
Gestión por parte del admin de las casas de la comunidad: datos del propietario, teléfonos adicionales, personas residentes y el PIN de acceso de cada casa (un PIN por casa, no por persona). Es la base de datos sobre la que operan cuotas, pagos y el login de residentes.

## Requirements

### Requirement: House data model
Cada casa SHALL almacenarse en `condo_houses` con `community_id` obligatorio, `house_number` obligatorio, y `house_name`, `owner_name`, `owner_phone`, `owner_email` opcionales, junto con `pin_hash`, `failed_pin_attempts` y `pin_locked_until`. Los residentes SHALL almacenarse en `condo_house_residents` (nombre obligatorio, teléfono opcional) y los teléfonos extra del propietario en `condo_house_phones`, ambos con borrado en cascada al eliminar la casa.

#### Scenario: Campos opcionales vacíos
- **WHEN** el admin deja en blanco nombre de casa, propietario, teléfono o correo
- **THEN** se guardan como nulos

### Requirement: House number uniqueness
El número de casa SHALL ser único por comunidad (`UNIQUE(community_id, house_number)`). Crear o editar una casa con un número ya existente SHALL devolver el error `duplicateHouseNumber`.

#### Scenario: Número duplicado al crear
- **WHEN** el admin crea una casa con un `house_number` que ya existe
- **THEN** la acción devuelve `duplicateHouseNumber` (código Postgres 23505)

#### Scenario: Número duplicado al editar
- **WHEN** el admin cambia el número de una casa a uno ya usado por otra
- **THEN** la acción devuelve `duplicateHouseNumber`

### Requirement: Create house
Crear una casa SHALL exigir sesión de admin (`getUser`), `house_number` no vacío tras recortar espacios, un PIN de exactamente 4 dígitos y correo con formato válido si se informa. El PIN SHALL hashearse con la RPC `condo_hash_pin` (bcrypt vía pgcrypto) y MUST NOT guardarse en texto plano. La casa se asocia a la única comunidad existente (primera fila de `condo_communities`); si no existe SHALL devolver `communityNotFound`.

#### Scenario: Creación correcta
- **WHEN** el admin envía número, PIN de 4 dígitos y datos opcionales válidos
- **THEN** se inserta la casa con `pin_hash` y se invalida la caché de `/houses`

#### Scenario: PIN con formato inválido
- **WHEN** el PIN no tiene exactamente 4 dígitos
- **THEN** la acción devuelve el error de validación `pinFormat` sin insertar

#### Scenario: Falla el hash
- **WHEN** `condo_hash_pin` devuelve error
- **THEN** la acción devuelve `pinProcessingFailed` y no crea la casa

### Requirement: Extra owner phones
El formulario de casa SHALL permitir una lista de teléfonos adicionales (cada uno no vacío) almacenados en `condo_house_phones`, además del `owner_phone` principal. Al editar, la lista SHALL reemplazarse por completo: primero se insertan los nuevos teléfonos y después se borran los anteriores, de modo que un fallo al insertar conserve los previos.

#### Scenario: Edición de teléfonos
- **WHEN** el admin guarda una casa con una nueva lista de teléfonos extra
- **THEN** los teléfonos anteriores se eliminan y quedan solo los enviados

#### Scenario: Fallo al insertar
- **WHEN** la inserción de los nuevos teléfonos falla
- **THEN** la acción devuelve error y los teléfonos previos permanecen

### Requirement: Admin-only PIN reset
El PIN SHALL poder cambiarse únicamente por el admin al editar la casa: un PIN en blanco SHALL conservar el actual; un PIN de 4 dígitos SHALL reemplazar `pin_hash` y poner `failed_pin_attempts = 0` y `pin_locked_until = null`. No SHALL existir cambio de PIN por parte del residente.

#### Scenario: PIN en blanco al editar
- **WHEN** el admin edita la casa sin escribir un PIN
- **THEN** `pin_hash` y el estado de bloqueo no se modifican

#### Scenario: Reset de PIN desbloquea
- **WHEN** el admin fija un PIN nuevo en una casa bloqueada
- **THEN** el bloqueo y el contador de intentos se reinician

### Requirement: Delete house
Eliminar una casa SHALL requerir sesión de admin y, en la interfaz, una confirmación (`window.confirm`). Si la casa tiene cuotas o pagos asociados (violación de clave foránea 23503) SHALL devolver `hasReferences` y no eliminarla. Sin referencias, SHALL borrarse junto con sus residentes y teléfonos.

#### Scenario: Casa con cuotas
- **WHEN** el admin elimina una casa que tiene cuotas o pagos registrados
- **THEN** la acción devuelve `hasReferences` y la casa permanece

### Requirement: Manage residents
El admin SHALL poder agregar residentes a una casa (nombre obligatorio, teléfono opcional) y eliminarlos individualmente; ambas operaciones SHALL requerir sesión de admin y refrescar `/houses`. Los residentes son solo datos de contacto y MUST NOT tener credenciales propias.

#### Scenario: Agregar residente sin nombre
- **WHEN** el admin envía un residente con nombre vacío
- **THEN** la acción devuelve el error de validación `residentNameRequired`

### Requirement: Houses admin screen
La página `/houses` SHALL listar las casas ordenadas por `house_number` con sus residentes y teléfonos extra, leyendo con el cliente de cookies del admin (sujeto a RLS). Las columnas de PIN (`pin_hash`, intentos, bloqueo) MUST NOT seleccionarse en esa consulta.

#### Scenario: Listado
- **WHEN** el admin abre `/houses`
- **THEN** ve cada casa con sus residentes y teléfonos, sin datos de PIN

### Requirement: Session-expired guard
Todas las acciones de casas y residentes SHALL devolver `sessionExpired` cuando `getUser()` falle, antes de cualquier escritura.

#### Scenario: Sin sesión
- **WHEN** se invoca `createHouse` sin sesión de admin válida
- **THEN** devuelve `sessionExpired` y no inserta nada

## Known Limitations
- `PLAN.md`/docs hablan de "generación" de PIN: en el código no hay generación aleatoria; el admin escribe el PIN de 4 dígitos manualmente al crear o resetear. Un PIN de solo 4 dígitos con bloqueo de 5 intentos/15 min es poco entropía (10.000 combinaciones) por diseño.
- Migración `20260906170000_seed_house_pins.sql` asignó el mismo PIN compartido (solo su hash en el repo) a todas las casas; no hay forzado de cambio.
- `createHouse` y `updateHouse` no son transaccionales: si falla la inserción de teléfonos tras crear/actualizar la casa, la casa ya quedó guardada y se devuelve error; en edición, si falla el borrado de los viejos, quedan duplicados.
- `addResident`, `deleteResident` y `updateHouse`/`deleteHouse` no verifican en código que la casa/residente pertenezca a la comunidad del admin; dependen solo de RLS (`condo_is_community_admin`).
- `getCommunityId` toma la primera fila de `condo_communities` (`limit(1)`), asumiendo una sola comunidad; con varias comunidades podría asignar la casa a la equivocada.
- La unicidad de `house_number` se valida solo por el código de error 23505; se compara como texto exacto (por ejemplo `"01"` y `"1"` son casas distintas) tras `trim`.
- `owner_phone` y los teléfonos extra no tienen validación de formato (solo no vacío en extras); `house_name` también aparece en la etiqueta del sidebar del residente.
- `condo_house_residents.pin_hash` se eliminó en la migración Phase 3 (PIN por casa); versiones antiguas de la documentación aún describen PIN por residente.
- El borrado en BD de una casa con pagos/cuotas depende de que las FKs no tengan cascada; no hay borrado lógico (a diferencia de gastos).

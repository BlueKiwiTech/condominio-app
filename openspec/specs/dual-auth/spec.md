# dual-auth Specification

## Purpose
Autenticación de dos tipos de usuario: el admin (Supabase Auth con cookies vía `@supabase/ssr`, restringido por allowlist de correo y por RLS) y el residente (casa + PIN de 4 dígitos verificado en Postgres, con cookie de sesión firmada con `jose`, sin sesión de Supabase Auth). Los residentes leen sus datos con el cliente service-role filtrado por la casa de su sesión.

## Requirements

### Requirement: Admin signup allowlist
El registro de admin SHALL rechazar con un error explícito cualquier correo que no esté en `ADMIN_ALLOWLIST_EMAIL` (lista separada por comas, comparación sin distinguir mayúsculas ni espacios) antes de llamar a Supabase Auth. Si la variable está vacía o ausente, SHALL rechazar todos los correos.

#### Scenario: Correo no permitido
- **WHEN** alguien se registra con un correo que no está en la allowlist
- **THEN** la acción devuelve el error `allowlistRejected` y no se crea ninguna cuenta

#### Scenario: Correo permitido
- **WHEN** se registra un correo de la allowlist con contraseña de al menos 8 caracteres
- **THEN** se llama a `auth.signUp`, se vincula al usuario a la comunidad y se redirige a `/verify-email`

### Requirement: Admin community linking on signup
Tras un `signUp` exitoso, el sistema MUST vincular al nuevo usuario a la única fila de `condo_communities` (creándola con nombre `ASOBARCELONA` si no existe) insertando una fila en `condo_community_admins` mediante el cliente service-role, de forma idempotente.

#### Scenario: Primera cuenta
- **WHEN** no existe ninguna comunidad y se completa el registro de un admin permitido
- **THEN** se crea la comunidad y se registra al usuario en `condo_community_admins`

#### Scenario: Registro repetido
- **WHEN** el mismo usuario ya está vinculado a la comunidad
- **THEN** el upsert no crea una fila duplicada

### Requirement: Admin login and logout
El login de admin SHALL usar `signInWithPassword`; ante `email_not_confirmed` SHALL devolver `unverifiedEmail` y ante cualquier otro error SHALL devolver `invalidCredentials`. Tras un login exitoso SHALL guardar `grace_period_days` de la comunidad en una cookie httpOnly sin firmar (30 días) y redirigir a `/dashboard`. El logout SHALL llamar a `signOut`, borrar esa cookie y redirigir a `/login`.

#### Scenario: Correo sin verificar
- **WHEN** el admin intenta entrar con un correo aún no confirmado
- **THEN** la acción devuelve el error `unverifiedEmail`

#### Scenario: Login correcto
- **WHEN** el admin entra con credenciales válidas
- **THEN** se fija la cookie `condo_admin_grace_period_days` y se redirige a `/dashboard`

### Requirement: Password recovery and email confirmation
La recuperación de contraseña SHALL enviar el correo con `redirectTo` hacia `/auth/confirm?type=recovery&next=/reset-password` y MUST NOT revelar si el correo existe. El Route Handler `/auth/confirm` SHALL intercambiar `token_hash` por una sesión con `verifyOtp`, redirigir a `next` (por defecto `/dashboard`) sin los parámetros secretos, y en caso de fallo redirigir a `/login?confirmError=1`.

#### Scenario: Enlace de recuperación inválido
- **WHEN** `verifyOtp` falla o faltan `token_hash`/`type`
- **THEN** se redirige a `/login?confirmError=1`

### Requirement: Password reset requires verified user
Restablecer la contraseña SHALL exigir un usuario verificado en red (`getUser`), actualizar la contraseña, cerrar sesión y redirigir a `/login?resetSuccess=1`.

#### Scenario: Restablecer sin sesión de recuperación
- **WHEN** `getUser` no devuelve usuario al restablecer la contraseña
- **THEN** la acción devuelve el error `expiredResetLink`

### Requirement: Admin route protection
`proxy.ts` SHALL redirigir a `/login` (conservando el prefijo de locale) toda ruta admin protegida (`/dashboard`, `/houses`, `/cuotas`, `/pagos`, `/pagos-reportados`, `/reporte`, `/gastos`, `/gastos-pagados`) cuando `getClaims()` no devuelve claims. El layout `(admin)` SHALL repetir la verificación con `getClaims()` como defensa en profundidad.

#### Scenario: Visitante sin sesión
- **WHEN** una petición sin claims de Supabase llega a `/dashboard`
- **THEN** el proxy redirige a `/login`

### Requirement: Admin write actions use requireAdmin
Las Server Actions de admin SHALL autorizar escrituras con `getUser()` (verificado en red) mediante un helper `requireAdmin` y devolver `sessionExpired` si no hay usuario.

#### Scenario: Sesión expirada en una acción
- **WHEN** una Server Action de admin se ejecuta y `getUser()` falla
- **THEN** devuelve el error `sessionExpired` sin escribir datos

### Requirement: Admin RLS by community membership
Todas las tablas de negocio SHALL tener RLS habilitado, y las políticas de admin MUST usar `condo_is_community_admin(community_id)`, que consulta `condo_community_admins` con `auth.uid()`. Los residentes no tienen políticas propias; `anon` no tiene acceso a las tablas.

#### Scenario: Usuario autenticado que no es admin de la comunidad
- **WHEN** un usuario autenticado ajeno a `condo_community_admins` consulta `condo_houses` con el cliente de cookies
- **THEN** RLS no devuelve filas

### Requirement: Resident login with house number and PIN
El login de residente SHALL validar `house_number` (no vacío) y `pin` (exactamente 4 dígitos) con zod y verificar las credenciales llamando a la RPC `condo_verify_house_pin(p_house_number, p_pin)` con el cliente service-role. Un resultado exitoso SHALL devolver `house_id` y `community_id`; si falta alguno SHALL devolver `verifyFailed`. Las razones `not_found` y `no_pin` SHALL mostrar el mismo error genérico `invalidCredentials`. Un login correcto SHALL redirigir a `/mi-comunidad`.

#### Scenario: Casa inexistente
- **WHEN** el número de casa no existe
- **THEN** la acción devuelve `invalidCredentials`, igual que para una casa sin PIN

#### Scenario: PIN incorrecto
- **WHEN** el PIN no coincide y el contador no llega al límite
- **THEN** la acción devuelve `wrongPinAttempts` con los intentos restantes

#### Scenario: Error de la RPC
- **WHEN** la RPC devuelve un error
- **THEN** la acción devuelve `verifyFailed`

### Requirement: PIN lockout
`condo_verify_house_pin` MUST comparar el PIN con `crypt()` de pgcrypto contra `pin_hash`, incrementar `failed_pin_attempts` en cada fallo y, al llegar a 5 intentos fallidos, fijar `pin_locked_until` a 15 minutos en el futuro. Mientras `pin_locked_until` sea futuro SHALL responder `locked` sin comparar el PIN. Un acierto SHALL reiniciar el contador y el bloqueo. La función SHALL ser `SECURITY INVOKER` con `EXECUTE` concedido solo a `service_role`.

#### Scenario: Quinto fallo
- **WHEN** el PIN es incorrecto por quinta vez consecutiva
- **THEN** la casa queda bloqueada 15 minutos y la acción devuelve el error `locked`

#### Scenario: Intento durante el bloqueo
- **WHEN** se envía un PIN (incluso correcto) mientras `pin_locked_until` es futuro
- **THEN** la RPC responde `locked` y no cambia el contador

#### Scenario: Acierto tras fallos
- **WHEN** el PIN es correcto y no hay bloqueo vigente
- **THEN** `failed_pin_attempts` vuelve a 0 y `pin_locked_until` a nulo

### Requirement: Resident session cookie
Tras un login válido el sistema SHALL emitir un JWT HS256 firmado con `RESIDENT_SESSION_SECRET` con claims `house_id`, `community_id`, `role: 'resident'` y `grace_period_days` (leído de la comunidad al iniciar sesión), expiración de 30 días, guardado en la cookie httpOnly `condo_resident_session` (`sameSite: lax`, `path: /`, `secure` en producción, `maxAge` 30 días).

#### Scenario: Logout de residente
- **WHEN** el residente cierra sesión
- **THEN** se borra la cookie y se redirige a `/resident-login`

### Requirement: Resident token verification
La verificación SHALL devolver nulo si la firma es inválida, el token expiró, el `role` no es `resident` o falta algún claim con el tipo esperado. Si `RESIDENT_SESSION_SECRET` no está definido, firmar y verificar SHALL lanzar error.

#### Scenario: Token manipulado
- **WHEN** la cookie contiene un JWT con firma inválida o claims incompletos
- **THEN** `verifyResidentToken` devuelve nulo y el usuario se trata como sin sesión

#### Scenario: Sesión vencida
- **WHEN** han pasado más de 30 días desde el login
- **THEN** el token deja de verificarse y el residente debe iniciar sesión de nuevo

### Requirement: Resident route protection
`proxy.ts` SHALL redirigir a `/resident-login` (conservando el prefijo de locale) las rutas `/mi-comunidad`, `/mi-hogar`, `/mis-pagos`, `/mi-cartera` y `/perfil` cuando la cookie de residente falte o no verifique, usando `verifyResidentToken` localmente. El layout `(resident)` y las páginas SHALL repetir la comprobación con `getResidentSession()`. La ruta raíz SHALL redirigir a `/dashboard` si hay claims de admin, si no a `/mi-comunidad` si hay sesión de residente, y si no a `/login`.

#### Scenario: Residente sin cookie
- **WHEN** se accede a `/mis-pagos` sin cookie de residente válida
- **THEN** el proxy redirige a `/resident-login`

### Requirement: Resident data access scoped by house
Toda lectura o escritura de residente SHALL usar el cliente service-role y MUST filtrar por el `house_id` de la sesión firmada, nunca por un identificador enviado por el cliente. Las Server Actions de residente SHALL devolver `sessionExpired` (o nulo en consultas auxiliares) cuando no haya sesión válida.

#### Scenario: Reporte de pago
- **WHEN** un residente con sesión válida reporta un pago
- **THEN** el registro se asocia a la casa de la sesión, sin importar lo que envíe el cliente

#### Scenario: Acción sin sesión
- **WHEN** una acción de residente se invoca sin cookie válida
- **THEN** devuelve `sessionExpired` y no escribe datos

### Requirement: Cron endpoint authentication
Los Route Handlers `/api/cron/generate-cuotas` y `/api/cron/generate-expenses` SHALL responder 401 salvo que el encabezado `Authorization` sea exactamente `Bearer <CRON_SECRET>`.

#### Scenario: Cron sin secreto
- **WHEN** se invoca el endpoint sin el encabezado correcto
- **THEN** responde 401 `Unauthorized`

## Known Limitations
- `CLAUDE.md` y `PLAN.md` mencionan un helper `getResidentScopedClient(houseId)`; no existe en el código. Las lecturas de residente llaman directamente a `createServiceClient()` y filtran con `.eq('house_id', ...)` en cada consulta (`lib/resident/queries.ts`, layout `(resident)`, acciones `residentPayments*`), por lo que el aislamiento depende de la disciplina por consulta. Además `getCommunityBalanceData` deliberadamente NO filtra por casa (datos agregados de toda la comunidad para residentes).
- El login de admin no comprueba pertenencia a `condo_community_admins`: cualquier usuario de Supabase Auth con sesión válida pasa `getClaims()` en el proxy y el layout; solo RLS limita los datos que ve. El registro público de Supabase Auth podría estar abierto fuera de la app (el filtro por allowlist solo está en la Server Action `signup`).
- `requireAdmin` no es un módulo compartido: cada archivo de acciones (`houses`, `payments`, `cuotas`, `gastos`, etc.) define su propia copia; `login` y la ruta `/auth/confirm` no usan allowlist.
- `signup` ignora errores de `linkAdminToCommunity` (retorna sin avisar si no se pudo crear/vincular la comunidad) y redirige igualmente a verificar correo.
- `condo_verify_house_pin` busca la casa solo por `house_number`, sin `community_id`; la unicidad ahora es por comunidad (`UNIQUE(community_id, house_number)`), así que con una segunda comunidad con números solapados el login sería ambiguo/incorrecto. Hoy es single-tenant.
- Los docs mencionan un Route Handler para el login de residente; en el código es la Server Action `residentLogin`.
- El conteo de intentos y el bloqueo son por casa, no por IP ni dispositivo; no hay limitación de tasa adicional fuera de la RPC. La respuesta `locked` revela que existe la casa y que está bloqueada, mientras `not_found`/`no_pin` son indistinguibles entre sí.
- `grace_period_days` se copia al token (residente, 30 días) y a una cookie sin firmar (admin, 30 días) y solo se refresca al volver a iniciar sesión; no hay UI para editarlo.
- La sesión del residente no se revoca al resetear el PIN: un token ya emitido sigue válido hasta expirar (30 días), no se valida contra la BD.
- `/mi-hogar` sigue protegida en el proxy aunque ya no se enlaza desde el sidebar.
- `PLAN.md`/migración inicial describen `condo_communities.admin_id` como el admin; fue reemplazado por `condo_community_admins` (admin_id eliminado en migraciones posteriores). Las migraciones indican que los admins adicionales se provisionan manualmente en BD; sin embargo el `signup` sí agrega a cualquier correo de la allowlist.

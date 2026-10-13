# resident-portal Specification

## Purpose
Portal de autoservicio del residente: inicia sesión con casa + PIN (sin cuenta de Supabase Auth), ve el balance de la comunidad, sus propias cuotas y estados, su cartera (saldo a favor y abonos reportados) y el detalle de recibos, y puede reportar un pago para revisión del admin. Toda lectura se hace con el cliente service-role y alcance por `house_id` tomado de la sesión firmada. Interfaz en español por defecto con inglés secundario (`next-intl`).

## Requirements

### Requirement: Resident session and route gating
Las rutas `/mi-comunidad`, `/mi-hogar`, `/mis-pagos`, `/mi-cartera` (y subrutas) y `/perfil` SHALL requerir la cookie firmada `condo_resident_session` (JWT HS256 con `jose`, 30 días), verificada en `proxy.ts` y en cada página con `getResidentSession()`. Sin sesión válida SHALL redirigir a `/resident-login`. La raíz `/` SHALL redirigir según la sesión: admin a `/dashboard`, residente a `/mi-comunidad`, otro a `/login`.

#### Scenario: Sin cookie
- **WHEN** un visitante abre `/mis-pagos` sin la cookie
- **THEN** es redirigido a `/resident-login`

#### Scenario: Token inválido
- **WHEN** la cookie tiene firma incorrecta, expirada o claims faltantes
- **THEN** `verifyResidentToken` devuelve `null` y se trata como sin sesión

### Requirement: Resident login by house and PIN
El login SHALL validar `{house_number, pin}` con zod y verificarlos en el servidor con la RPC `condo_verify_house_pin` usando el cliente service-role. Un fallo SHALL devolver un mensaje según el motivo: bloqueo (`locked`), credenciales inválidas (`not_found` / `no_pin`) o PIN incorrecto con intentos restantes. Al éxito SHALL leer `grace_period_days` de la comunidad devuelta, crear la sesión y redirigir a `/mi-comunidad`.

#### Scenario: PIN incorrecto
- **WHEN** el residente envía un PIN errado y la RPC devuelve `attempts_remaining`
- **THEN** se muestra el error con el número de intentos restantes

#### Scenario: Cuenta bloqueada
- **WHEN** la RPC devuelve `reason = 'locked'`
- **THEN** se muestra el error de bloqueo y no se crea sesión

### Requirement: House-scoped data access
Toda lectura de datos propios del residente (casa, residentes, cuotas, pagos, reportes de pago, créditos, recibos) SHALL ejecutarse con el cliente service-role filtrando por `house_id` de la sesión firmada, nunca por un valor enviado por el cliente. El detalle de un lote de pago (`getResidentPaymentBatch`) SHALL filtrar por `house_id` y `payment_batch_id`; un lote que no pertenezca a la casa SHALL resultar en `notFound()`. Las cuotas con `deleted_at` SHALL excluirse.

#### Scenario: Lote de otra casa
- **WHEN** un residente abre `/mi-cartera/<batchId>` de un lote de otra casa
- **THEN** la consulta no devuelve filas y se responde 404

#### Scenario: Reporte de pago
- **WHEN** un residente envía un reporte de pago
- **THEN** el `house_id` insertado es el de su sesión, ignorando cualquier valor del cliente

### Requirement: Resident navigation
El menú lateral del residente SHALL tener cuatro entradas: "Reportar pago" (`/mi-cartera?report=1`), Mi comunidad (`/mi-comunidad`), Mis cuotas (`/mis-pagos`) y Mi cartera (`/mi-cartera`). Mis cuotas SHALL mostrar un icono de atención cuando exista una cuota vencida (según `isOverdue` con la gracia de la sesión); Mi cartera SHALL mostrarlo cuando el último reporte (por `created_at`) esté `rejected`. `/perfil` y `/mi-hogar` existen como rutas pero no aparecen en este menú.

#### Scenario: Cuota vencida
- **WHEN** la casa tiene una cuota no pagada vencida más allá de la gracia
- **THEN** el ítem "Mis cuotas" muestra el indicador de atención

### Requirement: Community balance view
`/mi-comunidad` (página de aterrizaje) SHALL mostrar dos tarjetas comunitarias por moneda: "saldo disponible" (suma de créditos positivos de todas las casas) y "saldo pendiente" (`outstandingByCurrency` sobre todas las cuotas de la comunidad con vencimiento hasta fin del mes actual); sin desglose por casa. El saludo SHALL usar `owner_name` o, si no existe, el número/nombre de casa.

#### Scenario: Sin saldos
- **WHEN** no hay créditos ni deuda en el alcance
- **THEN** cada tarjeta muestra el texto de vacío en lugar de importes

### Requirement: Community expenses visibility
`/mi-comunidad` SHALL mostrar a los residentes el total de gastos de la comunidad y su desglose (nombre de la plantilla, fecha, monto y etiqueta `paid`/`pending`) filtrable por mes y año o "todo el año". `/mi-hogar` SHALL mostrar además el balance comunitario del mes (esperado, cobrado, pendiente, a favor, gastos pagados y gastos totales). Todo en importes por moneda, sin sumar entre monedas.

#### Scenario: Filtro de mes
- **WHEN** el residente elige un mes y año
- **THEN** el total y la lista incluyen solo gastos con `period_date` en ese mes

#### Scenario: Todo el año
- **WHEN** activa el chip "todo el año"
- **THEN** el selector de mes se deshabilita y se muestran los gastos del año completo

### Requirement: Own installments and status
`/mis-pagos` SHALL listar las cuotas de la propia casa con el estado de `displayStatus`: `paid`, `overdue` (`isOverdue` con la gracia de la sesión), `advance`, `partial` o `pending`. SHALL filtrarse por mes/año de vencimiento o todo el año (por defecto el mes actual). Con cuotas vencidas SHALL mostrar una tarjeta con el total vencido por moneda, la fecha más antigua, las vencidas y un botón `tel:` si la comunidad tiene teléfono; si no, una tarjeta de "al día".

#### Scenario: Cuota vencida
- **WHEN** hay cuotas vencidas
- **THEN** la tarjeta de vencidos suma `amount - amount_paid` por moneda e indica desde cuándo

#### Scenario: Todo al día
- **WHEN** no hay cuotas vencidas
- **THEN** se muestra la tarjeta de "al día"

### Requirement: Resident debt rule uses grace period
Cuando el portal calcula deuda de la propia casa (`/mi-hogar`) SHALL usar `computeMorosos` sin `dueBy` con la `grace_period_days` de la sesión (snapshot tomado en el login), y MUST NOT re-consultar la gracia en cada página.

#### Scenario: Gracia cambiada en base de datos
- **WHEN** el admin cambia `grace_period_days` directamente en la DB
- **THEN** el residente ve el nuevo valor solo después de cerrar sesión y volver a entrar

### Requirement: Wallet and reported payments ledger
`/mi-cartera` SHALL mostrar el saldo a favor de la casa y el total de reportes `pending` por moneda, y una lista de reportes de la casa (`pending`, `confirmed`, `rejected`) filtrable por mes/año de `payment_date`. Si el último reporte creado está `rejected` SHALL mostrar un aviso con el motivo. Un reporte confirmado con `resulting_payment_batch_id` SHALL enlazar a `/mi-cartera/<batchId>`.

#### Scenario: Reporte rechazado
- **WHEN** el último reporte está `rejected` con `rejection_reason`
- **THEN** se muestra el aviso destructivo con el motivo

#### Scenario: Recarga de saldo confirmada
- **WHEN** un reporte `confirmed` no tiene cuotas etiquetadas y tiene `resulting_receipt_number`
- **THEN** se muestra como "crédito agregado" con `#NNNN` y sin enlace al detalle si no hay lote

### Requirement: Receipt detail
`/mi-cartera/[batchId]` SHALL mostrar el recibo de un lote de pago de la propia casa: número de recibo (`#NNNN` con ceros a la izquierda o texto "sin recibo"), fecha, monto recibido por moneda, referencia, notas y una tabla de conceptos (cuota o recarga de saldo) con fecha, tasa, monto convertido y monto. SHALL ocultar el campo "registrado por" y mostrar el desglose por moneda aplicada solo cuando difiere de lo recibido.

#### Scenario: Pago cruzado de monedas
- **WHEN** el monto aplicado por moneda difiere del recibido
- **THEN** se muestra además el bloque "aplicado por moneda"

### Requirement: Report a payment
Un residente SHALL poder reportar un pago (`reportPayment`) con monto positivo, moneda, fecha, referencia (<=120), notas (<=500), cuotas opcionales y captura de imagen opcional (<=5 MB). El reporte SHALL insertarse en `condo_payment_reports` como `pending` y MUST NOT modificar cuotas, pagos ni créditos. Los `installment_ids` SHALL revalidarse contra cuotas no pagadas de la casa de la sesión. Sin sesión SHALL devolver error.

#### Scenario: Cuota ajena
- **WHEN** el reporte incluye un `installment_id` de otra casa
- **THEN** ese id se descarta y el reporte se guarda sin él

#### Scenario: Archivo no imagen
- **WHEN** la captura no es `image/*` o supera 5 MB
- **THEN** la acción devuelve error de validación y no inserta nada

### Requirement: Reference USD hint
Al reportar un pago en Bs o USDT, el formulario SHALL mostrar una equivalencia de referencia en USD usando la tasa BCV (Bs) o Binance (USDT) vigente a la fecha del pago, y SHALL ocultarla si la tasa no existe o tiene más de 24 horas (`isRateFresh`). Este valor es solo informativo y MUST NOT almacenarse.

#### Scenario: Tasa vencida
- **WHEN** la última tasa tiene más de 24 horas respecto a la fecha de referencia
- **THEN** no se muestra equivalencia en USD

### Requirement: Profile view
`/perfil` SHALL mostrar solo datos de la propia casa: número/nombre, propietario, teléfono y correo del propietario (si existen) y la lista de residentes registrados con su teléfono.

#### Scenario: Datos opcionales ausentes
- **WHEN** la casa no tiene correo del propietario
- **THEN** el campo no se muestra

### Requirement: Per-currency display
Todos los importes del portal SHALL mostrarse por moneda sin sumar USD/Bs/USDT, con formato `es-VE` (punto de miles, coma decimal) y etiquetas de visualización: USD "$ Efectivo", Bs "Bs.", USDT "Binance".

#### Scenario: Dos monedas
- **WHEN** una tarjeta tiene importes en USD y Bs
- **THEN** se muestran en líneas separadas con su etiqueta

### Requirement: Internationalization
El enrutado SHALL usar `next-intl` con locales `es` (por defecto) y `en`, `localePrefix: 'as-needed'` (sin prefijo para `es`) y `localeDetection: false`. Los mensajes SHALL cargarse desde `messages/<locale>.json`. Los textos del portal SHALL pasar por `useTranslations`/`getTranslations` (espacios `residentHome`, `residentCuotas`, `residentPayments`, `residentPerfil`, `residentAuth`), y las fechas SHALL formatearse con el locale activo de `date-fns` (`es`/`enUS`).

#### Scenario: Ruta por defecto
- **WHEN** se visita `/mi-comunidad`
- **THEN** se sirve en español sin prefijo de idioma; `/en/mi-comunidad` sirve el inglés

## Known Limitations
- Los residentes SÍ ven gastos de la comunidad (`/mi-comunidad` y `/mi-hogar` leen `condo_expenses` con service-role), lo que contradice el spec `gastos` ("los residentes nunca ven gastos") y la expectativa de que los gastos son solo de admin.
- Los residentes ven agregados de toda la comunidad (créditos, cuotas y pagos de todas las casas) en cifras sumadas sin desglose por casa; no ven filas de otras casas, pero `getCommunityBalanceData` no filtra por `house_id` ni por `community_id` (usa service-role sin filtro de comunidad), y `condo_communities` se lee con `.limit(1)`. Con más de una comunidad en la base, el balance mezclaría comunidades.
- Los nombres de ruta confunden: `/mis-pagos` muestra cuotas ("Mis cuotas") y `/mi-cartera` muestra abonos y recibos; el archivo `MisPagosClient` corresponde a `/mi-cartera`. No existe un historial plano de `condo_payments` para el residente: el historial visible son los reportes de pago y, por enlace, el recibo del lote; `getResidentPortalData` carga `payments` pero ninguna página lo usa.
- Un pago registrado directamente por el admin (sin reporte previo del residente) no aparece en la lista de `/mi-cartera`, que se basa en `condo_payment_reports`.
- `/mi-hogar` sigue activo y protegido pero fuera del menú (reemplazado por `/mi-comunidad`, 2026-09-18); `/perfil` tampoco está en el menú.
- `LocaleSwitcher` existe pero no se usa; hoy el idioma solo cambia escribiendo el prefijo `/en`. PLAN/CLAUDE.md mencionan i18n es/en como objetivo; no se verificó que `messages/en.json` tenga paridad total con `es.json`.
- La gracia del residente es un snapshot de la sesión (30 días de vigencia); cambios en DB tardan hasta un nuevo login.
- `/mi-comunidad` "saldo pendiente" usa el alcance fin de mes y no la gracia, mientras que `/mi-hogar` y las tarjetas de vencidos usan gracia: tres criterios distintos de "deuda" en el portal.
- La lista de cuotas pasa `inst.amount` (monto total) como importe, no el saldo restante, aunque el total vencido sí usa saldo.
- El reporte de pago acepta cualquier moneda sin validar contra las cuotas elegidas, y la fecha del pago sin validar que no sea futura.
- CLAUDE.md menciona `getResidentScopedClient(houseId)`; en el código no existe ese helper, el patrón se implementa con `createServiceClient()` y filtros `.eq('house_id', ...)` manuales en `lib/resident/queries.ts`.

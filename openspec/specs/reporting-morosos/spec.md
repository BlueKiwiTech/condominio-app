# reporting-morosos Specification

## Purpose
Responder "quién debe qué y desde cuándo" para el admin: dashboard con KPIs, lista de morosos, estado de cuotas calculado en vivo, reporte mensual por casa y reporte de tasa de cambio. Todo se calcula en el momento de la consulta con funciones puras (`lib/reporting/*`, `lib/cuotas/status.ts`) usando `date-fns`; nada de "moroso" o "vencida" se almacena. Los importes siempre se agregan por moneda (USD / Bs / USDT) y nunca se suman entre monedas.

## Requirements

### Requirement: Overdue status is computed, never stored
El estado "vencida" SHALL calcularse en tiempo de consulta con `isOverdue(dueDate, status, graceDays, today)`: una cuota es vencida cuando `status != 'paid'` y `differenceInCalendarDays(today, parseISO(dueDate)) > graceDays`. El tipo `InstallmentStatus` SHALL ser `pending | partial | paid | advance`; `overdue` MUST NOT ser un valor persistido.

#### Scenario: Cuota con un día de atraso y sin gracia
- **WHEN** una cuota `pending` venció ayer y `graceDays = 0`
- **THEN** `isOverdue` devuelve `true`

#### Scenario: Cuota dentro del periodo de gracia
- **WHEN** una cuota `pending` venció hace 3 días y `graceDays = 5`
- **THEN** `isOverdue` devuelve `false`

#### Scenario: Cuota pagada
- **WHEN** `status = 'paid'`, sin importar la fecha
- **THEN** `isOverdue` devuelve `false`

### Requirement: Grace period configuration
El periodo de gracia SHALL leerse de `condo_communities.grace_period_days` (entero, default 0). Para el admin se SHALL resolver con `resolveAdminGracePeriodDays`: primero la cookie httpOnly `condo_admin_grace_period_days` (fijada al iniciar sesión, 30 días) y, si falta, consultando `condo_communities`, con 0 como último recurso. No SHALL existir UI en la app para editar este valor.

#### Scenario: Cookie ausente
- **WHEN** el admin abre el dashboard o el reporte sin la cookie de gracia
- **THEN** el valor se obtiene de `condo_communities.grace_period_days` (o 0 si no hay fila)

### Requirement: Morosos computation
`computeMorosos` SHALL agrupar por casa y por moneda (`house_id::currency`) las cuotas no pagadas con saldo `amount - amount_paid > 0`, devolviendo por grupo: `owed` (suma de saldos), `owedSince` (el `due_date` más antiguo) y `daysOverdue = max(0, differenceInCalendarDays(today, parseISO(owedSince)))`. El resultado SHALL ordenarse por `daysOverdue` descendente. Una casa con deuda en dos monedas MUST aparecer como dos filas.

#### Scenario: Casa con deuda en USD y Bs
- **WHEN** una casa debe cuotas en USD y en Bs
- **THEN** `computeMorosos` devuelve dos filas para esa casa, una por moneda, sin sumarlas

#### Scenario: Fecha más antigua
- **WHEN** una casa tiene tres cuotas vencidas en USD con distintos `due_date`
- **THEN** la fila muestra `owed` como la suma de los saldos y `owedSince` como el menor `due_date`

#### Scenario: Cuota con saldo cero
- **WHEN** una cuota no pagada tiene `amount_paid >= amount`
- **THEN** no contribuye a ninguna fila de morosos

### Requirement: Morosos inclusion rule
Sin parámetro `dueBy`, `computeMorosos` SHALL incluir solo cuotas con atraso estrictamente mayor que `gracePeriodDays` (`differenceInCalendarDays(today, due) > gracePeriodDays`). Con `dueBy`, SHALL incluir toda cuota no pagada con `due_date <= dueBy` e ignorar el periodo de gracia. El conteo de casas morosas (`countDelinquentHouses`) SHALL contar `house_id` distintos.

#### Scenario: Regla con gracia (portal del residente)
- **WHEN** se llama sin `dueBy` y `gracePeriodDays = 5`
- **THEN** una cuota con 5 días de atraso no se incluye y una con 6 días sí

#### Scenario: Regla con dueBy (dashboard)
- **WHEN** se llama con `dueBy = fin del mes actual`
- **THEN** se incluyen las cuotas no pagadas con vencimiento hasta ese día, aunque aún estén dentro del periodo de gracia o vencan más adelante en el mes

### Requirement: Dashboard shared scope
En el dashboard admin, las tarjetas "Morosos" y "Saldo pendiente" SHALL compartir el alcance: toda cuota no pagada con `due_date <= lastDayOfMonth` (`endOfMonth(hoy)`). El dashboard MUST pasar `lastDayOfMonth` como `dueBy` a `computeMorosos`. Las cuotas generadas por adelantado para meses posteriores SHALL NOT inflar ninguna cifra, y la etiqueta de alcance SHALL mostrar esa fecha según el locale.

#### Scenario: Cuota del mes siguiente
- **WHEN** existe una cuota `pending` con vencimiento en el mes siguiente
- **THEN** no aparece en morosos ni en saldo pendiente del dashboard

#### Scenario: Cuota que vence más tarde este mes
- **WHEN** una cuota `pending` vence el día 28 y hoy es día 10
- **THEN** cuenta tanto en morosos como en saldo pendiente del dashboard

### Requirement: Dashboard KPIs
El dashboard (`/dashboard`) SHALL mostrar por moneda: cobrado del mes con variación contra el mes anterior, casas morosas sobre el total, saldo pendiente, gastos pendientes del mes y la tarjeta de tasa de cambio. "Cobrado" SHALL ser base caja (`payment_date` en el mes). `percentChange` SHALL devolver `null` si el mes previo es 0 y el actual no, y 0 si ambos son 0. El subtítulo SHALL mostrar los días restantes hasta fin de mes.

#### Scenario: Pago tardío de una cuota vieja
- **WHEN** hoy se registra un pago por una cuota de hace tres meses
- **THEN** cuenta en "Cobrado" del mes de `payment_date`, no del mes de vencimiento

#### Scenario: Sin base de comparación
- **WHEN** no hubo cobros el mes anterior en una moneda y sí este mes
- **THEN** se muestra el texto "sin mes previo" para esa moneda en lugar de un porcentaje

### Requirement: Dashboard series and tables
El dashboard SHALL mostrar una serie de ingresos de 6 meses (`monthlyIncomeSeries`) con un gráfico independiente por moneda (USD, Bs, USDT), nunca uno combinado; una tabla de morosos (casa, propietario, adeudado, desde, días de atraso) y los 8 lotes de pago más recientes agrupados por `payment_batch_id`.

#### Scenario: Moneda sin cobros
- **WHEN** ninguna de las 6 puntas de la serie tiene monto > 0 para una moneda
- **THEN** el gráfico de esa moneda se reemplaza por un mensaje de vacío

### Requirement: Per-currency aggregation
Toda agregación de reportes (cobrado, pendiente, saldo a favor, gastos, totales del reporte mensual, morosos) SHALL llevarse por moneda (`USD`, `Bs`, `USDT`) y MUST NOT sumarse entre monedas. Los créditos a favor (`creditsByCurrency`) SHALL sumar solo saldos de `condo_house_credits` con `balance > 0`.

#### Scenario: Totales con varias monedas
- **WHEN** hay cobros en USD y en Bs en el mismo mes
- **THEN** el KPI muestra una línea por moneda y ningún total combinado

### Requirement: Saldo pendiente per currency
`outstandingByCurrency` SHALL sumar `amount - amount_paid` de toda cuota con `status != 'paid'` y `due_date <= endOfMonth(today)`, agrupado por moneda.

#### Scenario: Cuota parcial
- **WHEN** una cuota `partial` de 100 tiene `amount_paid = 40` y vence este mes
- **THEN** aporta 60 al saldo pendiente de su moneda

### Requirement: Cuota template status summary
`summarizeTemplate` SHALL resumir las cuotas de una plantilla en conteos `paid`, `partial`, `overdue`, `pending`, casas y `totalAmount`, clasificando en el orden `paid`, `overdue` (con gracia), `partial`, resto `pending`. Las plantillas recurrentes SHALL limitarse a un periodo representativo; las especiales SHALL considerar todas sus cuotas.

#### Scenario: Plantilla recurrente con horizonte generado
- **WHEN** una plantilla recurrente tiene cuotas generadas para varios meses
- **THEN** el resumen refleja solo el periodo representativo, no la suma de todos los periodos

#### Scenario: Cuota parcial vencida
- **WHEN** una cuota `partial` está vencida más allá de la gracia
- **THEN** se cuenta como `overdue`, no como `partial`

### Requirement: Monthly report
La página `/reporte` SHALL mostrar, para un mes elegido (últimos 12), una fila por casa y moneda con esperado, pagado, pendiente, saldo a favor (`condo_house_credits`) y estado, ordenada por `house_number`. El estado SHALL ser `paid` si todas están pagadas; si no `overdue` si alguna lo está (con gracia); si no `partial` si alguna es parcial; si no `pending`. Los filtros y la ordenación SHALL ser del cliente y el pie SHALL mostrar totales por moneda de las filas filtradas.

#### Scenario: Casa totalmente pagada
- **WHEN** todas las cuotas de una casa en una moneda vencen en el mes y están `paid`
- **THEN** su fila tiene estado `paid` y pendiente 0

#### Scenario: Filtro por moneda
- **WHEN** el admin filtra por Bs
- **THEN** la tabla y los totales del pie solo incluyen filas en Bs

### Requirement: Exchange rate report
La página `/reporte/tasa-de-cambio` SHALL cargar el historial de `condo_exchange_rates` de los últimos 12 meses y mostrar, para el mes elegido, un gráfico de línea combinado BCV/Binance (un punto por día, con el último valor del día para cada tipo) y una tabla de filas crudas ordenadas de la más reciente a la más antigua.

#### Scenario: Varias actualizaciones el mismo día
- **WHEN** un tipo de tasa se actualiza dos veces en un día
- **THEN** el gráfico usa el valor de la última actualización de ese día

### Requirement: Admin-only access and data source
Las rutas `/dashboard`, `/reporte` (y subrutas), `/houses`, `/cuotas`, `/pagos` y relacionadas SHALL requerir sesión de admin (`getClaims()` en `proxy.ts`, redirigiendo a `/login`). El dashboard y el reporte SHALL leer con el cliente Supabase del admin (RLS), excluyendo filas con `deleted_at` en cuotas y gastos. Un error de consulta SHALL mostrar un `Alert` destructivo en lugar de datos vacíos silenciosos.

#### Scenario: Sin sesión de admin
- **WHEN** un visitante sin claims de Supabase abre `/dashboard`
- **THEN** `proxy.ts` lo redirige a `/login` (con prefijo de locale si aplica)

#### Scenario: Error de consulta
- **WHEN** falla la consulta de cuotas, casas o gastos del dashboard
- **THEN** se muestra un mensaje de error destructivo antes del contenido

### Requirement: Calendar-day-safe date math
Todo cálculo de días, vencimientos o rangos de mes en reportes SHALL usar `date-fns` (`differenceInCalendarDays`, `parseISO`, `startOfMonth`, `endOfMonth`, `isWithinInterval`) y MUST NOT dividir cadenas UTC a mano para aritmética de fechas.

#### Scenario: Días de atraso
- **WHEN** se calcula `daysOverdue` para un `due_date` `YYYY-MM-DD`
- **THEN** se usa `differenceInCalendarDays(today, parseISO(due_date))`

### Requirement: No export facility
La aplicación NO SHALL ofrecer exportación (CSV, PDF o impresión) de dashboard, morosos ni reporte mensual; solo existe visualización en pantalla.

#### Scenario: Reporte mensual
- **WHEN** el admin abre `/reporte`
- **THEN** no hay acción de exportar; los datos solo se ven en la tabla

## Known Limitations
- `outstandingByCurrency` filtra por `status != 'paid'`, de modo que incluye cuotas `advance` y no excluye saldos <= 0, mientras que `computeMorosos` sí descarta saldos <= 0. Ambas cifras pueden diferir levemente para el mismo alcance.
- En `computeMorosos` con `dueBy`, `daysOverdue` se calcula contra `today` y puede ser 0 para casas incluidas solo por vencer más tarde en el mes; la tabla del dashboard las muestra como morosas con 0 días.
- La comparación `due_date <= dueBy` usa `parseISO(due_date).getTime() <= endOfMonth(...)`, que funciona porque `endOfMonth` cae a las 23:59:59.999 locales; depende de que `due_date` sea solo fecha.
- `daysOverdue` se mide contra el `due_date` más antiguo sin restar el periodo de gracia.
- "Cobrado" (`collectedInMonth`) suma todos los `condo_payments`, incluyendo abonos a billetera sin cuota (`installment_id` nulo desde la migración `payments_wallet_only`); por tanto incluye dinero que aún no se ha aplicado a una cuota.
- El reporte mensual y el dashboard descargan todas las cuotas, casas y pagos de una vez y filtran en el cliente (aceptado para una comunidad pequeña); no hay paginación.
- El mensaje de error del dashboard y del reporte está en español fijo en `page.tsx`, no pasa por `next-intl`.
- Las fechas de `owedSince` se formatean con `new Date(m.owedSince)` en la tabla del dashboard (cadena `YYYY-MM-DD` interpretada como UTC), a diferencia del resto, que usa `parseISO`; puede mostrar el día anterior en husos horarios negativos (Venezuela, UTC-4).
- CLAUDE.md describe la app como de una sola comunidad, pero el esquema es multi-comunidad (`community_id`, `condo_community_admins`; ver spec `multitenancy`). Las consultas del dashboard dependen de RLS para el alcance; `resolveAdminGracePeriodDays` consulta `condo_communities` con `.limit(1)` sin filtrar por comunidad (RLS lo acota a las comunidades del admin).
- El estado `advance` existe en el tipo pero `isOverdue` lo trata como cualquier no pagada: una cuota `advance` con vencimiento pasado puede mostrarse como vencida.
- Las tarjetas del dashboard dependen del `Date` del navegador (`useMemo(() => new Date())`), no de la hora del servidor ni de la zona de la comunidad.

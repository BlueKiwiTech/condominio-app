# gastos Specification

## Purpose
Registrar los gastos del condominio (salientes): fijos recurrentes y variables finitos, marcarlos como pagados y mostrar los pendientes del mes en el dashboard. La gestión (crear, pagar, eliminar) es solo de admin; los residentes ven únicamente el resumen comunitario de solo lectura (ver `resident-portal`).

## Requirements

### Requirement: Template/instance model
Los gastos SHALL modelarse como plantilla comunitaria (`condo_expense_templates`, sin `house_id`) e instancias (`condo_expenses`) con `UNIQUE(template_id, period_date)`.

#### Scenario: Instancia desnormaliza datos
- **WHEN** se genera una instancia
- **THEN** copia `category_id`, `provider` y `currency` de la plantilla, de modo que renombrar la categoría después no reescribe el historial

### Requirement: Fixed expenses use the rolling horizon
Una plantilla `kind = 'fixed'` (cadencia obligatoria, `installment_count` nulo) SHALL generar instancias inmediatamente al crearse y luego por el cron diario `/api/cron/generate-expenses`, usando el mismo `computeHorizonEnd` que cuotas.

#### Scenario: Gasto fijo recién creado
- **WHEN** el admin crea un gasto fijo
- **THEN** se generan de inmediato las instancias hasta el horizonte, cada una con `amount = default_amount` y `status = 'pending'`

#### Scenario: Idempotencia del cron
- **WHEN** el cron corre dos veces el mismo día
- **THEN** no se duplican instancias

### Requirement: Variable expenses are finite
Una plantilla `kind = 'variable'` SHALL generar las `installment_count` instancias en la creación, con fechas escalonadas, repartiendo `default_amount` (total) con `splitAmount` en centavos enteros y absorbiendo el resto en la última. No SHALL intervenir el cron.

#### Scenario: Suma exacta
- **WHEN** se crea un gasto variable de 100.00 en 3 cuotas
- **THEN** la suma de las 3 instancias es exactamente 100.00

### Requirement: Mark as paid
Marcar un gasto como pagado SHALL permitir ajustar `amount`, fijar `paid_date` y notas, y cambiar `status` a `paid`; SHALL rechazar un gasto ya pagado y SHALL registrar un audit log `expense.mark_paid`. Los estados son solo `pending` y `paid` (sin mora ni pagos parciales). SHALL además registrar la moneda de pago elegida y, cuando alguna de las dos monedas sea Bs, la tasa, según los requisitos de moneda y tasa de pago.

#### Scenario: Gasto ya pagado
- **WHEN** el admin intenta pagar un gasto con `status = 'paid'`
- **THEN** la acción devuelve el error `alreadyPaid`

#### Scenario: Gasto en USD pagado en USD
- **WHEN** el admin paga un gasto en `USD` con moneda de pago `USD`
- **THEN** el diálogo no muestra tasa, `amount` se sobrescribe con el monto final y `exchange_rate`, `exchange_rate_type`, `reference_amount`, `reference_currency`, `paid_currency` y `paid_amount` quedan nulos

#### Scenario: Gasto en USDT
- **WHEN** el admin paga un gasto en `USDT`
- **THEN** la moneda de pago se muestra fija como `USDT`, no hay tasa ni conversión y las seis columnas de moneda de pago y tasa quedan nulas

### Requirement: Soft delete
Eliminar un gasto o plantilla SHALL poner `deleted_at` y nunca borrar la fila; todas las lecturas (listado, cron, dashboard) SHALL filtrar `deleted_at IS NULL`. Un gasto pagado o en espera de tasa SHALL NOT poder eliminarse; una plantilla con cualquier instancia pagada o en espera SHALL NOT poder eliminarse.

#### Scenario: Eliminar gasto pagado
- **WHEN** el admin intenta eliminar un gasto pagado
- **THEN** falla con `cannotDeletePaid`

#### Scenario: Eliminar plantilla sin pagos
- **WHEN** el admin elimina una plantilla sin instancias pagadas ni en espera
- **THEN** la plantilla y sus instancias `pending` quedan con `deleted_at`

#### Scenario: Eliminar gasto en espera
- **WHEN** el admin intenta eliminar un gasto `on_hold`
- **THEN** falla con `cannotDeletePaid` y el gasto sigue en espera

#### Scenario: Eliminar plantilla con un gasto en espera
- **WHEN** el admin intenta eliminar una plantilla con un gasto `on_hold`
- **THEN** falla con `hasPayments` y nada queda con `deleted_at`

### Requirement: Activate and deactivate
Desactivar una plantilla SHALL marcar `active = false` y anular (soft delete) sus instancias `pending`; las pagadas SHALL permanecer.

#### Scenario: Desactivar plantilla fija
- **WHEN** el admin desactiva una plantilla fija
- **THEN** el cron deja de generarle instancias y sus pendientes desaparecen de las vistas

### Requirement: Expense categories
El sistema SHALL ofrecer categorías por comunidad con alta y baja desde la UI. El nombre SHALL ser único (error `duplicateName`) y una categoría en uso SHALL NOT poder eliminarse (error `inUse`, violación de FK).

#### Scenario: Categoría en uso
- **WHEN** el admin elimina una categoría referenciada por plantillas
- **THEN** falla con el error `inUse`

### Requirement: Dashboard pending expenses
El dashboard SHALL mostrar "Gastos pendientes del mes": suma de `amount` de instancias `pending` u `on_hold` cuyo `period_date` cae en el mes actual, agrupada por moneda.

#### Scenario: Monedas mixtas
- **WHEN** hay gastos pendientes en USD y Bs
- **THEN** se muestran totales separados por moneda, nunca sumados

#### Scenario: Gasto en espera
- **WHEN** un gasto del mes está `on_hold`
- **THEN** sigue incluido en los gastos pendientes del mes, en su moneda original

### Requirement: Admin-only management
Las tablas de gastos SHALL tener RLS solo para admins de la comunidad, y toda acción de escritura SHALL exigir `requireAdmin`. La visibilidad del residente SHALL limitarse a lecturas de solo lectura vía el cliente service-role del portal.

#### Scenario: Escritura desde residente
- **WHEN** una sesión de residente intenta crear, pagar o eliminar un gasto
- **THEN** la operación es rechazada (no existe acción ni política que lo permita)

### Requirement: Expense payment currency selection
Al marcar un gasto como pagado, el diálogo SHALL mostrar siempre la moneda de pago: para gastos en `USD` o `Bs`, un selector con `USD` y `Bs` cuyo valor por defecto es la moneda del gasto; para gastos en `USDT`, la moneda `USDT` fija. El input del monto SHALL ser lo realmente pagado en la moneda de pago, prellenado con el monto convertido y editable.

#### Scenario: Moneda de pago por defecto
- **WHEN** se abre el diálogo de un gasto en `USD`
- **THEN** el selector muestra `USD` y el monto prellenado es el `amount` del gasto

#### Scenario: Cambio de moneda de pago
- **WHEN** el admin cambia la moneda de pago de `USD` a `Bs` en un gasto de 110 USD
- **THEN** aparece el combo de tasa y el monto se recalcula con la tasa elegida

#### Scenario: Gasto en USDT sin selector
- **WHEN** se abre el diálogo de un gasto en `USDT`
- **THEN** la moneda de pago aparece fija como `USDT`, sin selector ni combo de tasa

#### Scenario: Gasto en USDT con otra moneda de pago
- **WHEN** una petición paga un gasto en `USDT` indicando `USD` o `Bs` como moneda de pago
- **THEN** la acción devuelve `invalidData` y no escribe nada

### Requirement: Expense payment rate selection
El combo de tasa SHALL mostrarse siempre que la moneda del gasto o la de pago sea `Bs` (opciones `bcv`, `eur` y `custom`), y `markExpensePaid` SHALL exigir un `exchange_rate_type` en esos casos. Para `bcv` y `eur` SHALL usar la tasa vigente a `paid_date` (`getExchangeRatesAsOf`) si es fresca (menos de 24 h respecto de `paid_date`); si no lo es, el gasto SHALL quedar en espera de tasa. Para `custom`, el admin SHALL ingresar una tasa mayor a 0 (Bs por unidad), sin regla de frescura.

#### Scenario: Tasa fresca elegida
- **WHEN** el admin paga un gasto en Bs con `paid_date` de hoy y elige `bcv` con una tasa de menos de 24 h
- **THEN** el pago se registra con esa tasa

#### Scenario: Tasa vencida
- **WHEN** el admin elige `eur` y la tasa `eur` tiene 24 h o más respecto de `paid_date`
- **THEN** el gasto queda `on_hold` sin error y sin `exchange_rate`, y se paga solo cuando llega la tasa

#### Scenario: Tasa personalizada
- **WHEN** el admin elige `custom` e ingresa una tasa de 905,50
- **THEN** el pago se registra con esa tasa sin consultar `condo_exchange_rates`

#### Scenario: Tasa personalizada inválida
- **WHEN** el admin elige `custom` con una tasa de 0, negativa, vacía o tan pequeña que se redondea a 0 con 4 decimales
- **THEN** la acción devuelve un error de validación y no escribe nada

#### Scenario: Tipo de tasa ausente
- **WHEN** se invoca el pago de un gasto con alguna moneda en Bs sin `exchange_rate_type`
- **THEN** la acción devuelve un error de validación y no escribe nada

#### Scenario: Opciones y valores del combo
- **WHEN** el combo se muestra
- **THEN** ofrece solo BCV dólar, BCV euro y personalizada (sin Binance), y cada tasa guardada muestra su valor vigente a `paid_date`; las ausentes o vencidas siguen siendo elegibles y muestran el aviso "quedará en espera de tasa"

#### Scenario: Cambio de fecha de pago
- **WHEN** el admin cambia `paid_date` en el diálogo
- **THEN** el combo vuelve a mostrar las tasas vigentes a la nueva fecha

#### Scenario: Sin tasa en dólares a dólares
- **WHEN** la moneda del gasto y la de pago son `USD`
- **THEN** el diálogo no muestra el combo de tasa

### Requirement: Cross-currency expense payment
Cuando la moneda de pago difiere de la del gasto, `markExpensePaid` SHALL conservar `amount` y guardar `paid_currency`, `paid_amount` (el monto ingresado, mayor a 0), `exchange_rate` y `exchange_rate_type`. La tasa es el multiplicador entre las monedas: de `USD` a `Bs` el monto prellenado es `amount × tasa` y de `Bs` a `USD` es `amount ÷ tasa`, redondeado a 2 decimales.

#### Scenario: Gasto en USD pagado en Bs con tasa dólar
- **WHEN** se paga un gasto de 110,00 USD en Bs con tasa `bcv` 881,0664
- **THEN** el monto prellenado es 96.917,30 Bs y la fila guarda `paid_currency = 'Bs'`, `paid_amount = 96917.30` y `exchange_rate_type = 'bcv'`, con `amount = 110.00` sin cambios

#### Scenario: Gasto en USD pagado en Bs con tasa euro
- **WHEN** se paga un gasto de 110,00 USD en Bs con tasa `eur` 991,1645
- **THEN** el monto prellenado es 109.028,10 Bs

#### Scenario: Gasto en Bs pagado en USD
- **WHEN** se paga un gasto de 9.857,30 Bs en USD con tasa `eur` 985,73
- **THEN** el monto prellenado es 10,00 USD y la fila guarda `paid_currency = 'USD'`, `paid_amount = 10.00` y `amount = 9857.30` sin cambios

#### Scenario: Monto pagado ajustado
- **WHEN** el admin cambia el monto prellenado de 96.917,30 a 96.900,00 Bs antes de guardar
- **THEN** `paid_amount` guarda 96900.00 y `amount` conserva 110.00

#### Scenario: Monto pagado inválido
- **WHEN** el monto pagado es 0, negativo o vacío en un pago con conversión
- **THEN** la acción devuelve un error de validación y no escribe nada

### Requirement: Same-currency Bs expense reference amount
Cuando un gasto en `Bs` se paga en `Bs`, `markExpensePaid` SHALL sobrescribir `amount` con el monto final y guardar `exchange_rate`, `exchange_rate_type`, `reference_amount` (`amount / exchange_rate`, 2 decimales) y `reference_currency` (`USD` para `bcv` y `custom`, `EUR` para `eur`); `paid_currency` y `paid_amount` SHALL quedar nulos.

#### Scenario: Equivalente con tasa BCV dólar
- **WHEN** se paga un gasto de 8.800,00 Bs en Bs con tasa `bcv` 880,00
- **THEN** la fila guarda `reference_amount = 10.00` y `reference_currency = 'USD'`

#### Scenario: Equivalente con tasa BCV euro
- **WHEN** se paga un gasto de 9.857,30 Bs en Bs con tasa `eur` 985,73
- **THEN** la fila guarda `reference_amount = 10.00` y `reference_currency = 'EUR'`

#### Scenario: Tasa personalizada con más de 4 decimales
- **WHEN** el admin ingresa una tasa personalizada de 905,123456
- **THEN** se guarda `exchange_rate = 905.1235` y el equivalente se calcula con esa tasa redondeada

#### Scenario: Monto ajustado
- **WHEN** el admin cambia el monto de 8.800,00 a 8.900,00 Bs antes de guardar
- **THEN** `amount` y `reference_amount` se calculan con el monto ajustado

### Requirement: Paid expenses show the payment and rate used
La lista de gastos pagados SHALL mostrar, para cada gasto con conversión o tasa registrada, el monto pagado con su moneda (`paid_amount`, `paid_currency`), la tasa con su tipo y, si existe, el equivalente con su moneda de referencia, en columnas separadas del monto original. Ningún total ni agregado de gastos SHALL usar `paid_amount` ni `reference_amount`; los agregados siguen agrupados por la moneda original del gasto.

#### Scenario: Gasto en USD pagado en Bs
- **WHEN** el admin abre la lista de pagados y hay un gasto de 110,00 USD pagado en Bs
- **THEN** la fila muestra el monto original en USD y, en columnas aparte, el monto pagado en Bs, la tasa y su tipo

#### Scenario: Gasto en Bs pagado en Bs
- **WHEN** hay un gasto en Bs pagado en Bs con tasa `bcv`
- **THEN** la fila muestra la tasa, el tipo `bcv` y el equivalente en USD junto al monto en Bs

#### Scenario: Gastos sin conversión ni tasa
- **WHEN** el gasto pagado está en `USD` pagado en `USD`, en `USDT` o fue pagado antes de este change
- **THEN** las columnas de monto pagado, tasa y equivalente muestran "—"

#### Scenario: Pagos fuera de los agregados
- **WHEN** hay gastos en Bs, USD y USDT en el mismo mes y el admin abre el dashboard
- **THEN** "Gastos pendientes del mes" sigue agrupado por moneda original y ningún `paid_amount` ni `reference_amount` interviene en ningún agregado

### Requirement: Expenses on hold for a missing BCV rate
Al pagar un gasto con alguna moneda en `Bs` (la del gasto o la de pago) con tasa `bcv` o `eur` sin tasa fresca a `paid_date`, `markExpensePaid` SHALL dejarlo en `status = 'on_hold'`, guardando `paid_date`, `notes`, `exchange_rate_type` y lo pagado (`paid_currency` y `paid_amount` si la moneda de pago difiere de la del gasto, o el monto final en `amount` si coincide), sin `exchange_rate` ni equivalente, y responder éxito indicando que quedó en espera.

#### Scenario: Gasto en USD pagado en Bs sin tasa
- **WHEN** el admin paga un gasto de 110 USD en Bs con tasa `bcv`, escribe 96.900 Bs como monto pagado y no hay tasa fresca a `paid_date`
- **THEN** el gasto queda `on_hold` con `amount = 110`, `paid_currency = 'Bs'`, `paid_amount = 96900` y `exchange_rate_type = 'bcv'`, sin `exchange_rate`

#### Scenario: Gasto en Bs pagado en USD sin tasa
- **WHEN** el admin paga un gasto de 9.857,30 Bs en USD con tasa `eur`, escribe 9,95 USD y no hay tasa `eur` fresca
- **THEN** el gasto queda `on_hold` con `amount = 9857.30`, `paid_currency = 'USD'` y `paid_amount = 9.95`

#### Scenario: Pagar un gasto ya en espera
- **WHEN** el admin intenta marcar como pagado un gasto que ya está `on_hold`
- **THEN** la acción devuelve `alreadyOnHold` y el gasto no cambia

#### Scenario: Gasto en Bs pagado en Bs sin tasa
- **WHEN** el admin paga un gasto en Bs en Bs con tasa `bcv`, escribe 8.800 Bs como monto final y no hay tasa fresca
- **THEN** el gasto queda `on_hold` con `amount = 8800` y `exchange_rate_type = 'bcv'`, sin `exchange_rate` ni `reference_amount`

### Requirement: Custom and rate-free expense payments are never held
La tasa `custom`, un gasto en `USD` pagado en `USD` y un gasto en `USDT` SHALL procesarse al momento y SHALL NOT quedar en espera.

#### Scenario: Tasa personalizada
- **WHEN** el admin paga un gasto con alguna moneda en Bs con tasa `custom`, aunque no haya tasas guardadas
- **THEN** se procesa al momento y el gasto queda `paid`

#### Scenario: Gasto sin tasa
- **WHEN** el admin paga un gasto en USD en USD, o un gasto en USDT
- **THEN** se procesa al momento como siempre

### Requirement: Expense dialog allows a rate without a fresh value
Cuando no hay tasa fresca de `bcv` o `eur` a `paid_date`, el diálogo de pago SHALL permitir elegir esa opción en lugar de deshabilitarla, mostrando el aviso "quedará en espera de tasa", SHALL NOT prellenar el monto pagado y SHALL permitir confirmar cuando el admin lo escribe. La tasa `custom` SHALL seguir sin aviso.

#### Scenario: Fecha sin tasas
- **WHEN** el admin cambia la fecha de pago a un día sin tasa BCV fresca y elige `bcv`
- **THEN** la opción es elegible, aparece el aviso "quedará en espera de tasa" y el monto pagado queda vacío hasta que lo escriba

#### Scenario: Confirmar sin monto
- **WHEN** el admin intenta confirmar un pago en espera sin escribir el monto pagado
- **THEN** la acción no se envía y se muestra el error de monto

### Requirement: Held expenses are released automatically
Un gasto `on_hold` SHALL liberarse cuando exista tasa fresca a su `paid_date` para su `exchange_rate_type`: SHALL guardar `exchange_rate` y pasar a `paid`; si es Bs pagado en Bs, SHALL guardar además `reference_amount` y `reference_currency`; si la moneda de pago difiere, SHALL NOT recalcular `paid_amount`. Cada liberación SHALL reclamarse con `release_claimed_at` para no procesarse dos veces.

#### Scenario: Gasto en USD pagado en Bs liberado
- **WHEN** llega la tasa BCV a la `paid_date` de un gasto `on_hold` de 110 USD pagado en Bs
- **THEN** queda `paid` con `exchange_rate` completada y `paid_amount` igual al que escribió el admin

#### Scenario: Gasto en Bs pagado en Bs liberado
- **WHEN** llega la tasa a la `paid_date` de un gasto `on_hold` en Bs pagado en Bs
- **THEN** queda `paid` con `exchange_rate`, `reference_amount` calculado con su `amount` guardado y `reference_currency`

#### Scenario: Liberación simultánea
- **WHEN** el cron y una tasa manual intentan liberar el mismo gasto
- **THEN** solo uno lo reclama y el gasto se paga una sola vez

## Known Limitations

- Los residentes SÍ ven el total y desglose de gastos de la comunidad en `/mi-comunidad` y `/mi-hogar` (lectura service-role, sin filtrar por `community_id`). Esto contradice el diseño original ("residentes nunca ven gastos"); pendiente confirmar si es intencional.

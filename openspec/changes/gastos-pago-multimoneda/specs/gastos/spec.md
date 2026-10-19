## MODIFIED Requirements

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

## ADDED Requirements

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
El combo de tasa SHALL mostrarse siempre que la moneda del gasto o la de pago sea `Bs` (opciones `bcv`, `eur` y `custom`), y `markExpensePaid` SHALL exigir un `exchange_rate_type` en esos casos. Para `bcv` y `eur` SHALL usar la tasa vigente a `paid_date` (`getExchangeRatesAsOf`) si es fresca (menos de 24 h respecto de `paid_date`) o devolver `staleExchangeRate` sin escribir. Para `custom`, el admin SHALL ingresar una tasa mayor a 0 (Bs por unidad), sin regla de frescura.

#### Scenario: Tasa fresca elegida
- **WHEN** el admin paga un gasto en Bs con `paid_date` de hoy y elige `bcv` con una tasa de menos de 24 h
- **THEN** el pago se registra con esa tasa

#### Scenario: Tasa vencida
- **WHEN** el admin elige `eur` y la tasa `eur` tiene 24 h o más respecto de `paid_date`
- **THEN** la acción devuelve `staleExchangeRate` y el gasto sigue `pending`

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
- **THEN** ofrece solo BCV dólar, BCV euro y personalizada (sin Binance), y cada tasa guardada muestra su valor vigente a `paid_date`, con las ausentes o vencidas deshabilitadas con aviso

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

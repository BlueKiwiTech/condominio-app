## MODIFIED Requirements

### Requirement: Mark as paid
Marcar un gasto como pagado SHALL permitir ajustar `amount`, fijar `paid_date` y notas, y cambiar `status` a `paid`; SHALL rechazar un gasto ya pagado y SHALL registrar un audit log `expense.mark_paid`. Los estados son solo `pending` y `paid` (sin mora ni pagos parciales). Para gastos en `Bs`, SHALL además registrar la tasa y el equivalente según los requisitos de tasa de pago.

#### Scenario: Gasto ya pagado
- **WHEN** el admin intenta pagar un gasto con `status = 'paid'`
- **THEN** la acción devuelve el error `alreadyPaid`

#### Scenario: Gasto en USD o USDT
- **WHEN** el admin marca como pagado un gasto en `USD` o `USDT`
- **THEN** el diálogo no muestra tasa, el pago se registra como hasta ahora y `exchange_rate`, `exchange_rate_type`, `reference_amount` y `reference_currency` quedan nulos

## ADDED Requirements

### Requirement: Expense payment rate selection
Al marcar como pagado un gasto en `Bs`, el diálogo SHALL mostrar un combo de tasa con `bcv`, `eur`, `binance` y `custom`, y `markExpensePaid` SHALL exigir un `exchange_rate_type`. Para `bcv`, `eur` y `binance` SHALL usar la tasa vigente a `paid_date` (`getExchangeRatesAsOf`) y devolver `staleExchangeRate` sin escribir si no es fresca (menos de 24 h respecto de `paid_date`). Para `custom`, el admin SHALL ingresar una tasa mayor a 0, sin regla de frescura.

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
- **WHEN** el admin elige `custom` con una tasa de 0, negativa o vacía
- **THEN** la acción devuelve un error de validación y no escribe nada

#### Scenario: Tipo de tasa ausente
- **WHEN** se invoca el pago de un gasto en Bs sin `exchange_rate_type`
- **THEN** la acción devuelve un error de validación y no escribe nada

#### Scenario: Valor de cada opción en el combo
- **WHEN** el diálogo se abre para un gasto en Bs
- **THEN** cada opción `bcv`, `eur` y `binance` muestra su valor vigente a `paid_date`, y las ausentes o vencidas aparecen deshabilitadas con aviso

#### Scenario: Cambio de fecha de pago
- **WHEN** el admin cambia `paid_date` en el diálogo
- **THEN** el combo vuelve a mostrar las tasas vigentes a la nueva fecha

### Requirement: Expense payment reference amount
Al pagar un gasto en `Bs`, `markExpensePaid` SHALL guardar en la fila `exchange_rate`, `exchange_rate_type`, `reference_amount` (igual a `amount / exchange_rate`, redondeado a 2 decimales) y `reference_currency`: `USD` para `bcv` y `custom`, `EUR` para `eur` y `USDT` para `binance`. El `amount` SHALL permanecer en la moneda del gasto, sin convertirse.

#### Scenario: Equivalente con tasa BCV dólar
- **WHEN** se paga un gasto de 8.800,00 Bs con tasa `bcv` 880,00
- **THEN** la fila guarda `reference_amount = 10.00` y `reference_currency = 'USD'`

#### Scenario: Equivalente con tasa BCV euro
- **WHEN** se paga un gasto de 9.857,30 Bs con tasa `eur` 985,73
- **THEN** la fila guarda `reference_amount = 10.00` y `reference_currency = 'EUR'`

#### Scenario: Tasa personalizada con más de 4 decimales
- **WHEN** el admin ingresa una tasa personalizada de 905,123456
- **THEN** se guarda `exchange_rate = 905.1235` y el equivalente se calcula con esa tasa redondeada

#### Scenario: Monto ajustado
- **WHEN** el admin cambia el monto de 8.800,00 a 8.900,00 Bs antes de guardar
- **THEN** `amount` y `reference_amount` se calculan con el monto ajustado

### Requirement: Paid expenses show the rate used
La lista de gastos pagados SHALL mostrar, para cada gasto con tasa registrada, la tasa usada, su tipo y el equivalente con su moneda de referencia, en columnas separadas del monto. Ningún total ni agregado de gastos (incluido "Gastos pendientes del mes" del dashboard) SHALL usar `reference_amount`; los agregados siguen agrupados por la moneda original del gasto.

#### Scenario: Gasto pagado en Bs
- **WHEN** el admin abre la lista de pagados y hay un gasto en Bs pagado con tasa `bcv`
- **THEN** la fila muestra la tasa, el tipo `bcv` y el equivalente en USD junto al monto en Bs

#### Scenario: Gastos sin tasa
- **WHEN** el gasto pagado está en `USD`, `USDT` o fue pagado antes de este change
- **THEN** las columnas de tasa y equivalente muestran "—"

#### Scenario: Equivalentes fuera de los agregados
- **WHEN** hay gastos en Bs, USD y USDT en el mismo mes y el admin abre el dashboard
- **THEN** "Gastos pendientes del mes" sigue agrupado por moneda original y ningún `reference_amount` interviene en ningún agregado

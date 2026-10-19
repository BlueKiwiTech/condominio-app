## ADDED Requirements

### Requirement: Community balance per currency
El saldo de la comunidad SHALL calcularse por moneda (`USD`, `Bs`, `USDT`), sin mezclar monedas y sin saldo inicial, como recibido menos gastos pagados. Recibido SHALL ser lo aplicado a cuotas en la moneda con que se pagó (`funding_breakdown`, o `amount_paid` en la moneda de la fila), sin contar las filas de depósito con `installment_id` nulo, más los `condo_house_credits.balance` en esa moneda. Gastos pagados SHALL ser los gastos `paid` u `on_hold` en la moneda con que salió el dinero.

#### Scenario: Pago en la moneda de la cuota
- **WHEN** una casa paga 100 USD a una cuota de 100 USD y no hay gastos
- **THEN** el saldo en USD es 100

#### Scenario: Pago en Bs a una cuota en USD
- **WHEN** una casa paga 88.000 Bs a una cuota de 100 USD con tasa 880
- **THEN** el saldo en Bs es 88.000 y el saldo en USD no cambia

#### Scenario: Sobrante a saldo a favor
- **WHEN** una casa abona 130 USD a una cuota de 100 USD y 30 quedan como saldo a favor
- **THEN** el saldo en USD es 130 (100 aplicados más 30 de crédito) y la fila de depósito del sobrante no se cuenta aparte

#### Scenario: Consumo de saldo a favor
- **WHEN** el saldo a favor de 30 USD se aplica después a otra cuota
- **THEN** el saldo en USD no cambia, porque el dinero ya se había contado como recibido

#### Scenario: Gasto pagado en otra moneda
- **WHEN** se paga un gasto de 110 USD con 96.900 Bs
- **THEN** el saldo en Bs baja 96.900 y el saldo en USD no cambia

#### Scenario: Gasto en espera de tasa
- **WHEN** un gasto está `on_hold`
- **THEN** su monto ya cuenta como gastado en la moneda con que se pagó

### Requirement: Expense payment blocked by insufficient community balance
`markExpensePaid` SHALL calcular el monto que sale de caja y su moneda (`paid_amount` en la moneda de pago si difiere de la del gasto; si no, el monto final en la moneda del gasto, y `USDT` en `USDT`) y SHALL rechazar el pago, sin escribir nada, con un error que indique saldo disponible, monto necesario y faltante en esa moneda cuando el saldo no alcance; SHALL aplicar igual si el gasto quedaría `paid` o `on_hold`, y SHALL NOT volver a validar al liberar un gasto en espera.

#### Scenario: Saldo suficiente
- **WHEN** el saldo en USD es 500 y el admin paga un gasto de 110 USD en USD
- **THEN** el gasto se paga y el saldo en USD pasa a 390

#### Scenario: Saldo insuficiente
- **WHEN** el saldo en USD es 80 y el admin intenta pagar un gasto de 110 USD en USD
- **THEN** la acción devuelve el error de saldo insuficiente con disponible 80, necesario 110 y faltante 30, y el gasto sigue `pending`

#### Scenario: Se valida la moneda de pago
- **WHEN** el saldo en USD es 500 y en Bs es 0, y el admin paga un gasto de 110 USD en Bs
- **THEN** la acción se bloquea por el saldo en Bs y no por el de USD

#### Scenario: Saldo justo
- **WHEN** el saldo en USD es exactamente 110 y el gasto es de 110 USD
- **THEN** el gasto se paga

#### Scenario: Gasto que quedaría en espera
- **WHEN** el gasto quedaría `on_hold` por falta de tasa y el saldo de su moneda de pago no alcanza
- **THEN** la acción se bloquea igual y no queda ningún gasto en espera

#### Scenario: Liberación de un gasto en espera
- **WHEN** llega la tasa y se libera un gasto `on_hold`
- **THEN** se paga sin validar el saldo de nuevo

### Requirement: Community balance in the expense payment dialog
El diálogo "Marcar gasto como pagado" SHALL mostrar el saldo disponible de la comunidad en la moneda de pago elegida y, si el monto a pagar lo supera, SHALL avisar con el faltante y deshabilitar la confirmación; la acción del servidor SHALL revalidar siempre.

#### Scenario: Saldo suficiente en el diálogo
- **WHEN** el admin abre el diálogo de un gasto de 110 USD y el saldo en USD es 500
- **THEN** el diálogo muestra el saldo disponible de 500 USD y permite confirmar

#### Scenario: Saldo insuficiente en el diálogo
- **WHEN** el admin elige pagar en Bs un gasto cuyo monto en Bs supera el saldo en Bs
- **THEN** el diálogo muestra el aviso con el faltante en Bs y la confirmación está deshabilitada

#### Scenario: Cambio de moneda de pago
- **WHEN** el admin cambia la moneda de pago o el monto
- **THEN** el saldo mostrado y la comprobación se recalculan para la nueva moneda y monto

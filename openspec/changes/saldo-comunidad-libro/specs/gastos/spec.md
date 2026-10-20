# Spec Delta

## MODIFIED Requirements

### Requirement: Community balance per currency
El saldo de la comunidad SHALL leerse del balance guardado por moneda (`USD`, `Bs`, `USDT`) de la capacidad `saldo-comunidad`, sin mezclar monedas. Suma lo recibido por abonos aplicados, el saldo inicial y los ajustes, y resta los gastos `paid` u `on_hold` en la moneda con que salió el dinero. SHALL NOT recalcularse desde `condo_payments`, `condo_house_credits` ni `condo_expenses` en cada consulta.

#### Scenario: Pago en la moneda de la cuota
- **WHEN** una casa paga 100 USD a una cuota de 100 USD y no hay gastos
- **THEN** el saldo en USD es 100

#### Scenario: Pago en Bs a una cuota en USD
- **WHEN** una casa paga 88.000 Bs a una cuota de 100 USD con tasa 880
- **THEN** el saldo en Bs es 88.000 y el saldo en USD no cambia

#### Scenario: Sobrante a saldo a favor
- **WHEN** una casa abona 130 USD a una cuota de 100 USD y 30 quedan como saldo a favor
- **THEN** el saldo en USD es 130 y el sobrante no se cuenta aparte

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
`markExpensePaid` SHALL calcular el monto que sale de caja y su moneda (`paid_amount` en la moneda de pago si difiere de la del gasto; si no, el monto final en la moneda del gasto, y `USDT` en `USDT`) y SHALL pagar el gasto y restar el balance en una sola operación atómica, rechazándola sin escribir nada, con saldo disponible, monto necesario y faltante, si el saldo no alcanza. SHALL aplicar igual si el gasto quedaría `paid` o `on_hold`, y SHALL NOT volver a validar ni restar al liberar un gasto en espera.

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

#### Scenario: Pagos simultáneos
- **WHEN** el saldo en USD es 100 y se pagan casi a la vez dos gastos de 80 USD
- **THEN** uno se paga y el otro se rechaza por saldo insuficiente

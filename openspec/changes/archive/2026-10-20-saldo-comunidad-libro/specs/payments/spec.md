# Spec Delta

## ADDED Requirements

### Requirement: Applied payments register the received money in the community balance
`applyPaymentAllocation` SHALL guardar las filas de `condo_payments` del lote y el movimiento `payment_in` por el dinero recibido (`amount_received` en su moneda) en una sola operación atómica, referenciada por el lote. Si el movimiento no puede registrarse, el lote SHALL NOT quedar guardado. Un pago en espera no suma hasta aplicarse, y el saldo a favor consumido y el barrido de crédito SHALL NOT sumar.

#### Scenario: Abono del admin
- **WHEN** el admin registra 100 USD y el pago se aplica
- **THEN** quedan las filas del lote y un movimiento `payment_in` de 100 USD en el mismo momento

#### Scenario: Reporte del residente confirmado
- **WHEN** el admin confirma un reporte de 50.000 Bs
- **THEN** se registra un movimiento `payment_in` de 50.000 Bs referenciando el lote resultante

#### Scenario: Fallo al registrar el movimiento
- **WHEN** el movimiento no puede registrarse
- **THEN** no queda ninguna fila del lote en `condo_payments` y la acción devuelve error

#### Scenario: Pago solo con saldo a favor
- **WHEN** un pago con monto recibido cero se cubre con el saldo a favor de la casa
- **THEN** no se registra ningún movimiento `payment_in`

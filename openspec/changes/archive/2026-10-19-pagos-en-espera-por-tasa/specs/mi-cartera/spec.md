## MODIFIED Requirements

### Requirement: Resident report status and rejection reason
En Mi Cartera el residente SHALL ver sus reportes con estado `pending`, `on_hold`, `confirmed` o `rejected`; para `rejected` SHALL ver el motivo (`rejection_reason`) si existe, y para `confirmed` con número de recibo, el enlace a su detalle.

#### Scenario: Último reporte rechazado
- **WHEN** el reporte más recientemente enviado fue rechazado con motivo
- **THEN** Mi Cartera muestra el aviso con ese motivo

#### Scenario: Reporte en espera
- **WHEN** un reporte está `on_hold`
- **THEN** Mi Cartera lo muestra con la etiqueta "En espera de tasa" y sin enlace a recibo

## ADDED Requirements

### Requirement: Rate updates release held transactions
Al terminar `GET /api/cron/exchange-rate` y tras `setExchangeRate`, el sistema SHALL ejecutar `releaseHeldTransactions` con el cliente service-role para liberar reportes y gastos `on_hold` cuyas tasas ya estén disponibles. Un fallo de la liberación SHALL NOT afectar la inserción de tasas y SHALL reportarse en la respuesta con los conteos de liberados, en espera (su tasa aún falta) y fallidos.

#### Scenario: Cron libera lo pendiente
- **WHEN** el cron inserta las tasas del día y hay un reporte `on_hold` cuya fecha ya tiene tasa BCV fresca
- **THEN** el reporte se libera y la respuesta del cron incluye el conteo de liberados

#### Scenario: Tasa manual libera lo pendiente
- **WHEN** el admin fija una tasa BCV manual que cubre la fecha de un pago `on_hold`
- **THEN** se ejecuta la liberación y el pago se procesa

#### Scenario: Falla la liberación
- **WHEN** `releaseHeldTransactions` lanza una excepción durante el cron
- **THEN** las tasas ya quedaron insertadas, la respuesta reporta el fallo de liberación y `success` es `false`

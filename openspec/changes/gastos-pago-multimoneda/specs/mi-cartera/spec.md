## MODIFIED Requirements

### Requirement: Single cross-currency exception
La conversión entre monedas SHALL ocurrir únicamente al aplicar fondos recibidos a una cuota de otra moneda (`allocateFunds`, pivote USD) y al marcar como pagado un gasto en `Bs` (`markExpensePaid`, ver `gastos`). Reportes, morosos, saldos y totales SHALL seguir por moneda sin sumarlas. Los fondos sin aplicar SHALL permanecer en su moneda original y convertirse solo al aplicarse, a la tasa vigente ese día.

#### Scenario: Conversión Bs a USD
- **WHEN** 4.000 Bs se aplican a una cuota de 100 USD con tasa BCV 40
- **THEN** el equivalente es `amount / rate` para Bs a USD y `usd * rate` para USD a Bs

#### Scenario: Misma moneda
- **WHEN** origen y destino son la misma moneda
- **THEN** `convertAmount` devuelve el monto sin tasa

#### Scenario: Pago de un gasto en Bs
- **WHEN** el admin marca como pagado un gasto en Bs y elige una tasa
- **THEN** el equivalente se calcula y se guarda en la fila del gasto, sin sumarse a ningún total ni a saldos

#### Scenario: Agregados de gastos
- **WHEN** hay gastos en distintas monedas
- **THEN** los agregados siguen agrupados por la moneda original de cada gasto y ningún equivalente interviene

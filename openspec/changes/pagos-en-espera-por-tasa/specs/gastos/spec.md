## MODIFIED Requirements

### Requirement: Dashboard pending expenses
El dashboard SHALL mostrar "Gastos pendientes del mes": suma de `amount` de instancias `pending` u `on_hold` cuyo `period_date` cae en el mes actual, agrupada por moneda.

#### Scenario: Monedas mixtas
- **WHEN** hay gastos pendientes en USD y Bs
- **THEN** se muestran totales separados por moneda, nunca sumados

#### Scenario: Gasto en espera
- **WHEN** un gasto del mes está `on_hold`
- **THEN** sigue incluido en los gastos pendientes del mes, en su moneda original

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

## ADDED Requirements

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

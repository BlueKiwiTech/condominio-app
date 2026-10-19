## MODIFIED Requirements

### Requirement: Dashboard pending expenses
El dashboard SHALL mostrar "Gastos pendientes del mes": suma de `amount` de instancias `pending` u `on_hold` cuyo `period_date` cae en el mes actual, agrupada por moneda.

#### Scenario: Monedas mixtas
- **WHEN** hay gastos pendientes en USD y Bs
- **THEN** se muestran totales separados por moneda, nunca sumados

#### Scenario: Gasto en espera
- **WHEN** un gasto del mes está `on_hold`
- **THEN** sigue incluido en los gastos pendientes del mes, en su moneda original

## ADDED Requirements

### Requirement: Expenses on hold for a missing BCV rate
Al marcar como pagado un gasto en `Bs` con tasa `bcv` o `eur` sin tasa fresca a `paid_date`, `markExpensePaid` SHALL dejar el gasto en `status = 'on_hold'`, guardando `paid_date`, `amount`, `notes` y `exchange_rate_type` sin tasa ni equivalente, y responder éxito indicando que quedó en espera. La tasa `custom` SHALL procesarse al momento y `binance` SHALL conservar `staleExchangeRate`.

#### Scenario: Gasto sin tasa BCV
- **WHEN** el admin paga un gasto en Bs con tasa `bcv` y no hay tasa fresca a `paid_date`
- **THEN** el gasto queda `on_hold` con la fecha, el monto y el tipo de tasa elegidos, sin `exchange_rate` ni `reference_amount`

#### Scenario: Tasa personalizada
- **WHEN** el admin paga un gasto en Bs con tasa `custom`
- **THEN** se procesa al momento, aunque no haya tasas guardadas

#### Scenario: Tasa Binance vencida
- **WHEN** el admin elige `binance` y la tasa no es fresca
- **THEN** la acción devuelve `staleExchangeRate` y el gasto sigue `pending`

### Requirement: Held expenses are released automatically
Un gasto `on_hold` SHALL liberarse cuando exista tasa fresca a su `paid_date` para su `exchange_rate_type`: SHALL guardar `exchange_rate`, `reference_amount` y `reference_currency` y pasar a `paid`. Cada liberación SHALL reclamarse con `release_claimed_at` para no procesarse dos veces.

#### Scenario: Gasto liberado
- **WHEN** llega la tasa BCV a la `paid_date` de un gasto `on_hold` con `exchange_rate_type = 'bcv'`
- **THEN** el gasto queda `paid` con la tasa y el equivalente calculados con el `amount` guardado

#### Scenario: Liberación simultánea
- **WHEN** el cron y una tasa manual intentan liberar el mismo gasto
- **THEN** solo uno lo reclama y el gasto se paga una sola vez

## MODIFIED Requirements

### Requirement: Admin-only payment registration
El registro de un pago (`registerPayment`) SHALL requerir una sesión de admin verificada con `supabase.auth.getUser()` y SHALL validar la entrada con `registerPaymentSchema` (`house_id` uuid, `installment_ids` y `selected_special_ids` arreglos de uuids posiblemente vacíos, `currency` en `USD|Bs|USDT`, `amount_received` no negativo, `payment_date` `YYYY-MM-DD`, `reference` máx. 120, `notes` máx. 500).

#### Scenario: Sin sesión
- **WHEN** `getUser()` falla o no devuelve usuario
- **THEN** la acción devuelve el error `sessionExpired` y no escribe nada

#### Scenario: Entrada inválida
- **WHEN** la entrada no cumple el esquema zod
- **THEN** la acción devuelve el primer mensaje de validación sin tocar la base de datos

### Requirement: Eligibility window of 30 days
Un pago sin cuotas elegidas expresamente SHALL aplicarse únicamente a cuotas vencidas (sin límite hacia atrás) más las que vencen hasta 30 días calendario después de `payment_date` (`filterEligibleForConversionWindow`), para todas las monedas; las cuotas más lejanas SHALL permanecer sin tocar y el sobrante ir a saldo a favor. Las cuotas especiales elegidas expresamente SHALL NOT estar sujetas a la ventana.

#### Scenario: Cuota a 45 días
- **WHEN** hay una cuota con vencimiento 45 días después de `payment_date`, fondos de sobra y el admin no eligió ninguna cuota
- **THEN** la cuota no se paga y el sobrante queda como saldo a favor

#### Scenario: Especial elegida a 45 días
- **WHEN** el admin elige una cuota especial que vence 45 días después de `payment_date` y los fondos la cubren
- **THEN** la cuota se paga aunque esté fuera de la ventana

## ADDED Requirements

### Requirement: Admin selects special cuotas when paying
Al registrar un pago, el admin PUEDE elegir cuotas especiales pendientes de la casa (`selected_special_ids`). Si elige alguna, la asignación SHALL aplicarse únicamente a esas, de la más antigua a la más nueva y full-or-nothing en centavos, el sobrante SHALL ir a saldo a favor y la ventana de 30 días SHALL NOT aplicarles. Sin selección, el comportamiento SHALL ser el de siempre sobre todas las cuotas pendientes de la casa.

#### Scenario: Solo la especial elegida
- **WHEN** la casa debe una cuota recurrente vencida de 100 y una especial de 200, y el admin elige la especial y recibe 200
- **THEN** la especial pasa a `paid` y la recurrente vencida queda intacta

#### Scenario: Fondos para una de dos especiales
- **WHEN** el admin elige dos especiales de 150 y recibe 200
- **THEN** la más antigua de las dos se paga, la otra queda intacta y los 50 sobrantes van a saldo a favor

#### Scenario: Sin selección
- **WHEN** el admin no elige ninguna cuota especial
- **THEN** el pago se aplica como siempre, de la más antigua a la más nueva y dentro de la ventana de 30 días

#### Scenario: Sobrante a saldo a favor
- **WHEN** el admin elige una especial de 100 y recibe 130
- **THEN** la especial se paga y los 30 sobrantes aumentan el saldo a favor de la casa en esa moneda

#### Scenario: Conversión con selección
- **WHEN** el admin elige una especial en USD y registra un pago en Bs con tasa BCV fresca a `payment_date`
- **THEN** la especial se paga convirtiendo con esa tasa y `funding_breakdown` registra la tasa usada

### Requirement: Selected cuotas must be pending special cuotas of the house
`registerPayment` SHALL rechazar con un error de validación, sin escribir nada, una selección que incluya una cuota que no pertenezca a la casa, no esté pendiente (`pending` o `partial`), esté borrada o no provenga de una plantilla `special`.

#### Scenario: Cuota de otra casa
- **WHEN** `selected_special_ids` incluye una cuota de otra casa
- **THEN** la acción devuelve el error de selección inválida y no escribe nada

#### Scenario: Cuota no especial
- **WHEN** `selected_special_ids` incluye una cuota de una plantilla recurrente
- **THEN** la acción devuelve el error de selección inválida y no escribe nada

#### Scenario: Cuota ya pagada
- **WHEN** `selected_special_ids` incluye una cuota `paid` o borrada
- **THEN** la acción devuelve el error de selección inválida y no escribe nada

### Requirement: Held admin payments keep their cuota selection
Un pago del admin en espera de tasa SHALL conservar su selección: el reporte `on_hold` guarda `installment_ids` con las cuotas elegidas y `explicit_installments = true`, y al liberarse SHALL aplicarse a esas cuotas con las mismas reglas (solo las elegidas, sin ventana). Sin selección, `explicit_installments` SHALL ser falso y la liberación SHALL usar la regla de siempre.

#### Scenario: Pago con selección en espera
- **WHEN** el admin elige una especial lejana, registra un pago en Bs sin tasa BCV fresca y luego llega la tasa
- **THEN** el reporte `on_hold` guardó la selección con `explicit_installments = true` y al liberarse paga solo esa cuota

#### Scenario: Pago sin selección en espera
- **WHEN** el admin registra un pago en Bs sin tasa y sin elegir cuotas
- **THEN** el reporte queda con `explicit_installments = false` y al liberarse se aplica con la ventana de 30 días como antes

#### Scenario: Reporte del residente
- **WHEN** un residente reporta un pago con cuotas etiquetadas
- **THEN** el reporte guarda `explicit_installments = false` y su confirmación y liberación no cambian

### Requirement: Admin form lists special cuotas
El formulario de pago del admin SHALL listar, al elegir una casa, sus cuotas especiales pendientes (nombre, vencimiento, saldo y moneda) con casillas opcionales y un texto que indique que, si se marca alguna, el abono se aplica solo a ellas; la vista previa de asignación SHALL reflejar la selección.

#### Scenario: Casa sin cuotas especiales
- **WHEN** la casa elegida no tiene cuotas especiales pendientes
- **THEN** el formulario no muestra la lista y el abono se aplica como siempre

#### Scenario: Marcar una especial
- **WHEN** el admin marca una cuota especial
- **THEN** la vista previa muestra solo esa cuota como destino del abono, con el sobrante a saldo a favor

#### Scenario: Cambio de casa
- **WHEN** el admin cambia de casa
- **THEN** la selección se vacía y se listan las especiales de la nueva casa

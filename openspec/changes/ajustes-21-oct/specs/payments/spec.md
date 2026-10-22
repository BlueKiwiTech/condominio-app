# Spec Delta

## MODIFIED Requirements

### Requirement: Saldo a favor (credit) netting and write-back
Antes de asignar, el sistema SHALL sumar a `amount_received` el saldo existente en `condo_house_credits` de la casa y la MISMA moneda del pago, de modo que el saldo pueda completar el pago. La transacción SHALL reflejar solo lo recibido: las filas del lote por cuota y por sobrante suman `amount_received`, el recibo y el movimiento de la comunidad usan `amount_received`, y la parte cubierta con saldo previo SHALL mostrarse aparte como "saldo a favor aplicado". El saldo de esa casa+moneda SHALL quedar en saldo existente − saldo aplicado + sobrante del dinero recibido (`setHouseCredit`, upsert por `house_id,currency`); el sobrante SHALL NOT incluir saldo previo no usado. El saldo SHALL ser siempre por moneda, sin sumarse entre monedas.

#### Scenario: Pago cubierto solo con saldo existente
- **WHEN** `amount_received` es 0 y el saldo a favor en esa moneda cubre la cuota más antigua
- **THEN** la cuota se paga, se insertan filas con el recibo del lote, el recibo indica 0 recibido y el saldo aplicado, y el saldo se reduce en lo aplicado

#### Scenario: Sobrante
- **WHEN** quedan fondos del dinero recibido tras pagar todas las cuotas elegibles
- **THEN** se inserta una fila adicional sin `installment_id` (top-up de billetera) solo con ese sobrante, con el mismo lote y recibo, y el saldo se actualiza

#### Scenario: Recibido alcanza, saldo previo intacto
- **WHEN** la casa tiene 5 USD de saldo, el admin elige una especial de 24 USD y recibe 25 USD
- **THEN** la especial se paga con lo recibido, el saldo aplicado es 0, el sobrante de 1 se suma al saldo (que queda en 6), las filas del recibo suman 25 y el saldo de la comunidad sube 25

#### Scenario: Saldo previo completa el pago
- **WHEN** la casa tiene 5 USD de saldo, el admin elige una especial de 28 USD y recibe 25 USD
- **THEN** la especial se paga, el recibo muestra 25 recibidos y 3 de saldo a favor aplicado, el saldo queda en 2 y el saldo de la comunidad sube 25

#### Scenario: Sin selección con saldo previo
- **WHEN** la casa tiene 5 USD de saldo, debe dos cuotas de 12 USD y el admin recibe 20 USD
- **THEN** se pagan ambas con 20 recibidos y 4 de saldo aplicado, el recibo muestra 20 recibidos y el saldo queda en 1

### Requirement: Admin selects special cuotas when paying
Al registrar un pago o al confirmar un reporte del residente, el admin PUEDE elegir cuotas especiales pendientes de la casa (`selected_special_ids`). Si elige alguna, la asignación SHALL aplicarse únicamente a esas, de la más antigua a la más nueva y full-or-nothing en centavos, con el dinero recibido más el saldo a favor si hace falta, el sobrante del dinero recibido SHALL ir a saldo a favor y la ventana de 30 días SHALL NOT aplicarles. Sin selección, el comportamiento SHALL ser el de siempre sobre todas las cuotas pendientes de la casa.

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

### Requirement: Admin confirms a payment report
`confirmPaymentReport` SHALL requerir admin y un reporte `pending`, reservarlo con un candado corto antes de aplicar el dinero, ejecutar la misma asignación que `registerPayment` con los datos del reporte, marcarlo `confirmed` con su lote y recibo y escribir el audit `payment_report.confirm`. Sin `selected_special_ids`, usa todas las cuotas no `paid` ni borradas de la casa; con ellas (validadas como especiales pendientes de la casa), aplica solo a esas con `explicit_installments`. Si falta la tasa BCV, SHALL ponerlo `on_hold` sin registrar pago ni error, conservando la selección.

#### Scenario: Reporte sin cuotas etiquetadas
- **WHEN** el admin confirma un reporte con `installment_ids` vacío y sin elegir especiales
- **THEN** la asignación corre contra todas las cuotas pendientes de la casa dentro de la ventana de 30 días y el reporte queda enlazado al recibo

#### Scenario: Reporte ya resuelto
- **WHEN** el estado del reporte no es `pending`
- **THEN** la acción responde que el reporte ya fue procesado y no registra pago

#### Scenario: Tasa BCV ausente al confirmar
- **WHEN** el admin confirma un reporte `pending` y la tasa BCV a su `payment_date` no existe o no es fresca
- **THEN** el reporte pasa a `on_hold`, no se registra ningún pago y la acción responde éxito indicando que quedó en espera

#### Scenario: Doble confirmación simultánea
- **WHEN** dos pestañas confirman a la vez el mismo reporte `pending`
- **THEN** solo una aplica el pago y la otra responde que el reporte ya fue procesado, sin un segundo recibo

#### Scenario: Confirmar con especiales elegidas
- **WHEN** la casa debe una especial de 24 y el admin confirma un reporte de 25 USD marcándola en el diálogo
- **THEN** solo esa especial se paga, el sobrante de 1 va a saldo a favor y el recibo muestra 25 recibidos

#### Scenario: Confirmar sin marcar especiales
- **WHEN** la casa tiene especiales pendientes y el admin confirma sin marcar ninguna
- **THEN** el reporte se aplica con el flujo normal

#### Scenario: Selección inválida
- **WHEN** `selected_special_ids` incluye una cuota de otra casa, no especial, pagada, borrada o repetida
- **THEN** se rechaza sin aplicar el pago ni cambiar el reporte

#### Scenario: Reporte en espera con selección
- **WHEN** el admin confirma con especiales elegidas y falta la tasa BCV
- **THEN** el reporte queda `on_hold` con `installment_ids` y `explicit_installments = true`; al volver a `pending` y confirmarse sin elegir de nuevo, se aplica solo a esas

## ADDED Requirements

### Requirement: Admin confirm dialog lists special cuotas
Al confirmar un reporte `pending`, si la casa tiene cuotas especiales pendientes, la pantalla de reportes SHALL abrir un diálogo con ellas (nombre, vencimiento, saldo y moneda), con casillas sin marcar por defecto y un texto que indique que, si se marca alguna, el abono se aplica solo a ellas. Si la casa no tiene especiales pendientes, SHALL confirmar sin diálogo.

#### Scenario: Casa con especiales
- **WHEN** el admin pulsa confirmar en un reporte de una casa con una especial pendiente
- **THEN** ve el diálogo con la especial, sin marcar, y puede confirmar con o sin marcarla

#### Scenario: Casa sin especiales
- **WHEN** el admin pulsa confirmar en un reporte de una casa sin especiales pendientes
- **THEN** el reporte se confirma directamente

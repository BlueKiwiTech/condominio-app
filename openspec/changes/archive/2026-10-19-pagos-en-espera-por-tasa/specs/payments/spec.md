## MODIFIED Requirements

### Requirement: Payment currency independent of cuota currency
La moneda del pago PUEDE diferir de la de la cuota; en ese caso `allocateFunds` SHALL convertir con `convertAmount` (pivote USD) usando las tasas a la `payment_date` (`getExchangeRatesAsOf`) y SHALL guardar el detalle en `funding_breakdown`. Sin tasa BCV fresca, el pago SHALL quedar en espera (`on_hold`) sin escribir pagos; sin tasa Binance fresca, la acción SHALL devolver `staleExchangeRate` sin escribir.

#### Scenario: Pago en Bs a cuota en USD
- **WHEN** el admin registra un pago en Bs contra una cuota en USD y existe tasa BCV fresca a la fecha del abono
- **THEN** se descuenta el equivalente en Bs, la fila queda en USD y `funding_breakdown` registra `[{currency, amountDrawn, exchangeRate, exchangeRateType}]` con tipo `bcv`

#### Scenario: Tasa ausente
- **WHEN** la tasa BCV necesaria no existe o tiene más de 24 h respecto de `payment_date`
- **THEN** el pago queda en espera y no se inserta ningún pago

#### Scenario: Tasa Binance ausente
- **WHEN** el pago es en USDT y la tasa Binance no existe o tiene más de 24 h respecto de `payment_date`
- **THEN** la acción devuelve `staleExchangeRate` y no se inserta ningún pago

### Requirement: Resident payment report submission
Un residente con sesión firmada válida (`getResidentSession`) SHALL poder enviar un reporte de pago (`reportPayment`) con `amount > 0`, `currency`, `payment_date`, `reference` y `notes` opcionales. La `house_id` SHALL provenir de la sesión, nunca del cliente. El reporte se inserta en `condo_payment_reports` con estado `pending`, o `on_hold` si aún no puede convertirse por falta de tasa BCV, y SHALL NOT modificar `condo_installments`, `condo_payments` ni `condo_house_credits`.

#### Scenario: Casa de la sesión
- **WHEN** una petición manipulada incluye otra casa
- **THEN** el reporte se guarda igualmente con la `house_id` de la sesión

#### Scenario: Cuotas etiquetadas
- **WHEN** el reporte incluye `installment_ids`
- **THEN** solo se conservan los que pertenecen a la casa de la sesión, no están `paid` ni borrados

#### Scenario: Reporte sin tasa BCV
- **WHEN** el residente reporta un pago en Bs fechado en un día sin tasa BCV fresca y la casa tiene cuotas en USD elegibles
- **THEN** el reporte se guarda con estado `on_hold` y `created_by` nulo

### Requirement: Admin confirms a payment report
`confirmPaymentReport` SHALL requerir admin y un reporte `pending`, y SHALL ejecutar la misma asignación que `registerPayment` (`applyPaymentAllocation`) con los datos del reporte. Sin `installment_ids`, SHALL usar todas las cuotas no `paid` y no borradas de la casa. Después SHALL marcar el reporte `confirmed` con `resulting_payment_batch_id` y `resulting_receipt_number`, y escribir el audit `payment_report.confirm`. Si la asignación se bloquea por falta de tasa BCV, SHALL poner el reporte en `on_hold` sin registrar pago ni devolver error.

#### Scenario: Reporte sin cuotas etiquetadas
- **WHEN** el admin confirma un reporte con `installment_ids` vacío
- **THEN** la asignación corre contra todas las cuotas pendientes de la casa dentro de la ventana de 30 días y el reporte queda enlazado al recibo

#### Scenario: Reporte ya resuelto
- **WHEN** el estado del reporte no es `pending` o no existe
- **THEN** la acción devuelve `invalidData` y no registra pago

#### Scenario: Tasa BCV ausente al confirmar
- **WHEN** el admin confirma un reporte `pending` y la tasa BCV a su `payment_date` no existe o no es fresca
- **THEN** el reporte pasa a `on_hold`, no se registra ningún pago y la acción responde éxito indicando que quedó en espera

### Requirement: Admin rejects a payment report
`rejectPaymentReport` SHALL requerir admin y un reporte `pending` u `on_hold`, fijar `status = 'rejected'` y `rejection_reason` (texto recortado o nulo) y escribir el audit `payment_report.reject`. El rechazo SHALL NOT crear ni modificar filas de pagos, cuotas o crédito.

#### Scenario: Rechazo con motivo
- **WHEN** el admin rechaza con un motivo
- **THEN** el residente ve el motivo en Mi Cartera

#### Scenario: Rechazo de un reporte en espera
- **WHEN** el admin rechaza un reporte `on_hold`
- **THEN** pasa a `rejected` y la liberación posterior ya no lo procesa

#### Scenario: Reporte ya confirmado
- **WHEN** el admin intenta rechazar un reporte `confirmed`
- **THEN** la acción devuelve `invalidData` y no cambia el reporte

## ADDED Requirements

### Requirement: Admin payment on hold for a missing BCV rate
Cuando `registerPayment` detecta que la asignación se bloquea por falta de tasa BCV fresca a `payment_date`, SHALL insertar un reporte `on_hold` en `condo_payment_reports` con `created_by` del admin y los datos del pago (casa, monto, moneda, fecha, referencia, notas y cuotas), SHALL NOT escribir en `condo_installments`, `condo_payments` ni `condo_house_credits`, y SHALL responder éxito indicando que el pago quedó en espera.

#### Scenario: Pago de fin de semana sin tasa
- **WHEN** el admin registra un pago en Bs contra una cuota en USD y la tasa BCV a `payment_date` no existe o no es fresca
- **THEN** se crea un reporte `on_hold` con `created_by` del admin, la casa sigue mostrando su deuda y la acción responde éxito con el indicador de espera

#### Scenario: Pago que no necesita tasa
- **WHEN** el pago es en USD, o en Bs contra cuotas en Bs, o no tiene cuotas elegibles (depósito a cartera)
- **THEN** se registra como siempre y no entra en espera

### Requirement: Held payments are released automatically
Un reporte `on_hold` SHALL liberarse cuando la asignación deje de bloquearse por tasa: si `created_by` no es nulo (pago del admin), SHALL aplicarse con `applyPaymentAllocation` y quedar `confirmed` con `resulting_payment_batch_id` y `resulting_receipt_number`; si es nulo (reporte del residente), SHALL pasar a `pending`. Cada liberación SHALL reclamarse con `release_claimed_at` para no duplicar pagos ni recibos.

#### Scenario: Pago del admin liberado
- **WHEN** llega la tasa BCV a la fecha de un reporte `on_hold` con `created_by` del admin
- **THEN** se aplica el pago, el reporte queda `confirmed` enlazado al recibo y las cuotas se actualizan

#### Scenario: Reporte del residente liberado
- **WHEN** llega la tasa BCV a la fecha de un reporte `on_hold` con `created_by` nulo
- **THEN** pasa a `pending` y el admin puede confirmarlo

#### Scenario: Liberación simultánea
- **WHEN** el cron y una tasa manual intentan liberar el mismo reporte a la vez
- **THEN** solo uno lo reclama y se crea un solo pago y un solo recibo

#### Scenario: Falla al aplicar
- **WHEN** la aplicación de un pago liberado falla
- **THEN** el reporte sigue `on_hold`, el reclamo se limpia y se reintenta en la siguiente liberación

#### Scenario: Reclamo vencido
- **WHEN** una corrida cayó con un reclamo de más de 10 minutos sin completarse
- **THEN** la siguiente liberación vuelve a reclamar ese reporte

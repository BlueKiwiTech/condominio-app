# payments Specification

## Purpose
Registrar pagos de cuotas por casa: el admin registra un pago (con varias cuotas a la vez) y el sistema reparte los fondos oldest-first, full-or-nothing, agrupa las filas por lote/recibo, mantiene el saldo a favor por casa y moneda, y permite confirmar o rechazar los reportes de pago que envían los residentes (con captura y OCR opcional). Las cuotas y su saldo pendiente viven en `cuota-engine`; la billetera/conversión entre monedas se describe en `mi-cartera`.

## Requirements

### Requirement: Admin-only payment registration
El registro de un pago (`registerPayment`) SHALL requerir una sesión de admin verificada con `supabase.auth.getUser()` y SHALL validar la entrada con `registerPaymentSchema` (`house_id` uuid, `installment_ids` arreglo de uuids posiblemente vacío, `currency` en `USD|Bs|USDT`, `amount_received` numérico no negativo, `payment_date` `YYYY-MM-DD`, `reference` máx. 120, `notes` máx. 500).

#### Scenario: Sin sesión
- **WHEN** `getUser()` falla o no devuelve usuario
- **THEN** la acción devuelve el error `sessionExpired` y no escribe nada

#### Scenario: Entrada inválida
- **WHEN** la entrada no cumple el esquema zod
- **THEN** la acción devuelve el primer mensaje de validación sin tocar la base de datos

### Requirement: Multi-cuota payment grouped by batch and receipt
Un pago registrado SHALL generar un `payment_batch_id` (UUID) y UN número de recibo comunitario secuencial (RPC `condo_next_receipt_number`, secuencia `condo_payments_receipt_seq`) compartidos por todas las filas `condo_payments` del lote, con una fila por cuota pagada. La fila SHALL guardar la moneda y el monto en la denominación de la CUOTA, no de lo recibido.

#### Scenario: Pago de varias cuotas
- **WHEN** el admin registra un pago que cubre tres cuotas
- **THEN** se insertan tres filas `condo_payments` con el mismo `payment_batch_id` y el mismo `receipt_number`, cada una con su `installment_id`

#### Scenario: Unicidad del recibo
- **WHEN** dos lotes distintos se registran
- **THEN** cada lote recibe un número distinto por `nextval` y la base NO impone unicidad por fila (el índice único fue eliminado), por lo que la unicidad entre lotes depende solo de la secuencia

### Requirement: Oldest-first full-or-nothing allocation
La asignación (`allocateFunds`) SHALL recorrer las cuotas elegibles ordenadas por `due_date` ascendente (desempate por `installment_number`) en centavos enteros, SHALL marcar una cuota como `paid` solo si los fondos restantes cubren su saldo completo, y SHALL detenerse en la primera cuota que no pueda cubrir por completo sin saltar a una más nueva. Cuotas ya pagadas (saldo <= 0) SHALL omitirse sin bloquear.

#### Scenario: Fondos insuficientes para la más antigua
- **WHEN** se reciben 100 y la cuota más antigua pendiente es de 224
- **THEN** ninguna cuota se paga, el monto completo queda como saldo a favor y la acción NO devuelve error

#### Scenario: Cobertura parcial de la lista
- **WHEN** los fondos cubren las dos primeras cuotas pero no la tercera
- **THEN** las dos primeras pasan a `paid` con `amount_paid = amount`, la tercera queda intacta y el sobrante se conserva

### Requirement: Partial status is not produced by payments
El sistema SHALL NOT dejar una cuota en estado `partial` mediante registro de pago ni barrido de crédito: el estado `partial` existe en el CHECK de la columna `status` pero `allocateFunds` y `allocateFundsFullOrNothing` solo producen `paid`.

#### Scenario: Monto menor al adeudado
- **WHEN** el admin registra un monto menor al saldo de la cuota más antigua
- **THEN** la cuota conserva su estado y su `amount_paid`, y el monto va a saldo a favor

### Requirement: Eligibility window of 30 days
Un pago SHALL aplicarse únicamente a cuotas vencidas (sin límite hacia atrás) más las que vencen hasta 30 días calendario después de `payment_date` (`filterEligibleForConversionWindow`), para todas las monedas. Las cuotas más lejanas SHALL permanecer sin tocar y los fondos sobrantes SHALL ir a saldo a favor.

#### Scenario: Cuota a 45 días
- **WHEN** hay una cuota con vencimiento 45 días después de `payment_date` y fondos de sobra
- **THEN** la cuota no se paga y el sobrante queda como saldo a favor

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

### Requirement: Saldo a favor (credit) netting and write-back
Antes de asignar, el sistema SHALL sumar a `amount_received` el saldo existente en `condo_house_credits` de la casa y la MISMA moneda del pago. Después de asignar, SHALL reemplazar (no incrementar) el saldo de esa casa+moneda por el sobrante (`setHouseCredit`, upsert por `house_id,currency`). El saldo SHALL ser siempre por moneda, sin sumarse entre monedas.

#### Scenario: Pago cubierto solo con saldo existente
- **WHEN** `amount_received` es 0 y el saldo a favor en esa moneda cubre la cuota más antigua
- **THEN** la cuota se paga, se insertan filas con el recibo del lote y el saldo se reduce al sobrante

#### Scenario: Sobrante
- **WHEN** quedan fondos tras pagar todas las cuotas elegibles
- **THEN** se inserta una fila adicional sin `installment_id` (top-up de billetera) con el sobrante, con el mismo lote y recibo, y el saldo se actualiza

### Requirement: Wallet-only deposit
Un pago SHALL poder registrarse sin cuotas elegibles (casa sin deuda, sin cuotas seleccionadas o fuera de la ventana de 30 días): se inserta UNA fila `condo_payments` con `installment_id = NULL` por el monto recibido y el monto se acredita al saldo. Un pago con `amount_received <= 0` SHALL rechazarse con `insufficientAmount`.

#### Scenario: Casa sin cuotas pendientes
- **WHEN** el admin registra 50 USD para una casa sin cuotas pendientes
- **THEN** se crea una fila con `installment_id` nulo, recibo y lote nuevos, y el saldo a favor en USD aumenta en 50

#### Scenario: Monto cero sin cuotas
- **WHEN** `amount_received` es 0 y se llega a la validación de `applyPaymentAllocation`
- **THEN** la acción devuelve `insufficientAmount`

### Requirement: Installment preconditions
Antes de asignar, el sistema SHALL recuperar de nuevo las cuotas por id con `deleted_at IS NULL` (nunca confiar en montos del cliente) y SHALL rechazar el pago si faltan cuotas (`installmentsGone`), si alguna pertenece a otra casa (`mixedHouses`) o si alguna ya está `paid` (`alreadyPaid`).

#### Scenario: Cuota anulada por desactivar la plantilla
- **WHEN** alguna cuota seleccionada fue soft-deleted
- **THEN** la acción devuelve `installmentsGone`

### Requirement: Ledger-first non-transactional write order
`applyPaymentAllocation` SHALL escribir en este orden: filas de `condo_payments`, luego actualización de `condo_installments` (`amount_paid`, `status`), luego `condo_house_credits`, y por último el audit log. Las escrituras NO ocurren en una sola transacción de base de datos.

#### Scenario: Fallo posterior
- **WHEN** falla la actualización de una cuota o del crédito después de insertar los pagos
- **THEN** la acción devuelve error y las filas de `condo_payments` ya insertadas permanecen

### Requirement: Payment audit log
Un pago registrado con éxito SHALL escribir `condo_audit_logs` con acción `payment.create`, `entity_type = 'payment_batch'` y `entity_id = batchId`. La escritura de auditoría SHALL ser best-effort: un fallo se registra en consola y nunca bloquea ni revierte la operación.

#### Scenario: Pago exitoso
- **WHEN** `registerPayment` termina bien
- **THEN** existe un audit `payment.create` para el lote y se revalidan `/pagos` y `/cuotas`

### Requirement: Automatic credit sweep for due installments
El saldo a favor SHALL aplicarse automáticamente a cuotas ya vencidas (`due_date <= hoy`) de la MISMA moneda, oldest-first y full-or-nothing (`allocateFundsFullOrNothing`), con lote y recibo propios. Se dispara tras generar cuotas nuevas (`sweepCreditForNewInstallments`) y por el cron diario `generate-cuotas` (`sweepStaleCreditsAgainstVencidaInstallments`). El barrido NO SHALL convertir entre monedas.

#### Scenario: Crédito USD y cuota vencida USD
- **WHEN** una casa tiene crédito USD que cubre su cuota vencida USD más antigua
- **THEN** el barrido paga esa cuota, inserta filas con nuevo recibo y reduce el crédito

#### Scenario: Cuota futura
- **WHEN** la cuota recién generada vence después de hoy
- **THEN** el barrido no la toca aunque el crédito la cubra

#### Scenario: Moneda distinta
- **WHEN** el crédito está en Bs y la única cuota vencida está en USD
- **THEN** el barrido diario no hace nada

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

### Requirement: Report screenshot upload
La captura opcional SHALL ser de tipo `image/*` y de a lo sumo 5 MB (5 * 1024 * 1024 bytes); se sube al bucket privado `payment-report-screenshots` con ruta `<house_id>/<timestamp>-<uuid>.<ext>` mediante cliente service-role, y el admin SHALL verla por URL firmada de 5 minutos (`getReportScreenshotUrl`, gateada con `getUser()`).

#### Scenario: Archivo no imagen
- **WHEN** la captura no es `image/*`
- **THEN** la acción devuelve `invalidFileType` y no inserta el reporte

#### Scenario: Archivo grande
- **WHEN** la captura excede 5 MB
- **THEN** la acción devuelve `fileTooLarge`

### Requirement: Screenshot OCR prefill
La extracción desde captura (`extractPaymentFieldsFromScreenshot`, modelo `amazon/nova-lite`) SHALL estar disponible para admin (`getUser()`) y residente (sesión), SHALL devolver solo valores de prellenado posiblemente nulos sin escribir nada, y SHALL interpretar monto y fecha de forma determinista (`parseVenezuelanAmount`, `parseVenezuelanDate`, DD/MM/YYYY o DD/MM/YY).

#### Scenario: Monto con formato venezolano
- **WHEN** el recibo dice `1.234,56`
- **THEN** el monto extraído es 1234.56

#### Scenario: Fallo del modelo
- **WHEN** la llamada al modelo lanza excepción
- **THEN** se devuelve `extractFailed` y el formulario queda sin prellenar

### Requirement: Admin confirms a payment report
`confirmPaymentReport` SHALL requerir admin y un reporte `pending`, y ejecutar la misma asignación que `registerPayment` (`applyPaymentAllocation`) con los datos del reporte; sin `installment_ids`, usa todas las cuotas no `paid` ni borradas de la casa. Después SHALL marcar el reporte `confirmed` con su lote y recibo y escribir el audit `payment_report.confirm`. Si falta la tasa BCV, SHALL ponerlo `on_hold` sin registrar pago ni error.

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

### Requirement: Currency set
Las monedas aceptadas en pagos y reportes SHALL ser `USD`, `Bs` y `USDT`, validadas por `currencySchema` y por CHECK en base de datos; el pago SHALL poder recibirse en cualquier moneda sin importar la de la cuota (se eliminó el trigger que las igualaba). Las cuotas NUEVAS solo se crean en USD (`cuotaCreateCurrencySchema`). La UI SHALL mostrar USD como "$ Efectivo", Bs como "Bs." y USDT como "Binance" sin cambiar los valores almacenados.

#### Scenario: Pago en moneda distinta a la cuota
- **WHEN** se registra un pago en USDT contra una cuota en USD
- **THEN** la base lo acepta y la asignación convierte según la tasa `binance`

### Requirement: Admin RLS on payment tables
`condo_payments`, `condo_house_credits` y `condo_payment_reports` SHALL tener RLS activado con políticas de admin; los residentes SHALL acceder únicamente mediante el cliente service-role filtrado por la `house_id` de su sesión.

#### Scenario: Residente consulta un lote ajeno
- **WHEN** un residente pide `/mi-cartera/<batchId>` de otra casa
- **THEN** la consulta filtra por su `house_id` y no devuelve filas ajenas

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

## Known Limitations
- No existe anulación/reverso/edición de pagos: no hay acción que borre o revierta un lote de `condo_payments`, restaure `amount_paid` o devuelva crédito. Solo existe el soft-delete de cuotas al desactivar una plantilla.
- Documentación vs. código: `PLAN.md` y cabeceras de `allocate.ts` aún mencionan pago parcial oldest-first ("la siguiente queda parcialmente pagada"); el código actual es full-or-nothing (decisión 2026-09-29) y el sobrante va a saldo a favor. El estado `partial` sigue en el CHECK pero ningún flujo lo produce; el comentario de `creditSweep.ts` aún dice que `registerPayment` puede dejar cuotas `partial`.
- La cabecera de `20260908090000_resident_payment_reports.sql` dice que confirmar es solo un flag y que no hay UI de admin; hoy confirmar sí registra el pago real.
- La cabecera de `20260908120000_exchange_rate.sql` y `20260908110000` dicen que no hay conversión automática ("cada quien saca la cuenta"); `allocateFunds` ahora convierte automáticamente.
- Sin transacción: los fallos tras insertar `condo_payments` dejan cuotas/crédito desincronizados (no hay compensación). Dos pagos concurrentes de la misma casa pueden leer el mismo saldo a favor (lectura-modificación-escritura sin bloqueo).
- `confirmPaymentReport` actualiza el reporte a `confirmed` en un paso aparte: si ese UPDATE falla tras registrar el pago, el reporte queda `pending` y reconfirmarlo duplicaría el pago. Tampoco filtra el UPDATE por `status = 'pending'`.
- El saldo a favor solo se netea en la moneda del pago; el crédito en otra moneda no se mezcla al confirmar (lo recoge el barrido, solo de la misma moneda).
- `payment_batch_id` no tiene FK ni tabla de lotes; `receipt_number` ya no es único a nivel de base de datos.
- `rejectPaymentReport` solo actúa sobre reportes `pending` u `on_hold`; si el admin rechaza un reporte justo mientras se libera, el reporte queda `confirmed` si el pago ya se aplicó.
- El esquema de `reportPaymentSchema` valida y el residente ve etiquetas, pero `reportPayment` no limita la frecuencia de envíos ni valida duplicados.
- El barrido diario usa `paymentDate` = hoy y `created_by = null` para los lotes automáticos.
- `applyPaymentAllocation` no es transaccional y la liberación de un pago en espera la reutiliza: una caída a mitad de una liberación puede dejar un pago aplicado a medias con el reporte aún `on_hold` (el reclamo vence a los 10 minutos y un reintento lo duplicaría), lo que requeriría conciliación manual.
- Un pago del admin en espera que nunca se puede aplicar (cuota ya pagada o inexistente) falla en cada liberación y sigue `on_hold`; no se descarta solo, el admin debe rechazarlo.
- Un reporte de residente `on_hold` pasa a `pending` al llegar la tasa sin evaluar si luego se podrá aplicar; los errores se ven al confirmarlo.

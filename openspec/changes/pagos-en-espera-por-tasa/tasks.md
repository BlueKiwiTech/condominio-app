# Tasks

## 1. Migración de base de datos

- [ ] 1.1 Crear `supabase/migrations/20261019000000_held_transactions.sql` (timestamp posterior a `20261016000000_expense_payment_rate.sql`): ampliar el check de `condo_payment_reports.status` y de `condo_expenses.status` con `on_hold` (`drop constraint if exists` + `add constraint`); agregar `created_by uuid references auth.users(id)` a `condo_payment_reports` y `release_claimed_at timestamptz` a ambas tablas (`add column if not exists`); reemplazar `condo_expenses_payment_rate_all_or_none_check` por una versión que acepte "las cuatro columnas nulas", "las cuatro con valor" o `status = 'on_hold'` con `exchange_rate_type` con valor y las otras tres nulas. Sin backfill ni cambios de RLS. Verificar: releer que usa el prefijo `condo_`, que es re-ejecutable y que no toca filas existentes; la migración NO se aplica desde aquí.
- [ ] 1.2 Migración lista para que el usuario la aplique: entregar el nombre del archivo y recordar que va antes de desplegar el código y después de la de `gastos-pago-multimoneda`. Verificar: el timestamp es posterior a `20261016000000_expense_payment_rate.sql`.

## 2. Núcleo de pagos

- [ ] 2.1 En `lib/payments/applyAllocation.ts` extraer la parte de solo lectura (cuotas, crédito de la casa, `getExchangeRatesAsOf`, `allocateFunds`) como `evaluatePaymentAllocation`, que devuelve la asignación o `blockedByRate`, y hacer que `applyPaymentAllocation` la reutilice y devuelva `{ onHold: true }` en vez de `{ error: staleExchangeRate }` cuando el bloqueo es por la tasa BCV (el bloqueo por Binance conserva el error). Ampliar el tipo del cliente para aceptar el cliente service-role y una variante service-role de la lectura de tasas a una fecha. Verificar: `npx tsc --noEmit` sin errores y un pago en Bs con tasa fresca se aplica igual que antes.
- [ ] 2.2 En `registerPayment` (`lib/actions/payments.ts`), cuando `applyPaymentAllocation` devuelve `onHold`, insertar un reporte `on_hold` en `condo_payment_reports` con `created_by` del admin y los datos del pago (casa, monto, moneda, fecha, referencia, notas, cuotas) y responder `{ success: true, onHold: true }` sin escribir cuotas, pagos ni crédito. Verificar: con la tasa BCV vencida, un pago en Bs contra una cuota en USD crea el reporte `on_hold`, no cambia cuotas ni saldo, y un pago en USD o un depósito sin cuotas elegibles se registra como siempre.

## 3. Reportes del residente y confirmación

- [ ] 3.1 En `reportPayment` (`lib/actions/residentPayments.ts`) evaluar con `evaluatePaymentAllocation` (con las cuotas verificadas de la casa, o todas las pendientes si no hay) y crear el reporte `on_hold` en vez de `pending` cuando el resultado es `blockedByRate`. Verificar: un reporte en Bs fechado sin tasa BCV fresca nace `on_hold` con `created_by` nulo; uno con tasa fresca o en USD nace `pending`.
- [ ] 3.2 En `confirmPaymentReport` (`lib/actions/paymentReports.ts`) poner el reporte en `on_hold` y responder éxito con el indicador de espera cuando `applyPaymentAllocation` devuelve `onHold`, sin registrar pago; y en `rejectPaymentReport` exigir que el reporte esté `pending` u `on_hold` (si no, `invalidData`). Ampliar los tipos de estado (`ReportForConfirm`, `ResidentReportStatus`). Verificar: confirmar un `pending` sin tasa lo deja `on_hold` sin pagos; rechazar un `on_hold` lo pasa a `rejected`; rechazar un `confirmed` devuelve `invalidData`.

## 4. Liberación

- [ ] 4.1 Crear el módulo `releaseHeldTransactions` (p. ej. `lib/payments/releaseHeld.ts`) con el cliente service-role: para cada reporte `on_hold`, reclamarlo con `release_claimed_at` (`where status = 'on_hold'` y reclamo nulo o de más de 10 minutos, `returning`), repetir `evaluatePaymentAllocation` y, si ya no está bloqueado, aplicarlo con `applyPaymentAllocation` y `created_by` del registro y dejarlo `confirmed` con `resulting_payment_batch_id` y `resulting_receipt_number` (`created_by` no nulo), o pasarlo a `pending` (`created_by` nulo); si sigue bloqueado o falla, limpiar el reclamo y dejarlo `on_hold`. Devolver el conteo de liberados y fallidos. Verificar con un script desechable contra el Supabase local: con una tasa nueva el pago del admin queda `confirmed` con recibo, el del residente queda `pending`, y dos liberaciones simultáneas crean un solo pago.
- [ ] 4.2 Extender `releaseHeldTransactions` a gastos `on_hold`: mismo reclamo, buscar la tasa de su `exchange_rate_type` a su `paid_date`, y si es fresca guardar `exchange_rate`, `reference_amount` (con `referenceAmount`) y `reference_currency` (con `referenceCurrencyFor`) y pasar a `paid`. Verificar: un gasto `on_hold` con `bcv` queda `paid` con los valores calculados con su `amount` guardado tras insertar una tasa fresca.
- [ ] 4.3 Llamar a `releaseHeldTransactions` al final de `GET /api/cron/exchange-rate` (después de insertar las tasas, en `try/catch`, con el conteo en la respuesta y `success: false` si falla) y tras `setExchangeRate` (`lib/actions/exchangeRate.ts`). Verificar: tras el cron y tras una tasa manual se liberan los `on_hold` pendientes, y una excepción en la liberación no impide que las tasas queden insertadas.

## 5. Gastos

- [ ] 5.1 En `markExpensePaid` (`lib/actions/gastos.ts`), cuando el gasto es en Bs, el tipo es `bcv` o `eur` y no hay tasa fresca a `paid_date`, dejar el gasto en `on_hold` guardando `paid_date`, `amount`, `notes` y `exchange_rate_type` (sin tasa ni equivalente) con el guard `.eq('status', 'pending')`, y responder éxito indicando la espera; `custom` se procesa al momento y `binance` conserva `staleExchangeRate`. Verificar: un gasto en Bs con `bcv` sin tasa fresca queda `on_hold`; con `custom` se paga al momento; con `binance` vencida devuelve `staleExchangeRate` y sigue `pending`.
- [ ] 5.2 Incluir `on_hold` en "Gastos pendientes del mes" del dashboard (`lib/reporting/dashboard.ts`) y en los tipos y filtros de estado de la lista de gastos. Verificar: un gasto del mes `on_hold` suma en los pendientes, en su moneda original.

## 6. Interfaz

- [ ] 6.1 Admin: insignia "En espera de tasa" en la lista de pagos reportados con el botón de confirmar deshabilitado y el de rechazar disponible; en el formulario de registrar pago, mostrar un mensaje de "pago en espera de tasa" en vez del recibo cuando la acción responde `onHold`; textos en `messages/es.json` y `messages/en.json`, con shadcn sobre Base UI según `design-system/asobarcelona/MASTER.md`. Verificar: un reporte `on_hold` no se puede confirmar y se puede rechazar; registrar un pago sin tasa muestra el aviso de espera.
- [ ] 6.2 Residente: en Mi Cartera mostrar "En espera de tasa" en los reportes `on_hold`, incluirlos en el total de reportes pendientes de su moneda y ampliar los tipos de estado de `lib/resident/queries.ts`, con textos en es/en. Verificar: un reporte `on_hold` aparece con la etiqueta, suma en el total pendiente y no enlaza a recibo.
- [ ] 6.3 Gastos: insignia "En espera de tasa" y opción en el filtro de estado de la lista de gastos, con textos en es/en. Verificar: un gasto `on_hold` se muestra con la insignia y el filtro lo encuentra.

## 7. Cierre y verificación

- [ ] 7.1 Con el Supabase local y la migración aplicada (`scripts/e2e/setup-local-supabase.sh`, `NODE_ENV=test npm run dev`), probar de punta a punta: sin tasa fresca, registrar un pago en Bs contra una cuota en USD (queda en espera), reportar como residente (queda en espera), pagar un gasto en Bs con `bcv` (queda en espera) y uno con `custom` (se paga); luego ejecutar el cron de tasas y comprobar que el pago del admin queda `confirmed` con recibo, el reporte del residente pasa a `pending` y el gasto queda `paid`; repetir la liberación con una tasa manual. Anotar el resultado.
- [ ] 7.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados (`use-mobile.ts`, `SplitAmounts.tsx`, `CuotaFormClient.tsx`, `GastoFormClient.tsx`).
- [ ] 7.3 Ejecutar el agente `spec-auditor` sobre `payments`, `mi-cartera`, `resident-portal` y `gastos` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- Fusionar y archivar `gastos-pago-multimoneda` antes de aplicar este change (la parte de gastos usa sus columnas).
- Aplicar la migración del punto 1 en Supabase antes de desplegar el código.
- Revisar el diff con `/pr` (corre el revisor adversarial) y publicar la rama con GitHub Desktop.
- Archivar con `/opsx:archive` una vez verificado el flujo de espera y liberación.

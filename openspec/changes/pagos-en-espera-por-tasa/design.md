# Design

## Context

Hoy `applyPaymentAllocation` ([lib/payments/applyAllocation.ts](lib/payments/applyAllocation.ts)) lee las cuotas, el crédito de la casa y las tasas a `payment_date`, ejecuta `allocateFunds` (función pura de [lib/payments/allocate.ts](lib/payments/allocate.ts)) y, si queda `blocked` por tasa, devuelve `{ error: staleExchangeRate }` **antes de escribir nada**. Lo llaman `registerPayment` (admin) y `confirmPaymentReport` (admin sobre un reporte `pending`). El reporte del residente (`reportPayment`) no convierte nada: solo inserta un `pending` en `condo_payment_reports`, que ya guarda casa, monto, moneda, fecha, referencia, notas y cuotas, y que al confirmarse se enlaza al recibo con `resulting_payment_batch_id` y `resulting_receipt_number`.

El estado de `condo_payment_reports.status` es `pending|confirmed|rejected`; el de `condo_expenses.status`, `pending|paid`. `applyPaymentAllocation` ya recibe `created_by` y escribe el audit con él, así que puede ejecutarse sin sesión si se le pasa un cliente service-role y el id del admin. Un depósito sin cuotas elegibles (wallet-only) y el barrido de saldo a favor no convierten entre monedas, por lo que nunca se bloquean por tasa.

La parte de gastos depende del change `gastos-pago-multimoneda` (rama `feat/gastos-pago-multimoneda`, pendiente de fusionar): sus columnas `exchange_rate`, `exchange_rate_type`, `reference_amount` y `reference_currency` y su `markExpensePaid`.

## Goals / Non-Goals

**Goals:**
- Que ningún pago ni gasto se rechace por falta de tasa BCV: queda "en espera" y se procesa solo cuando la tasa llega.
- Un solo campo `status` en las tablas existentes, sin tabla nueva ni migración de datos entre tablas.
- Liberación idempotente, disparada por el cron de tasas y por la tasa manual.

**Non-Goals:**
- Notificaciones al liberar, "en espera" para Binance/USDT o para pagos que no convierten, cambiar la regla de 24 h o el corte por `updated_at`, el barrido de saldo a favor, deshacer pagos confirmados.

## Decisions

**1. Un estado `on_hold`, sin tabla nueva.** `condo_payment_reports.status` y `condo_expenses.status` admiten `on_hold`. Un reporte ya contiene los datos de un pago pendiente y se enlaza al recibo al confirmarse, así que un pago retenido es simplemente un reporte `on_hold`: al liberarse pasa a `confirmed` (si lo registró el admin) o a `pending` (si lo creó el residente) en la misma fila, sin copiar nada. Alternativa descartada: tabla `condo_held_transactions` con el pago en JSON; habría que migrar datos a las tablas finales al aprobarse y mantener dos mecanismos.

**2. Un pago registrado por el admin se retiene como un reporte.** El admin no tiene fila previa: si la asignación se bloquea por tasa, `registerPayment` inserta una fila en `condo_payment_reports` con `status = 'on_hold'` y la columna nueva `created_by` (uuid, admin que lo registró). `created_by` nulo identifica un reporte del residente. Es la única columna agregada a los datos del pago; permite distinguir qué hacer al liberar (aplicar solo vs. pasar a `pending`) y con qué usuario escribir el audit y las filas de `condo_payments`.

**3. El bloqueo por tasa se evalúa con una función de solo lectura.** Se extrae de `applyPaymentAllocation` la parte que lee cuotas, crédito y tasas y llama a `allocateFunds`, como `evaluatePaymentAllocation` (sin escrituras), que devuelve la asignación o `blockedByRate`. `applyPaymentAllocation` la reutiliza y, en vez del error `staleExchangeRate`, devuelve `{ onHold: true }` cuando el bloqueo es por la tasa BCV. `reportPayment` la usa para decidir si crea el reporte `on_hold` o `pending`; la liberación la usa para saber si ya puede procesarse. Solo la tasa BCV retiene: si `allocateFunds` se bloquea por la tasa Binance, se conserva el error `staleExchangeRate`.

**4. Cuándo se retiene.** Un reporte de residente se evalúa al crearse; un `pending` se evalúa de nuevo al confirmar (si la tasa dejó de estar disponible, pasa a `on_hold` en vez de dar error); un pago del admin se evalúa al registrarse. Como las tasas "a una fecha" solo se agregan con el tiempo, una vez disponible la tasa de un día se mantiene disponible.

**5. Liberación con reclamo (`release_claimed_at`).** Se agrega `release_claimed_at timestamptz` a ambas tablas. `releaseHeldTransactions` reclama cada fila con `update ... set release_claimed_at = now() where id = ? and status = 'on_hold' and (release_claimed_at is null or release_claimed_at < now() - interval '10 minutes') returning`: solo quien recibe la fila la procesa. Al terminar bien, el estado cambia y el reclamo deja de importar; si falla, el reclamo se limpia y la fila sigue `on_hold` para la siguiente liberación; si el proceso cae, el reclamo vence a los 10 minutos y se reintenta. Evita pagos y recibos duplicados con cron y tasa manual simultáneos.

**6. Qué hace la liberación por tipo.**
- Pago del admin (`created_by` no nulo): `applyPaymentAllocation` con el cliente service-role y `created_by` del registro; si funciona, `confirmed` con `resulting_payment_batch_id` y `resulting_receipt_number`.
- Reporte de residente (`created_by` nulo): `pending`, sin aplicar nada; el admin lo confirma como siempre.
- Gasto: recalcula `exchange_rate`, `reference_amount` y `reference_currency` con la lógica de `gastos-pago-multimoneda` y pasa a `paid`.
Antes de procesar, cada fila repite la evaluación; si sigue bloqueada, se salta sin cambios.

**7. Disparadores.** Al final de `GET /api/cron/exchange-rate` (después de insertar las tasas, dentro de un `try/catch` para no afectar la inserción) y tras `setExchangeRate`. La liberación necesita leer tasas sin sesión de admin, así que se agrega una variante service-role de `getExchangeRatesAsOf` (el helper interno `fetchRatesAsOf` ya acepta cualquier cliente). La respuesta del cron incluye el conteo de liberados y fallidos, y `success` es `false` si la liberación falla.

**8. Gastos.** Solo `bcv` y `eur` retienen; `custom` se procesa al instante y `binance` conserva `staleExchangeRate`. Un gasto `on_hold` guarda `paid_date`, `amount`, `notes` y `exchange_rate_type`, por lo que el check "las cuatro columnas de tasa nulas o con valor" de `gastos-pago-multimoneda` se relaja: se permite `exchange_rate_type` con valor y las otras tres nulas solo cuando `status = 'on_hold'`. Un gasto `on_hold` sigue contando en "Gastos pendientes del mes".

**9. Mientras algo está en espera no se toca nada más.** No se escriben cuotas, pagos ni crédito, y la casa sigue mostrando su deuda. El residente ve "En espera de tasa" y cuenta en el total de reportes pendientes de su moneda.

**10. Interfaz.** Insignia "En espera de tasa" en pagos reportados (admin, con el botón de confirmar deshabilitado y el de rechazar disponible), en Mi Cartera, y en la lista de gastos (con el filtro de estado ampliado). Tras registrar un pago que queda en espera, el formulario del admin lo indica con un mensaje en vez del recibo.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* no se suma nada entre USD/Bs/USDT; la conversión sigue siendo la de `allocateFunds` y la de `gastos-pago-multimoneda`, solo cambia cuándo se ejecuta. El equivalente de un gasto liberado se calcula con su `amount` guardado.
- *Idempotencia:* la liberación reclama cada fila con `release_claimed_at` y cambia el estado con `where status = 'on_hold'`; repetir el cron o liberar en paralelo no duplica pagos ni recibos. `applyPaymentAllocation` conserva su orden ledger-first no transaccional: una caída a mitad de una liberación puede requerir conciliación manual, igual que hoy con un pago normal.
- *Fechas:* la evaluación usa `payment_date` / `paid_date` (fechas calendario `YYYY-MM-DD`) con la misma regla de frescura de 24 h y los mismos helpers; sin instantes UTC nuevos. El reclamo vence por tiempo de base de datos (`now()`).
- *RLS / `community_id`:* las columnas nuevas están en tablas con RLS solo admin. La liberación usa el cliente service-role y sólo toca filas `on_hold`; las lecturas del residente siguen por service-role filtradas por `house_id`, y no exponen `created_by` ni `release_claimed_at`.

## Risks / Trade-offs

- [Un pago en espera no baja la deuda mientras tanto] → Es deliberado (decisión 9): la casa sigue apareciendo con deuda hasta liberarse; con `tasas-bcv-dolarvzla` el caso será corto y raro. El residente ve "En espera de tasa".
- [`applyPaymentAllocation` no es transaccional] → Una caída entre sus escrituras podría dejar un pago aplicado a medias y un reporte aún `on_hold`; un reintento duplicaría. Mitigación: el reclamo de 10 minutos y que la caída es excepcional; si ocurre, conciliación manual como hoy.
- [Un reporte `pending` evaluado como bloqueado al confirmar cambia de estado en vez de dar error] → Cambia el comportamiento del botón "Confirmar" (responde éxito con aviso de espera); la interfaz debe mostrarlo claro.
- [La liberación corre dentro del cron de tasas] → Si muchas filas están en espera el cron tarda más; el volumen esperado es muy bajo y la ruta tiene el límite de ejecución por defecto.
- [Relajar el check de gastos] → El estado `on_hold` es el único que admite un tipo de tasa sin tasa; el check lo exige explícitamente.
- [Rechazar solo `pending`/`on_hold`] → Hoy `rejectPaymentReport` no verifica el estado y permitiría rechazar un reporte `confirmed`; se corrige aquí.

## Migration Plan

1. Migración nueva (posterior a `20261016000000_expense_payment_rate.sql`, la aplica el usuario antes de desplegar): ampliar el check de `condo_payment_reports.status` y `condo_expenses.status` con `on_hold`; agregar `created_by uuid references auth.users(id)` a `condo_payment_reports`; agregar `release_claimed_at timestamptz` a ambas; reemplazar el check de gastos por la versión que admite `on_hold`. Re-ejecutable (`add column if not exists`, constraints con `drop constraint if exists`). Sin backfill ni cambios de RLS.
2. Desplegar el código. El código nuevo escribe `on_hold`, así que la migración va antes.
3. Rollback: revertir el código; las filas `on_hold` ya creadas quedarían sin procesar hasta volver a desplegar (no se pierden). Las columnas son nulas y aditivas.

Orden entre changes: `gastos-pago-multimoneda` debe fusionarse y archivarse antes que este (usa sus columnas). `tasas-bcv-dolarvzla` es independiente.

## Open Questions

- Ninguna que bloquee. Supuestos tomados: solo `bcv` y `eur` retienen gastos (Binance conserva el error); un depósito a cartera sin cuotas elegibles no entra en espera; un reporte en espera cuenta en el total de reportes pendientes del residente.

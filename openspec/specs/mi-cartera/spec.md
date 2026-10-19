# mi-cartera Specification

## Purpose
"Mi Cartera" es la billetera de cada casa: el saldo a favor por moneda (`condo_house_credits`), los reportes de pago del residente y los recibos asociados, junto con la tasa de cambio diaria (BCV y Binance) que permite la única conversión entre monedas del sistema, al aplicar fondos recibidos en una moneda a una cuota denominada en otra. El registro de pagos y recibos se describe en `payments`.

## Requirements

### Requirement: Wallet balance per house and currency
El saldo de la billetera SHALL almacenarse en `condo_house_credits` con una fila única por `(house_id, currency)` y `balance` decimal(12,2). El saldo SHALL mantenerse en su propia moneda (sin conversión al depositar) y SHALL mostrarse al residente agrupado por moneda en Mi Cartera, separado de los reportes aún `pending`.

#### Scenario: Depósito en Bs
- **WHEN** se acredita un sobrante de un pago en Bs
- **THEN** `condo_house_credits` guarda el monto en la fila de moneda `Bs`, sin convertirlo a USD

#### Scenario: Vista del residente
- **WHEN** el residente abre `/mi-cartera`
- **THEN** ve el saldo disponible por moneda (de `condo_house_credits`) y el total de reportes `pending` por moneda como cifras separadas

### Requirement: Resident wallet reads are house-scoped
Las lecturas de Mi Cartera SHALL ejecutarse con el cliente service-role filtrando por la `house_id` de la sesión del residente (`getResidentPortalData`, `getResidentPaymentBatch`); sin sesión válida SHALL redirigirse a `/resident-login`.

#### Scenario: Sin sesión
- **WHEN** no hay sesión de residente
- **THEN** `/mi-cartera` redirige a `/resident-login`

### Requirement: Wallet-only payments
Un pago sin cuota destino SHALL representarse como fila de `condo_payments` con `installment_id` nulo (columna anulable por la migración `payments_wallet_only`), con lote y recibo propios, y SHALL aumentar el saldo de la billetera en la moneda recibida. Una fila con `installment_id` nulo SHALL ser "abono a cartera".

#### Scenario: Abono sin cuotas
- **WHEN** el admin confirma un reporte de pago de una casa sin cuotas pendientes
- **THEN** se crea una fila sin `installment_id` con el recibo del lote y el reporte queda enlazado a ese recibo

### Requirement: Single cross-currency exception
La conversión entre monedas SHALL ocurrir únicamente al aplicar fondos recibidos a una cuota de otra moneda (`allocateFunds`, pivote USD) y al pagar un gasto con alguna moneda en `Bs` (`markExpensePaid`, ver `gastos`). Reportes, morosos, saldos y totales SHALL seguir por moneda sin sumarlas. Los fondos sin aplicar SHALL permanecer en su moneda original y convertirse solo al aplicarse, a la tasa vigente ese día.

#### Scenario: Conversión Bs a USD
- **WHEN** 4.000 Bs se aplican a una cuota de 100 USD con tasa BCV 40
- **THEN** el equivalente es `amount / rate` para Bs a USD y `usd * rate` para USD a Bs

#### Scenario: Misma moneda
- **WHEN** origen y destino son la misma moneda
- **THEN** `convertAmount` devuelve el monto sin tasa

#### Scenario: Pago de un gasto con Bs
- **WHEN** el admin paga un gasto en una moneda distinta a la suya, o un gasto en Bs, y elige una tasa
- **THEN** lo pagado y el equivalente se calculan y se guardan en la fila del gasto, sin sumarse a ningún total ni a saldos

#### Scenario: Agregados de gastos
- **WHEN** hay gastos en distintas monedas
- **THEN** los agregados siguen agrupados por la moneda original de cada gasto y ningún monto pagado ni equivalente interviene

### Requirement: Rate types and currency mapping
Existirán exactamente tres tipos de tasa: `bcv` (dólar oficial, para `Bs`), `eur` (euro oficial del BCV) y `binance` (para `USDT`). `USD` SHALL NOT requerir tasa y `eur` SHALL NOT estar asociado a ninguna moneda de pago de la app (`rateTypeForCurrency`); se almacena para uso de otras capacidades.

#### Scenario: Mapeo
- **WHEN** se consulta el tipo de tasa para `Bs`, `USDT` y `USD`
- **THEN** devuelve `bcv`, `binance` y `null` respectivamente

#### Scenario: Euro sin moneda asociada
- **WHEN** se inserta una tasa `eur`
- **THEN** no cambia ninguna conversión de pagos existente y queda disponible en el historial

### Requirement: Exchange rate table is append-only
La tabla `condo_exchange_rates` SHALL ser un historial de solo inserciones: `rate_type` en `bcv|eur|binance`, `rate` > 0, `source` en `cron|admin`, `effective_date` y `source_updated_at` opcionales, `updated_at` y `updated_by`. La tasa "actual" de cada tipo SHALL ser la fila más reciente por `updated_at`. RLS SHALL estar activo con política de admin; el cron y las lecturas del residente usan service-role.

#### Scenario: Nueva tasa
- **WHEN** se establece una tasa nueva
- **THEN** se inserta una fila nueva y las anteriores se conservan

#### Scenario: Fechas solo de auditoría
- **WHEN** se evalúa la frescura de una tasa o el corte "a una fecha"
- **THEN** se usa `updated_at`; `effective_date` y `source_updated_at` no intervienen y son nulas cuando la fuente no entrega la fecha

#### Scenario: Fecha de vigencia no interviene
- **WHEN** existen dos filas `bcv` y la más reciente por `updated_at` tiene una `effective_date` anterior a la de la otra
- **THEN** la tasa actual sigue siendo la más reciente por `updated_at`

### Requirement: Daily exchange-rate cron
La ruta `GET /api/cron/exchange-rate` (`0 10 * * *` UTC, una sola vez al día) SHALL exigir `Authorization: Bearer ${CRON_SECRET}` (401) y obtener las tasas de dos fuentes independientes: `bcv` y `eur` de `https://rates.dolarvzla.com/bcv/current.json` (`current.usd` y `current.eur`, sin clave) y `binance` del mercado `binance` de cotizave (campo `mid`, con `COTIZAVE_API_KEY`). SHALL insertar cada tasa con `source = 'cron'` solo si es mayor a 0.

#### Scenario: Sin autorización
- **WHEN** falta o es incorrecto el Bearer
- **THEN** responde 401 y no inserta nada

#### Scenario: Fuente de cada tasa
- **WHEN** el cron corre y ambas fuentes responden
- **THEN** `bcv` y `eur` se insertan con `current.usd` y `current.eur` de dolarvzla, y `binance` con el `mid` del mercado `binance` de cotizave

#### Scenario: Tasa BCV no sale de cotizave
- **WHEN** la respuesta de cotizave trae los mercados `reference` y `eur_reference`
- **THEN** se ignoran y no se inserta ninguna tasa `bcv` ni `eur` a partir de ellos

#### Scenario: Falla el proveedor
- **WHEN** dolarvzla y cotizave fallan (respuesta no-OK o excepción)
- **THEN** responde 502 con `success: false` y no inserta nada

#### Scenario: Un mercado ausente
- **WHEN** falta el mercado `binance` en la respuesta de cotizave
- **THEN** se insertan `bcv` y `eur`, `binance` se reporta `skipped` y `success` es `false`

#### Scenario: Guarda la fecha de vigencia
- **WHEN** dolarvzla responde `current.date = 2026-10-19` con `usd = 881.0664`
- **THEN** la fila `bcv` se guarda con `rate = 881.0664` y `effective_date = 2026-10-19`

#### Scenario: Corrida en fin de semana
- **WHEN** el cron corre un sábado y dolarvzla devuelve `current.date` del lunes siguiente
- **THEN** se inserta una fila nueva con esa `effective_date` y su `updated_at` del sábado

#### Scenario: Fecha de vigencia inválida
- **WHEN** `current.date` llega ausente o con un formato inválido (`YYYY-MM-DD`)
- **THEN** `bcv` y `eur` se insertan con `effective_date` nula, se reporta un aviso y `success` no cambia por ese motivo

#### Scenario: Binance sin fecha de vigencia
- **WHEN** el cron inserta la tasa `binance`
- **THEN** `effective_date` queda nula y `source_updated_at` es el `updated_at` del mercado si existe

#### Scenario: Respuesta del cron
- **WHEN** termina una corrida
- **THEN** la respuesta incluye por tipo el resultado y la `effective_date` guardada, además de los avisos

### Requirement: Admin manual rate override
`setExchangeRate` SHALL requerir admin, SHALL rechazar tasas no finitas o <= 0 con `invalidData`, e insertar una fila con `source = 'admin'` y `updated_by` del admin.

#### Scenario: Tasa cero
- **WHEN** el admin envía una tasa de 0
- **THEN** la acción devuelve `invalidData`

### Requirement: Rate freshness
Una tasa SHALL considerarse fresca solo si tiene menos de 24 horas respecto de la fecha de referencia (`isRateFresh`); con una tasa ausente o vencida, `toUsd`, `fromUsd` y `convertAmount` SHALL devolver `null` en lugar de usar un valor antiguo.

#### Scenario: Tasa de hace 30 horas
- **WHEN** se convierte con una tasa de 30 h
- **THEN** el resultado es `null`

### Requirement: Rates as of a payment date
`getExchangeRatesAsOf(dateStr)` SHALL devolver, por tipo, la fila más reciente con `updated_at <= dateStr T23:59:59.999Z` (o `null`), y la conversión de un pago SHALL usar esas tasas y esa fecha como referencia de frescura, no el momento de ejecución. `getExchangeRatesAsOfForResident` SHALL hacer lo mismo con service-role solo si existe sesión de residente (devuelve `null` sin ella).

#### Scenario: Pago con fecha retroactiva
- **WHEN** el admin registra un pago fechado hace tres días
- **THEN** la conversión usa la tasa vigente a esa fecha

### Requirement: Rate history and display hint
`getExchangeRateHistory(monthsBack = 12)` SHALL devolver las tasas de los últimos `monthsBack` meses con `effective_date` y `source_updated_at`, en orden descendente. La tabla de filas del reporte Tasa de Cambio SHALL mostrar `effective_date` en una columna "Vigencia" ordenable. `referenceUsdAmount` SHALL calcular solo una pista de equivalente en USD para Bs/USDT, sin guardarla.

#### Scenario: Pista en formulario
- **WHEN** el residente o admin ingresa un monto en Bs con tasa fresca a la fecha elegida
- **THEN** se muestra el equivalente `amount / rate` en USD, sin persistirlo

#### Scenario: Pista sin tasa fresca
- **WHEN** no hay tasa fresca a la fecha elegida o el monto no es positivo
- **THEN** la pista es nula

#### Scenario: Columna Vigencia en el reporte
- **WHEN** el admin abre el reporte y hay una fila `bcv` insertada un sábado con `effective_date` del viernes
- **THEN** la fila muestra la fecha del viernes en Vigencia como texto `YYYY-MM-DD`, sin conversión de zona horaria, y la fecha/hora del sábado en la columna de inserción

#### Scenario: Fila sin fecha de vigencia
- **WHEN** la fila es `binance`, una tasa manual o una anterior a este change
- **THEN** la columna Vigencia muestra "—" y al ordenar por Vigencia esas filas quedan agrupadas (al inicio en orden ascendente y al final en descendente)

### Requirement: Funding breakdown on payment rows
`condo_payments.funding_breakdown` (jsonb, nulo salvo conversión) SHALL registrar para una fila pagada con otra moneda un arreglo con `{currency, amountDrawn, exchangeRate, exchangeRateType}`; las filas de misma moneda y los top-ups SHALL tener `null`. El recibo del admin y el detalle del residente (`/mi-cartera/[batchId]`) SHALL leer este campo para mostrar lo realmente recibido y la tasa.

#### Scenario: Fila convertida
- **WHEN** una cuota USD se paga con Bs
- **THEN** `funding_breakdown[0]` contiene la moneda Bs, el monto en Bs descontado, la tasa usada y `bcv`

### Requirement: Resident report status and rejection reason
En Mi Cartera el residente SHALL ver sus reportes con estado `pending`, `on_hold`, `confirmed` o `rejected`; para `rejected` SHALL ver el motivo (`rejection_reason`) si existe, y para `confirmed` con número de recibo, el enlace a su detalle.

#### Scenario: Último reporte rechazado
- **WHEN** el reporte más recientemente enviado fue rechazado con motivo
- **THEN** Mi Cartera muestra el aviso con ese motivo

#### Scenario: Reporte en espera
- **WHEN** un reporte está `on_hold`
- **THEN** Mi Cartera lo muestra con la etiqueta "En espera de tasa" y sin enlace a recibo

### Requirement: Cron rounds BCV rates and omits the source time
Para `bcv` y `eur`, el cron SHALL redondear la tasa a 4 decimales antes de insertarla, reportar ese mismo valor y guardar `source_updated_at` nulo, porque dolarvzla no entrega hora.

#### Scenario: Euro con más de 4 decimales
- **WHEN** dolarvzla responde `current.eur = 991.16445734`
- **THEN** la fila `eur` se guarda con `rate = 991.1645`, el resultado reporta ese mismo valor y `source_updated_at` queda nulo

### Requirement: Cron source failures are independent
Si dolarvzla falla (respuesta no OK, excepción o `current.usd` y `current.eur` inválidos), `bcv` y `eur` SHALL omitirse y reportarse con `success: false`, sin usar cotizave como respaldo. Si cotizave falla o falta `COTIZAVE_API_KEY`, solo `binance` SHALL omitirse y reportarse con `success: false`. La ruta SHALL responder 502 únicamente cuando ambas fuentes fallen.

#### Scenario: Falla dolarvzla
- **WHEN** dolarvzla responde no-OK o lanza excepción y cotizave responde bien
- **THEN** `bcv` y `eur` se reportan `skipped`, `binance` se inserta y `success` es `false`

#### Scenario: Falla cotizave
- **WHEN** cotizave responde no-OK o falta `COTIZAVE_API_KEY` y dolarvzla responde bien
- **THEN** `bcv` y `eur` se insertan, `binance` se reporta `skipped` y `success` es `false`

#### Scenario: Sin respaldo desde cotizave
- **WHEN** dolarvzla falla y cotizave sí trae el mercado `reference`
- **THEN** no se inserta ninguna tasa `bcv` ni `eur`

### Requirement: Weekend rate of the next business day
El cron SHALL insertar, en una corrida de sábado, domingo o feriado, la tasa BCV que dolarvzla entrega en `current` (la del próximo día hábil, publicada el viernes), de modo que un pago con fecha de fin de semana se convierta con esa tasa mediante la regla existente de "tasa a una fecha" (`updated_at`) y la frescura de 24 h, sin cambios en esas reglas.

#### Scenario: Pago fechado en sábado
- **WHEN** dolarvzla devolvió el viernes `current.date = 2026-10-19` y el cron del sábado 2026-10-17 insertó esa tasa
- **THEN** un pago en Bs fechado el 2026-10-17 se convierte con la tasa con `effective_date = 2026-10-19`

#### Scenario: Pago fechado en viernes
- **WHEN** el cron del viernes 2026-10-16 (06:00 VET) insertó `current.date = 2026-10-16` y el del sábado insertó la del lunes
- **THEN** un pago fechado el viernes, registrado el sábado o después, se convierte con la tasa del viernes

#### Scenario: Lunes feriado
- **WHEN** el lunes es feriado y el BCV publicó el viernes la tasa del martes
- **THEN** el cron del sábado, domingo y lunes inserta la tasa del martes y un pago fechado el lunes se convierte con ella

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

## Known Limitations
- Código muerto: `lib/payments/walletAllocation.ts` (`allocateWalletFunds`, prioridad de retiro Bs -> USDT -> USD, retiro mezclado de varias monedas, salto de cuotas no cubiertas) no tiene ningún llamador en `app/`, `lib/` ni `components/`. Su cabecera, la de la migración `wallet_funding_breakdown` y comentarios de `confirmPaymentReport` describen un flujo de "wallet allocation" que ya no se ejecuta: `confirmPaymentReport` ahora usa `applyPaymentAllocation`/`allocateFunds`, que usa solo UNA moneda de fondos por pago (la del pago/reporte) y se detiene en la primera cuota no cubierta.
- Por lo anterior, `funding_breakdown` hoy contiene a lo sumo un elemento (la UI lee solo `[0]`), aunque el esquema y `components/payments/types.ts` soportan varios.
- Crédito entre monedas: el saldo en una moneda no se aplica a cuotas de otra salvo cuando llega un pago nuevo en esa otra moneda; el barrido diario (`sweepStaleCreditsAgainstVencidaInstallments`) es solo de misma moneda, y `allocateFunds` solo convierte lo recibido más el crédito de la moneda del pago. Un crédito en Bs puede quedar sin usar contra cuotas USD vencidas hasta que se registre otro pago.
- Las comparaciones de frescura usan `updated_at` de la tasa contra `payment_date` (fin de día UTC). Sin tasa BCV fresca a esa fecha, un pago, reporte o gasto en Bs queda en espera y se libera solo cuando llega una tasa (cron o manual); con Binance/USDT sin tasa fresca se rechaza con `staleExchangeRate`. Si el cron de un día falla, un pago fechado ese día toma la tasa del día anterior si tiene menos de 24 h y se convierte con ella sin aviso.
- Cabeceras de migración/`exchangeRate.ts` aún hablan de tasa "puramente informativa"; hoy se usa para convertir y asignar.
- El horario real del cron es 10:00 UTC (06:00 VET); `vercel.json` no admite comentarios que lo documenten.
- `setExchangeRate` solo revalida `/dashboard`, no valida un rango razonable de la tasa (cualquier valor > 0) y, tras guardarla, libera lo que estaba en espera (si esa liberación falla solo se registra en el log).
- `getExchangeRatesAsOf` y `getLatestExchangeRates` usan el cliente de admin (RLS), por lo que dependen de una sesión admin; `fetchRatesAsOf` (`lib/rates/asOf.ts`, compartida con la liberación en service-role) toma el corte como UTC aunque el negocio es UTC-4.
- La cabecera de `app/.../mi-cartera/page.tsx` dice que NO muestra qué cuotas se pagaron (eso es `/mis-pagos`); la función de la página se llama `MisPagosPage` y renderiza `MisPagosClient`.
- No hay respaldo para `bcv` y `eur`: cotizave entrega el valor del viernes en fin de semana y usarlo de respaldo convertiría pagos con la tasa equivocada. Si dolarvzla cae no se insertan tasas nuevas y, pasadas 24 h, los pagos y gastos con conversión quedan en espera hasta que llegue una tasa o el admin fije una manual.
- El cron debe correr una sola vez al día (10:00 UTC): una corrida extra el viernes en la tarde insertaría la tasa del lunes con `updated_at` del viernes y los pagos fechados el viernes la tomarían.
- Un fallo parcial del cron (cae una sola fuente) responde HTTP 200 con `success: false`; Vercel Cron solo marca como fallida una respuesta no 2xx, así que nadie recibe aviso.
- `current.date` de dolarvzla no se valida como plausible: una fuente congelada con una fecha vieja se inserta como nueva y pasa por fresca.
- Un pago de gasto retenido guarda el monto pagado que escribió el admin sin ver la tasa; al liberarse solo se completa la tasa y no se concilia con ese monto.

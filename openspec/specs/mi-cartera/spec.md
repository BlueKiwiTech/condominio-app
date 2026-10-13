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
La conversión entre monedas SHALL ocurrir únicamente al aplicar fondos recibidos a una cuota de otra moneda (`allocateFunds` en `lib/payments/allocate.ts`) mediante `convertAmount`, con pivote USD (`toUsd` divide entre la tasa, `fromUsd` multiplica por ella). Reportes, morosos y saldos SHALL seguir por moneda sin sumarlas. Los fondos sin aplicar SHALL permanecer en su moneda original y SHALL convertirse solo cuando se apliquen, a la tasa vigente ese día.

#### Scenario: Conversión Bs a USD
- **WHEN** 4.000 Bs se aplican a una cuota de 100 USD con tasa BCV 40
- **THEN** el equivalente es `amount / rate` para Bs a USD y `usd * rate` para USD a Bs

#### Scenario: Misma moneda
- **WHEN** origen y destino son la misma moneda
- **THEN** `convertAmount` devuelve el monto sin tasa

### Requirement: Rate types and currency mapping
Existirán exactamente dos tipos de tasa: `bcv` (para `Bs`) y `binance` (para `USDT`); `USD` SHALL NOT requerir tasa (`rateTypeForCurrency`).

#### Scenario: Mapeo
- **WHEN** se consulta el tipo de tasa para `Bs`, `USDT` y `USD`
- **THEN** devuelve `bcv`, `binance` y `null` respectivamente

### Requirement: Exchange rate table is append-only
La tabla `condo_exchange_rates` (`rate_type` en `bcv|binance`, `rate` decimal(14,4) > 0, `source` en `cron|admin`, `updated_at`, `updated_by`) SHALL ser un historial de solo inserciones; la tasa "actual" SHALL ser la fila más reciente por `updated_at` de cada `rate_type`. RLS SHALL estar activo con política de admin; el cron y las lecturas del residente usan service-role.

#### Scenario: Nueva tasa
- **WHEN** se establece una tasa nueva
- **THEN** se inserta una fila nueva y las anteriores se conservan

### Requirement: Daily exchange-rate cron
La ruta `GET /api/cron/exchange-rate` (programada en `vercel.json` a las `0 10 * * *` UTC) SHALL exigir `Authorization: Bearer ${CRON_SECRET}` (401 si no coincide), SHALL requerir `COTIZAVE_API_KEY` (500 si falta), SHALL consultar `https://api.cotizave.com/v1/fx/rates` con cabecera `X-API-Key`, y SHALL insertar de forma independiente la tasa `bcv` (mercado `reference`, campo `mid`) y la `binance` (mercado `binance`) con `source = 'cron'` solo si son números > 0.

#### Scenario: Sin autorización
- **WHEN** falta o es incorrecto el Bearer
- **THEN** responde 401 y no inserta nada

#### Scenario: Falla el proveedor
- **WHEN** cotizave responde no-OK o la llamada lanza excepción
- **THEN** responde 502 con `success: false`

#### Scenario: Un mercado ausente
- **WHEN** falta el mercado `binance` en la respuesta
- **THEN** se inserta `bcv`, `binance` se reporta `skipped` y `success` es `false`

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
`getExchangeRateHistory(monthsBack = 12)` SHALL devolver las tasas de los últimos `monthsBack` meses ordenadas descendentemente. `referenceUsdAmount` SHALL calcular solo una pista de equivalente en USD para Bs/USDT (nulo si no hay tasa fresca o el monto no es positivo) sin guardarse.

#### Scenario: Pista en formulario
- **WHEN** el residente o admin ingresa un monto en Bs con tasa fresca a la fecha elegida
- **THEN** se muestra el equivalente `amount / rate` en USD, sin persistirlo

### Requirement: Funding breakdown on payment rows
`condo_payments.funding_breakdown` (jsonb, nulo salvo conversión) SHALL registrar para una fila pagada con otra moneda un arreglo con `{currency, amountDrawn, exchangeRate, exchangeRateType}`; las filas de misma moneda y los top-ups SHALL tener `null`. El recibo del admin y el detalle del residente (`/mi-cartera/[batchId]`) SHALL leer este campo para mostrar lo realmente recibido y la tasa.

#### Scenario: Fila convertida
- **WHEN** una cuota USD se paga con Bs
- **THEN** `funding_breakdown[0]` contiene la moneda Bs, el monto en Bs descontado, la tasa usada y `bcv`

### Requirement: Resident report status and rejection reason
En Mi Cartera el residente SHALL ver sus reportes con estado `pending`, `confirmed` o `rejected`; para `rejected` SHALL ver el motivo (`rejection_reason`) si existe, y para `confirmed` con número de recibo, el enlace a su detalle.

#### Scenario: Último reporte rechazado
- **WHEN** el reporte más recientemente enviado fue rechazado con motivo
- **THEN** Mi Cartera muestra el aviso con ese motivo

## Known Limitations
- Código muerto: `lib/payments/walletAllocation.ts` (`allocateWalletFunds`, prioridad de retiro Bs -> USDT -> USD, retiro mezclado de varias monedas, salto de cuotas no cubiertas) no tiene ningún llamador en `app/`, `lib/` ni `components/`. Su cabecera, la de la migración `wallet_funding_breakdown` y comentarios de `confirmPaymentReport` describen un flujo de "wallet allocation" que ya no se ejecuta: `confirmPaymentReport` ahora usa `applyPaymentAllocation`/`allocateFunds`, que usa solo UNA moneda de fondos por pago (la del pago/reporte) y se detiene en la primera cuota no cubierta.
- Por lo anterior, `funding_breakdown` hoy contiene a lo sumo un elemento (la UI lee solo `[0]`), aunque el esquema y `components/payments/types.ts` soportan varios.
- Crédito entre monedas: el saldo en una moneda no se aplica a cuotas de otra salvo cuando llega un pago nuevo en esa otra moneda; el barrido diario (`sweepStaleCreditsAgainstVencidaInstallments`) es solo de misma moneda, y `allocateFunds` solo convierte lo recibido más el crédito de la moneda del pago. Un crédito en Bs puede quedar sin usar contra cuotas USD vencidas hasta que se registre otro pago.
- Las comparaciones de frescura usan `updated_at` de la tasa contra `payment_date` (fin de día UTC); una tasa de más de 24 h antes de la fecha del abono bloquea el pago con `staleExchangeRate` aunque exista una anterior; un cron fallido un día puede bloquear pagos de ese día.
- Cabeceras de migración/`exchangeRate.ts` aún hablan de tasa "puramente informativa"; hoy se usa para convertir y asignar.
- El cron comenta "06:00 VET (0 10 * * *)" y el comentario del `vercel.json` no puede verificarse allí; el horario real es 10:00 UTC.
- `setExchangeRate` solo revalida `/dashboard`; no valida un rango razonable de la tasa (cualquier valor > 0).
- `getExchangeRatesAsOf` y `getLatestExchangeRates` usan el cliente de admin (RLS), por lo que dependen de una sesión admin; `fetchRatesAsOf` toma el corte como UTC aunque el negocio es UTC-4.
- La cabecera de `app/.../mi-cartera/page.tsx` dice que NO muestra qué cuotas se pagaron (eso es `/mis-pagos`); la función de la página se llama `MisPagosPage` y renderiza `MisPagosClient`.

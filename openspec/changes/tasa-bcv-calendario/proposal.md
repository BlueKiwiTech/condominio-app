# Proposal

## Why

El cron de tasas descarta el `effective_date` (fecha de vigencia) que entrega la API de cotizave para el BCV y el euro, así que no queda rastro de qué publicó realmente el proveedor en cada corrida (por ejemplo, el sábado y el domingo, cuando el BCV no publica). Además, el próximo change (pago de gastos en Bs con tasa USD/EUR/personalizada) necesita la tasa del euro, que la API ya entrega.

La regla de frescura NO cambia: una tasa vale si tiene menos de 24 h desde su inserción respecto de la fecha del pago. La operación garantiza que el cron corra todos los días (incluidos fines de semana y feriados), así que no hace falta una regla de vigencia por fecha del BCV.

## What Changes

- `condo_exchange_rates` guarda `effective_date` (fecha de vigencia publicada por la fuente, nula si la fuente no la entrega) y `source_updated_at` (hora de la fuente), solo como dato de auditoría.
- Nuevo tipo de tasa `eur` (BCV euro, mercado `eur_reference` de la API), insertado por el mismo cron. No se asocia a ninguna moneda de pago; lo consumirá el change de gastos. Sigue la regla de 24 h.
- El cron guarda `effective_date` y `source_updated_at` del BCV y del euro, y los incluye en su respuesta JSON.
- La tabla de filas del reporte Tasa de Cambio muestra una columna "Vigencia" ordenable con `effective_date` (formato `YYYY-MM-DD`, sin conversión de zona horaria), junto a la fecha/hora de inserción.
- `getExchangeRateHistory` devuelve los campos nuevos.

Fuera de alcance:
- Cambiar la regla de frescura de 24 h, la regla de "tasa a una fecha" o el comportamiento de pagos; los pagos con conversión siguen bloqueándose con `staleExchangeRate` si la tasa tiene 24 h o más.
- Vigencia por fecha del BCV, ventana de días, lista de feriados o calendario del BCV.
- Pago de gastos en otra moneda, tasa personalizada y bloqueo por saldo (change `gastos-pago-multimoneda`).
- Selección de cuotas especiales por el admin (change `abono-a-cuotas-especiales`).
- Cambios al gráfico y al filtro por mes del reporte de tasas (siguen usando `updated_at`); solo se agrega la columna en la tabla.
- Mostrar la fecha de vigencia en la tarjeta del panel.

## Capabilities

### New Capabilities
<!-- Ninguna: el comportamiento pertenece a una capacidad existente. -->

### Modified Capabilities
- `mi-cartera`: tipos de tasa (se agrega `eur`), estructura del historial de tasas (`effective_date`, `source_updated_at`), cron diario y reporte del historial.

## Impact

- BD: migración nueva sobre `condo_exchange_rates` (dos columnas nulas y el check de `rate_type` con `eur`). Sin backfill, sin cambios de RLS ni de índices; la tabla sigue siendo solo admin y el cron y las lecturas del residente usan service-role.
- Código: `lib/exchangeRate.ts` (tipos), `lib/actions/exchangeRate.ts`, `app/api/cron/exchange-rate/route.ts`, `lib/resident/queries.ts` (el tipo `eur` en los registros de tasas), `components/reports/ExchangeRateReportClient.tsx` y `messages/es.json`/`en.json`.
- Monedas: ninguna suma entre USD/Bs/USDT; este change no toca conversiones.
- Operación: la migración la aplica el usuario. Garantizar que el cron corra todos los días es responsabilidad operativa; si falla más de 24 h, los pagos con conversión se bloquean hasta que el admin fije una tasa manual.

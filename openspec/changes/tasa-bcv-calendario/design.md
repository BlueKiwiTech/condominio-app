# Design

## Context

Hoy `condo_exchange_rates` es un historial append-only (`rate_type` bcv|binance, `rate`, `source`, `updated_at`, `updated_by`). El cron diario (`app/api/cron/exchange-rate/route.ts`, 10:00 UTC) lee `https://api.cotizave.com/v1/fx/rates` e inserta una fila por tipo; la API devuelve para el BCV (`reference`) y el euro (`eur_reference`) un `effective_date` y un `updated_at` de la fuente que el cron ignora, y para los mercados P2P (`binance`) solo `updated_at`. Verificado el martes 2026-10-13: `reference` y `eur_reference` traían `effective_date: 2026-10-13`. No se ha observado un fin de semana ni un feriado.

La frescura actual (`isRateFresh`: `ahora/fecha_de_pago - updated_at < 24 h`, en `lib/exchangeRate.ts`) y el corte "a una fecha" (`updated_at <= D T23:59:59.999Z`, en `lib/actions/exchangeRate.ts`) se mantienen. Decisión del usuario: la operación garantiza que la tasa nunca tenga más de 24 h desde el pull; si la tasa es más vieja, no se registra el pago.

## Goals / Non-Goals

**Goals:**
- Registrar el `effective_date` y la hora de la fuente de cada tasa del BCV y del euro como rastro auditable, y tenerlo visible en el reporte de tasas.
- Almacenar la tasa del euro para el próximo change.

**Non-Goals:**
- Cambiar la regla de frescura, el corte por fecha o el comportamiento de pagos.
- Vigencia por fecha del BCV, ventana de días o calendario de feriados.
- UI de pago de gastos, tasa personalizada y bloqueo por saldo (otro change).
- Tocar el gráfico y el filtro por mes del reporte (siguen con `updated_at`).

## Decisions

**1. `effective_date date null` + `source_updated_at timestamptz null` en `condo_exchange_rates`.** Son solo auditoría. `effective_date` es la fecha de vigencia publicada por la fuente; es nula cuando la fuente no la entrega (`binance`, tasa manual del admin, filas históricas anteriores a este change) o cuando llega con un formato inválido. Nula en lugar de inventarla: rellenarla con "hoy" mezclaría la fecha de la fuente con la fecha de inserción. `updated_at` queda como hora de inserción (la que usa la regla de 24 h); `source_updated_at` guarda la de la fuente. Alternativa descartada: `effective_date not null` con backfill desde `updated_at`; produciría fechas inventadas indistinguibles de las reales.

**2. Una `effective_date` inválida o ausente NO omite la tasa.** Como la fecha es solo de auditoría y la frescura se mide por `updated_at`, descartar un valor válido por un dato auxiliar bloquearía pagos sin necesidad. Se inserta la tasa con `effective_date` nula y la respuesta del cron lo reporta como aviso (`warnings`), sin marcar `success: false`.

**3. La regla de frescura de 24 h aplica a los tres tipos, incluido `eur`.** El cron diario garantiza una fila reciente todos los días. Si el cron falla más de 24 h, los pagos con conversión se bloquean (`staleExchangeRate`) hasta que el admin fije una tasa manual: es el comportamiento deseado.

**4. Tipo `eur` sin mapeo a moneda.** `rateTypeForCurrency` no cambia; `ExchangeRateType` pasa a `'bcv' | 'eur' | 'binance'`. Las funciones que construyen `Record<ExchangeRateType, ...>` incluyen `eur` (puede ser `null`). El check de `rate_type` admite `eur`. El change de gastos lo consumirá.

**5. El cron inserta una fila por corrida y por tipo, sin deduplicar.** Mantiene el historial como bitácora: se verá en la tabla qué `effective_date` devolvió la API el sábado y el domingo.

**6. Columna "Vigencia" en la tabla del reporte, como texto.** `effective_date` es una fecha calendario (`YYYY-MM-DD`); se muestra sin pasarla por `new Date()` para evitar el corrimiento de un día por UTC (regla del proyecto: fechas calendario, nunca instantes UTC). Las filas con fecha nula muestran "—". La columna se ordena con `SortableTableHead`; las filas sin fecha se agrupan (al inicio en ascendente, al final en descendente) para no modificar el comparador compartido `useSortableTable`. Las filas `eur` aparecen en la tabla con la etiqueta `EUR (BCV)`; el gráfico solo traza `bcv` y `binance`. El gráfico y el filtro por mes siguen con `updated_at`.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* no se suma nada entre USD/Bs/USDT; este change no toca conversiones.
- *Idempotencia:* el cron ya inserta una fila por corrida; repetirlo agrega una fila equivalente sin alterar nada. La migración es reejecutable (`add column if not exists`, check recreado con `drop constraint if exists`).
- *Fechas:* `effective_date` es `date` y se muestra como texto `YYYY-MM-DD`; no se compara ni se convierte con instantes UTC.
- *RLS / `community_id`:* `condo_exchange_rates` es global a la instalación y no tiene `community_id` ni lo recibe aquí. Se mantiene la política de admin; las lecturas del residente van por service-role y solo con sesión de residente válida.

## Risks / Trade-offs

- [Si el cron falla más de 24 h los pagos con conversión se bloquean] → Es lo deseado; el admin fija una tasa manual. La garantía del pull diario es operativa.
- [La regla de 24 h se mide contra la fecha del pago] → Un pago con fecha pasada necesita una tasa insertada en las 24 h previas a esa fecha; el cron existe desde el 2026-09-08 y el backfill sella un registro por día. Sin cambios respecto de hoy.
- [Filas históricas sin `effective_date`] → Quedan con valor nulo y se muestran con "—"; no afecta pagos.
- [No se sabe qué `effective_date` entrega la API en fin de semana o feriado] → No bloquea nada, porque no interviene en la frescura; el rastro queda en la tabla para consulta.

## Migration Plan

1. Migración `supabase/migrations/20261013000000_exchange_rate_effective_date.sql` (la aplica el usuario antes de desplegar el código): `alter table condo_exchange_rates add column if not exists effective_date date, add column if not exists source_updated_at timestamptz`; reemplazar el check de `rate_type` por `('bcv','eur','binance')`.
2. Desplegar el código. El cron nuevo escribe las columnas, así que la migración va antes.
3. Rollback: revertir el código; las columnas nuevas son aditivas y nulas. El check ampliado admite `eur` sin romper el código previo (que no lo escribe).

## Open Questions

- Ninguna que bloquee. Opcional: tras el fin de semana del 17-18 de octubre, revisar en el reporte qué `effective_date` devolvió la API sábado y domingo; solo sirve de información para una decisión futura.

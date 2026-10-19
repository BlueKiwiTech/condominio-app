# Design

## Context

El cron ([app/api/cron/exchange-rate/route.ts](app/api/cron/exchange-rate/route.ts)) hace una sola llamada a `https://api.cotizave.com/v1/fx/rates` y de ahí saca `bcv` (mercado `reference`), `eur` (`eur_reference`) y `binance` (`binance`), con `effective_date` y `source_updated_at` en `condo_exchange_rates` (change `tasa-bcv-calendario`, archivado). Corre una vez al día a las 10:00 UTC (06:00 VET, `vercel.json`).

Observación del 2026-10-16 (viernes en la tarde): `https://rates.dolarvzla.com/bcv/current.json` respondió `{ current: { date: "2026-10-19", usd: 881.0664, eur: 991.16445734 }, previous: { date: "2026-10-16", usd: 880.1159, eur: 985.729808 }, changePercentage: { usd, eur } }`. Es decir, el BCV publica el viernes la tasa del próximo día hábil y dolarvzla la expone de inmediato; `current.date` es la fecha de vigencia. Cotizave no la muestra durante el fin de semana. Según la documentación de dolarvzla, los endpoints BCV son archivos JSON estáticos sin API key, sin rate limit y con CORS abierto; el endpoint USDT (Binance) exige una API key (`x-dolarvzla-key`) que dura 4 días.

La conversión de un pago usa `getExchangeRatesAsOf(paid_date)` (última fila por tipo con `updated_at` hasta el final de ese día) e `isRateFresh` (menos de 24 h respecto de la fecha de pago); ninguna de las dos cambia aquí.

## Goals / Non-Goals

**Goals:**
- Que el cron de sábado, domingo y feriado inserte la tasa BCV del próximo día hábil, para que los pagos de fin de semana se conviertan con la tasa que les corresponde.
- Mantener Binance en cotizave sin depender de una API key que caduca.

**Non-Goals:**
- El "en espera" de pagos y gastos por tasa no disponible (change `pagos-en-espera-por-tasa`).
- Cambiar la regla de 24 h, el corte por `updated_at` o el comportamiento de pagos y gastos.
- Respaldo de cotizave para `bcv` y `eur`, endpoint USDT de dolarvzla, migraciones o UI.

## Decisions

**1. `bcv` y `eur` salen de dolarvzla, `binance` de cotizave.** El cron hace dos llamadas independientes, ambas con `cache: 'no-store'` y un tiempo máximo de espera (`AbortSignal.timeout`, 10 s) para que una fuente colgada no consuma la función. La de dolarvzla no lleva cabeceras. La de cotizave solo se usa para `binance`. Alternativa descartada: todo en dolarvzla; el endpoint USDT exige una API key que dura 4 días y habría que renovarla constantemente.

**2. `effective_date = current.date`, `source_updated_at` nulo para `bcv`/`eur`.** Dolarvzla no entrega hora. `current.date` se valida con `YYYY-MM-DD` (y que sea una fecha real); si falta o es inválida, la tasa se inserta igualmente con `effective_date` nula y un aviso, igual que hoy: la fecha es de auditoría y no interviene en la frescura. `current.previous` se ignora.

**3. Redondeo explícito a 4 decimales.** La columna `rate` es `decimal(14,4)` y el euro llega con 8 decimales (`991.16445734`). Se redondea en el código (`Math.round(x * 10000) / 10000`) para que el valor reportado en la respuesta sea el mismo que queda guardado.

**4. Sin respaldo de cotizave para `bcv` y `eur`.** Cotizave entrega en fin de semana el valor del viernes; usarlo de respaldo haría que los pagos de sábado y domingo se convirtieran en silencio con la tasa equivocada. Si dolarvzla falla, `bcv` y `eur` se omiten y se reportan (`success: false`); tras 24 h sin tasa fresca, los pagos con conversión se bloquean (`staleExchangeRate`) y el admin puede fijar una tasa manual. Es preferible un bloqueo visible a una tasa equivocada invisible.

**5. Fallos independientes y 502 solo si fallan ambas.** Hoy cualquier fallo de cotizave devuelve 502 antes de insertar nada. Ahora cada fuente se evalúa por separado y el resultado de cada tipo se reporta en `results`; la ruta responde 502 únicamente cuando ninguna fuente respondió. Una falta de `COTIZAVE_API_KEY` ya no devuelve 500: solo `binance` queda `skipped`.

**6. El cron debe correr una sola vez al día, a las 10:00 UTC; `vercel.json` no cambia.** La regla "tasa a una fecha" toma, para un pago fechado `D`, la última fila con `updated_at` hasta el final de `D`. Con el cron de 06:00 VET:

| Pago fechado | Fila que le toca | `effective_date` |
|---|---|---|
| Viernes 16 | cron del viernes (`current` = viernes) | 2026-10-16 |
| Sábado 17 | cron del sábado (`current` = lunes) | 2026-10-19 |
| Domingo 18 | cron del domingo (`current` = lunes) | 2026-10-19 |
| Lunes 19 | cron del lunes (`current` = lunes) | 2026-10-19 |

Si el cron corriera además el viernes en la tarde, insertaría la tasa del lunes con `updated_at` del viernes y un pago fechado el viernes la tomaría en lugar de la del viernes. Por eso no se agrega ninguna corrida adicional.

**7. Borde conocido: pago fechado sábado registrado antes del cron.** Si el admin registra un pago fechado el sábado antes de las 06:00 VET de ese sábado, aún no existe la fila del sábado y se usa la del viernes (que sigue fresca, menos de 24 h). Es un caso de pocas horas y se acepta; el "en espera" (otro change) lo cubriría.

**8. Feriado en lunes.** Si el lunes es feriado, el BCV publica el viernes la tasa del martes y dolarvzla la devuelve en `current` desde entonces, así que el cron del sábado, domingo y lunes inserta la del martes y un pago fechado el lunes la usa. No hace falta lista de feriados.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* no cambia ninguna conversión ni suma; solo cambia el origen del valor de `bcv` y `eur`.
- *Idempotencia:* el cron sigue insertando una fila por corrida y tipo, sin deduplicar; repetirlo el mismo día agrega una fila equivalente. No hay migración.
- *Fechas:* `effective_date` es una cadena `YYYY-MM-DD` validada sin conversión de zona horaria; la frescura sigue por `updated_at`.
- *RLS / `community_id`:* sin cambios: el cron inserta con service-role en `condo_exchange_rates`, global a la instalación y solo admin.

## Risks / Trade-offs

- [Dolarvzla es gratuito, sin garantías ni SLA] → Si cambia el formato o cae, `bcv` y `eur` se omiten y se reportan; los pagos con conversión se bloquean tras 24 h y el admin fija una tasa manual. Cuenta con la garantía operativa del cron diario.
- [`current.date` asumido como fecha de vigencia] → Confirmado por el usuario con el caso del 2026-10-16/19. La primera verificación en producción es el sábado 2026-10-17: debe haber una fila `bcv` con `effective_date = 2026-10-19`.
- [Borde del sábado antes del cron] → Aceptado (decisión 7).
- [Si BCV publicara antes de las 06:00 VET del viernes la tasa del lunes] → el cron del viernes guardaría la del lunes y los pagos fechados el viernes la tomarían; no se espera porque el BCV publica por la tarde.
- [El euro pierde 4 decimales] → Aceptado: la columna ya es de 4 decimales y un cambio de precisión sería otra decisión.

## Migration Plan

1. Desplegar el código; no hay migración ni variables nuevas (`COTIZAVE_API_KEY` se conserva para Binance).
2. Rollback: revertir el código; el cron vuelve a leer `bcv`, `eur` y `binance` de cotizave.

## Open Questions

- Ninguna que bloquee. Pendiente de verificación real: el sábado 2026-10-17, confirmar la fila `bcv` con `effective_date = 2026-10-19` y que un pago de prueba fechado ese sábado la use.

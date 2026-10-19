# Proposal

## Why

El BCV publica el viernes en la tarde la tasa del próximo día hábil (el lunes, o el martes si el lunes es feriado), pero cotizave no la muestra durante el fin de semana: el cron de sábado y domingo guarda el valor del viernes. Resultado: los pagos con conversión fechados en sábado, domingo o lunes feriado se valoran con la tasa del viernes y no con la que corresponde. `rates.dolarvzla.com` ya publica esa tasa el viernes (`current.date` es la fecha de vigencia: el viernes 2026-10-16 devolvió `current.date = 2026-10-19`), de modo que si el cron la toma de ahí, el cron del sábado y del domingo ya inserta la tasa del lunes (o del martes) y los pagos de fin de semana la usan con la lógica que ya existe.

## What Changes

- El cron diario obtiene `bcv` (`current.usd`) y `eur` (`current.eur`) de `https://rates.dolarvzla.com/bcv/current.json` (gratis, sin API key). `effective_date` es `current.date`.
- `binance` sigue saliendo de cotizave (mercado `binance`, campo `mid`, `COTIZAVE_API_KEY`). El endpoint USDT de dolarvzla se descarta porque exige una API key que dura 4 días.
- Las dos fuentes son independientes: si dolarvzla falla, `bcv` y `eur` se omiten y se reportan, sin usar cotizave como respaldo (en fin de semana entrega el valor del viernes y los pagos usarían en silencio la tasa equivocada); si cotizave falla o falta `COTIZAVE_API_KEY`, solo `binance` se omite y se reporta. La ruta responde 502 solo si fallan ambas.
- La respuesta del cron mantiene `results`, `effective_dates` y `warnings`.
- `bcv` y `eur` dejan de leer los mercados `reference` y `eur_reference` de cotizave; `source_updated_at` queda nulo para ellos (dolarvzla no entrega hora).
- Se documenta que el cron debe seguir corriendo una sola vez al día a las 10:00 UTC y los bordes que eso implica.

Fuera de alcance:
- El "en espera" de pagos, abonos y gastos cuando falta la tasa del próximo día hábil (change `pagos-en-espera-por-tasa`): queda en pausa porque la tasa del próximo día hábil ya estará disponible.
- Cambiar la regla de frescura de 24 h, el corte "a una fecha" por `updated_at` o el comportamiento de pagos y gastos.
- El endpoint USDT de dolarvzla y su API key.
- Migraciones (las columnas `effective_date` y `source_updated_at` ya existen) y cambios de interfaz.
- Cotizave como respaldo de `bcv` y `eur`.

## Capabilities

### New Capabilities
<!-- Ninguna: el comportamiento pertenece a una capacidad existente. -->

### Modified Capabilities
- `mi-cartera`: el requisito "Daily exchange-rate cron" cambia de fuente para `bcv` y `eur`, su política de fallos y el origen de `effective_date`.

## Impact

- Código: `app/api/cron/exchange-rate/route.ts` (fuentes, parseo, fallos independientes, comentarios) y `.env.example` (cotizave solo para Binance, dolarvzla sin clave).
- BD: ninguno. Sin migraciones, sin cambios de RLS ni de índices; el cron sigue insertando con service-role.
- Monedas: ninguna conversión ni suma cambia; solo cambia de dónde sale el valor de `bcv` y `eur`.
- Operación: sin variables nuevas (`COTIZAVE_API_KEY` se conserva para Binance). Dolarvzla es un servicio gratuito sin garantías: si falla, los pagos con conversión se bloquean tras 24 h hasta que el admin fije una tasa manual.

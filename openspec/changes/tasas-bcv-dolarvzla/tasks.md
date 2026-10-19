# Tasks

## 1. Cron de tasas (`app/api/cron/exchange-rate/route.ts`)

- [ ] 1.1 Leer `bcv` y `eur` de `https://rates.dolarvzla.com/bcv/current.json` (`current.usd`, `current.eur`, `current.date`) con `cache: 'no-store'` y `AbortSignal.timeout(10_000)`, y leer `binance` del mercado `binance` de cotizave solo con `COTIZAVE_API_KEY` (mismo timeout). Evaluar cada fuente por separado: si dolarvzla falla (no-OK, excepción, `usd` y `eur` inválidos), `bcv` y `eur` quedan `skipped` sin respaldo de cotizave; si cotizave falla o falta la clave, solo `binance` queda `skipped`; responder 502 con `success: false` únicamente si fallan ambas. Dejar de leer los mercados `reference` y `eur_reference`. Verificar: con ambas fuentes OK se insertan tres filas; simulando con `fetch` falso cada caso de fallo (solo dolarvzla, solo cotizave, ambas) el resultado coincide con el spec y con ambas caídas responde 502 sin insertar.
- [ ] 1.2 Guardar para `bcv` y `eur` `effective_date = current.date` validada con `YYYY-MM-DD` y fecha real (nula con aviso en `warnings` si falta o es inválida, sin cambiar `success`) y `source_updated_at` nulo; `binance` con `effective_date` nula y `source_updated_at` del `updated_at` del mercado si existe. Redondear la tasa a 4 decimales en el código antes de insertar y reportar ese mismo valor. Mantener `results`, `effective_dates` y `warnings` en la respuesta. Verificar: `current.eur = 991.16445734` se guarda y se reporta como `991.1645`; una `current.date` inválida inserta con `effective_date` nula y un aviso.
- [ ] 1.3 Actualizar los comentarios del encabezado de la ruta (fuentes por tipo, por qué no hay respaldo de cotizave para `bcv`/`eur`, y que el cron debe correr una sola vez al día a las 10:00 UTC) y `.env.example` (cotizave solo para Binance; dolarvzla BCV no necesita clave). Verificar: ningún comentario ni variable menciona cotizave como fuente de `bcv` o `eur`.

## 2. Cierre y verificación

- [ ] 2.1 Con el Supabase local (`scripts/e2e/setup-local-supabase.sh` y `NODE_ENV=test npm run dev`), ejecutar `GET /api/cron/exchange-rate` con el Bearer de `CRON_SECRET` y comprobar en `condo_exchange_rates` tres filas nuevas: `bcv` y `eur` con la `effective_date` y el valor que devuelve `current.json`, y `binance` con `effective_date` nula; sin Bearer responde 401. Verificar con un pago de prueba que la fila más reciente por `updated_at` es la que usa `getExchangeRatesAsOf`. Anotar el resultado.
- [ ] 2.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados (`use-mobile.ts`, `SplitAmounts.tsx`, `CuotaFormClient.tsx`, `GastoFormClient.tsx`).
- [ ] 2.3 Ejecutar el agente `spec-auditor` sobre `mi-cartera` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- No hay migración: el despliegue no requiere pasos previos en Supabase.
- Revisar el diff con `/pr` (corre el revisor adversarial) y publicar la rama con GitHub Desktop.
- Tras desplegar, el sábado 2026-10-17 verificar en producción la fila `bcv` con `effective_date = 2026-10-19` (cron de las 10:00 UTC).
- Archivar con `/opsx:archive` una vez verificado el fin de semana.

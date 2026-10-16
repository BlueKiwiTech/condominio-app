# Tasks

## 1. Migración de base de datos

- [x] 1.1 Crear `supabase/migrations/20261013000000_exchange_rate_effective_date.sql` que agregue `effective_date date` y `source_updated_at timestamptz` (ambas nulas, `add column if not exists`) a `condo_exchange_rates` y reemplace el check de `rate_type` por `('bcv','eur','binance')` (`drop constraint if exists` + `add constraint`). Sin backfill ni cambios de índice o RLS. Verificar: releer que usa el prefijo `condo_`, que es reejecutable y que no toca filas existentes; la migración NO se aplica desde aquí.
- [x] 1.2 Migración lista para que el usuario la aplique: entregar el nombre del archivo y recordar que va antes de desplegar el código. Verificar: el timestamp es posterior a `20260929010000_payment_report_rejection_reason.sql`.

## 2. Tipos (`lib/exchangeRate.ts`, `lib/resident/queries.ts`)

- [x] 2.1 Ampliar `ExchangeRateType` a `'bcv' | 'eur' | 'binance'` y `ExchangeRateRow` con `effective_date: string | null` y `source_updated_at: string | null`; mantener `rateTypeForCurrency` sin mapeo para `eur` y no tocar `isRateFresh`. Ajustar los consumidores que construyen `Record<ExchangeRateType, ...>` (p. ej. `lib/resident/queries.ts`) para incluir `eur: null` o la fila. Verificar: `npx tsc --noEmit` sin errores.

## 3. Acciones y consultas (`lib/actions/exchangeRate.ts`)

- [x] 3.1 Incluir las columnas nuevas en los `select` de las consultas de tasas (`getLatestExchangeRates`, `fetchRatesAsOf`) y el tipo `eur` en el resultado por tipo, sin cambiar el filtro por `updated_at`. Verificar: `tsc` sin errores y la tasa usada por un pago de prueba no cambia respecto de antes.
- [x] 3.2 Hacer que `getExchangeRateHistory` devuelva `effective_date` y `source_updated_at`. `setExchangeRate` no cambia (deja `effective_date` nula). Verificar: el historial devuelve ambos campos y una tasa manual queda con `effective_date` nula.

## 4. Cron (`app/api/cron/exchange-rate/route.ts`)

- [x] 4.1 Leer del mercado `reference` (bcv) y de `eur_reference` (eur) `mid`, `effective_date` y `updated_at`; validar `effective_date` con `YYYY-MM-DD` (nula si falta o es inválida, con aviso en `warnings` sin afectar `success`); insertar con `effective_date` y `source_updated_at`; insertar `binance` con `effective_date` nula y `source_updated_at`; incluir por tipo el resultado y la `effective_date` en la respuesta JSON. Verificar: invocar `GET /api/cron/exchange-rate` localmente con el Bearer de `CRON_SECRET` y comprobar en `condo_exchange_rates` tres filas nuevas (bcv, eur, binance) con sus fechas; sin Bearer responde 401.

## 5. Reporte de tasas (`components/reports/ExchangeRateReportClient.tsx`)

- [x] 5.1 Agregar la columna "Vigencia" (`effective_date`) ordenable con `SortableTableHead` a la tabla de filas, junto a la fecha/hora de inserción. Mostrar `YYYY-MM-DD` como texto, sin pasar por `new Date()` (evita el corrimiento UTC), con "—" si es nula y las nulas agrupadas al ordenar (sin tocar el comparador compartido); agregar las claves nuevas (`table.effectiveDate` y `type.eur`) en `messages/es.json` y `messages/en.json`. El gráfico y el filtro por mes no cambian. Verificar: una fila `bcv` insertada el sábado con `effective_date` del viernes muestra la fecha del viernes en Vigencia y la del sábado en la otra columna; ordenar por Vigencia reordena y agrupa las filas sin fecha.

## 6. Specs, cierre y verificación

- [x] 6.1 Verificar que el cron guardó las fechas (revisar las filas nuevas en el reporte) y que un pago en Bs con tasa de menos de 24 h sigue registrándose y con tasa vencida devuelve `staleExchangeRate`. Opcional: tras el fin de semana del 17-18 de octubre de 2026, anotar qué `effective_date` devolvió la API sábado y domingo.
- [x] 6.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores.
- [x] 6.3 Ejecutar el agente `spec-auditor` sobre `mi-cartera` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- Revisar el diff con `/pr` (corre el revisor adversarial) y publicar la rama con GitHub Desktop.
- Aplicar la migración del punto 1 en Supabase antes de desplegar el código.
- Archivar con `/opsx:archive` una vez verificado el cron y el reporte.

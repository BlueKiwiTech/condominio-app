# Tasks

## 1. Migración de base de datos

- [x] 1.1 Crear `supabase/migrations/20261016000000_expense_payment_rate.sql` que agregue a `condo_expenses` las columnas nulas `exchange_rate decimal(14,4)`, `exchange_rate_type varchar`, `reference_amount decimal(12,2)` y `reference_currency varchar` (`add column if not exists`), con checks de `exchange_rate_type` en `bcv|eur|binance|custom`, `reference_currency` en `USD|EUR|USDT`, `exchange_rate > 0`, y "las cuatro nulas o las cuatro con valor" (`drop constraint if exists` + `add constraint`). Sin backfill ni cambios de RLS o índices. Verificar: releer que usa el prefijo `condo_`, que es re-ejecutable y que no toca filas existentes; la migración NO se aplica desde aquí.
- [x] 1.2 Migración lista para que el usuario la aplique: entregar el nombre del archivo y recordar que va antes de desplegar el código. Verificar: el timestamp es posterior a `20261013000000_exchange_rate_effective_date.sql`.

## 2. Tipos y cálculo del equivalente

- [x] 2.1 Ampliar `ExpenseRow` en `components/gastos/types.ts` con `exchange_rate`, `exchange_rate_type`, `reference_amount` y `reference_currency` (todos nulos) y definir el tipo `ExpensePaymentRateType = 'bcv' | 'eur' | 'binance' | 'custom'`. Verificar: `npx tsc --noEmit` sin errores en los consumidores.
- [x] 2.2 Crear un helper puro (p. ej. `lib/gastos/paymentRate.ts`) con `referenceCurrencyFor(type)` (`bcv` y `custom` a `USD`, `eur` a `EUR`, `binance` a `USDT`) y `referenceAmount(amount, rate)` (`amount / rate` redondeado a 2 decimales). Verificar con un script desechable de Node: 8.800,00 Bs con tasa 880 da 10,00; 9.857,30 con 985,73 da 10,00; un caso de redondeo de medio centavo.

## 3. Validación y acción

- [x] 3.1 Ampliar `markExpensePaidSchema` en `lib/validation/gastos.ts` con `exchange_rate_type` (enum opcional) y `custom_rate` (número > 0, solo exigido cuando el tipo es `custom`), con los mensajes en `validation.gastos` de `messages/es.json` y `messages/en.json`. Verificar: `tsc` sin errores y el esquema rechaza `custom` sin tasa o con tasa 0.
- [x] 3.2 Actualizar `markExpensePaid` en `lib/actions/gastos.ts`: leer también `currency` del gasto; si es `Bs`, exigir `exchange_rate_type`; para `bcv`, `eur` y `binance` leer la tasa con `getExchangeRatesAsOf(paid_date)` en el servidor, exigir `isRateFresh` contra `paid_date` y devolver `staleExchangeRate` (clave nueva en `gastos.errors`) sin escribir si falta o está vencida; para `custom` usar la tasa recibida. Guardar `exchange_rate`, `exchange_rate_type`, `reference_amount` y `reference_currency` en el `update`, protegido con `.eq('status', 'pending')` y verificando que afectó una fila (si no, devolver `alreadyPaid`). Para gastos `USD` y `USDT` dejar las cuatro columnas nulas y el comportamiento actual. Verificar: gasto en Bs con tasa fresca se paga y guarda las cuatro columnas; con tasa vencida devuelve `staleExchangeRate` y sigue `pending`; `custom` guarda la tasa sin consultar la tabla; un gasto en USD se paga sin tasa; un segundo pago del mismo gasto devuelve `alreadyPaid`.

## 4. Diálogo de pago

- [x] 4.1 Seleccionar las columnas nuevas en `app/[locale]/(admin)/gastos/page.tsx` y mostrar en el diálogo "Marcar como pagado" de `components/gastos/GastosPageClient.tsx` la moneda del gasto. Si es `Bs`, agregar el combo de tasa (`bcv`, `eur`, `binance`, `custom`) con el valor de cada una cargado con `getExchangeRatesAsOf(paid_date)` (se recarga al cambiar la fecha), las opciones ausentes o vencidas deshabilitadas con aviso, un input de tasa para `custom` y el equivalente calculado en vivo con su moneda de referencia. Enviar `exchange_rate_type` (y `custom_rate`) a `markExpensePaid`. Textos nuevos en `messages/es.json` y `messages/en.json`, y UI con shadcn sobre Base UI según `design-system/asobarcelona/MASTER.md`. Verificar: en un gasto en USD el diálogo no cambia; en uno en Bs el combo muestra las cuatro opciones, cambiar la tasa o el monto actualiza el equivalente y cambiar la fecha recarga las tasas.

## 5. Lista de gastos pagados

- [x] 5.1 Seleccionar las columnas nuevas en `app/[locale]/(admin)/gastos-pagados/page.tsx` y agregar a la tabla de `components/gastos/GastosPagadosPageClient.tsx` las columnas "Tasa" (valor y tipo) y "Equivalente" (monto y moneda de referencia), ordenables, con "—" cuando son nulas y sin agregar totales (la lista no tiene) ni usar `reference_amount` en ningún agregado. Textos nuevos en `messages/es.json` y `messages/en.json`. Verificar: un gasto en Bs pagado con `bcv` muestra tasa, tipo y equivalente; uno en USD o pagado antes del change muestra "—"; "Gastos pendientes del mes" del dashboard sigue agrupado por moneda original sin equivalentes.

## 6. Documentación de la excepción

- [x] 6.1 Declarar la segunda excepción de conversión (pago de gastos en Bs) en `CLAUDE.md` (mención de la excepción de Mi Cartera en Architecture) y en la regla transversal de `openspec/config.yaml`. Verificar: ambos textos nombran las dos excepciones y remiten a los specs `mi-cartera` y `gastos`.

## 7. Cierre y verificación

- [x] 7.1 Con la migración aplicada en el entorno local, probar a mano: pagar un gasto en Bs con cada tipo de tasa y con una tasa personalizada, confirmar las columnas en `condo_expenses` y la lista de pagados, un gasto en USD sin tasa y el bloqueo con tasa vencida (o con una `paid_date` sin tasa fresca). Anotar el resultado.
- [x] 7.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados (`use-mobile.ts`, `SplitAmounts.tsx`, `CuotaFormClient.tsx`, `GastoFormClient.tsx`).
- [x] 7.3 Ejecutar el agente `spec-auditor` sobre `gastos` y `mi-cartera` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- Revisar el diff con `/pr` (corre el revisor adversarial) y publicar la rama con GitHub Desktop.
- Aplicar la migración del punto 1 en Supabase antes de desplegar el código.
- Archivar con `/opsx:archive` una vez verificado el flujo de pago de gastos en Bs.

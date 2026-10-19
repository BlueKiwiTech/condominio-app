# Tasks

> Nota: una primera versión de estas tareas (solo gastos en Bs, con Binance y sin moneda de pago) ya está implementada en `main` local, sin publicar. Esta revisión reabre las tareas de código afectadas para ajustarlas a la nueva regla (moneda de pago siempre visible, combo `bcv`/`eur`/personalizada, sin Binance).

## 1. Migración de base de datos

- [x] 1.1 Editar `supabase/migrations/20261016000000_expense_payment_rate.sql` (no está aplicada en producción ni publicada): agregar `paid_currency varchar` (check `USD|Bs`) y `paid_amount decimal(12,2)` (check `> 0`); dejar `exchange_rate_type` en `bcv|eur|custom` y `reference_currency` en `USD|EUR` (quitar `binance` y `USDT`); reemplazar el check "las cuatro nulas o con valor" (`condo_expenses_payment_rate_all_or_none_check`, a eliminar con `drop constraint if exists`) por checks de pares (`exchange_rate` con `exchange_rate_type`; `reference_amount` con `reference_currency`; `paid_currency` con `paid_amount`) y de dependencia (lo pagado y el equivalente solo con tasa). Sin backfill ni cambios de RLS o índices. Verificar: releer que usa el prefijo `condo_`, que es re-ejecutable aunque una base local ya haya aplicado la primera versión, y aplicarla con `supabase db reset` en el stack local sin errores; la migración NO se aplica en producción desde aquí.
- [x] 1.2 Migración lista para que el usuario la aplique: recordar que va antes de desplegar el código y que sustituye a la versión anterior del mismo archivo (que no estaba aplicada en producción). Verificar: el timestamp sigue siendo posterior a `20261013000000_exchange_rate_effective_date.sql`.

## 2. Tipos y cálculo

- [x] 2.1 Ajustar `ExpenseRow` en `components/gastos/types.ts` (agregar `paid_currency` y `paid_amount`) y `ExpensePaymentRateType` a `'bcv' | 'eur' | 'custom'`. Verificar: `npx tsc --noEmit` sin errores en los consumidores.
- [x] 2.2 Ajustar el helper puro `lib/gastos/paymentRate.ts`: quitar `binance` de `EXPENSE_PAYMENT_RATE_TYPES` y de `referenceCurrencyFor` (`bcv` y `custom` a `USD`, `eur` a `EUR`; el tipo `ExpenseReferenceCurrency` pasa a `'USD' | 'EUR'`) y agregar el cálculo del monto pagado entre monedas (`USD` a `Bs` multiplica por la tasa, `Bs` a `USD` divide, redondeado a 2 decimales, nulo con entradas inválidas). Verificar con un script desechable de Node: 110 × 881,0664 = 96.917,30; 110 × 991,1645 = 109.028,10; 96.917,30 ÷ 881,0664 = 110,00; 8.800 ÷ 880 = 10,00; 9.857,30 ÷ 985,73 = 10,00; un caso de redondeo de medio centavo.

## 3. Validación y acción

- [x] 3.1 Ajustar `markExpensePaidSchema` en `lib/validation/gastos.ts`: `exchange_rate_type` pasa a `bcv|eur|custom`; agregar `payment_currency` (enum `USD|Bs`, opcional) y `paid_amount` (número > 0, opcional); `custom_rate` sigue exigido solo con `custom`. Mensajes en `validation.gastos` de `messages/es.json` y `messages/en.json`. Verificar con un script desechable: `binance` se rechaza, `custom` sin tasa o con tasa 0 se rechaza, `paid_amount` 0 o negativo se rechaza.
- [x] 3.2 Reescribir la lógica de moneda y tasa de `markExpensePaid` en `lib/actions/gastos.ts` según la matriz del design: leer `currency` del gasto; tomar la moneda de pago (por defecto la del gasto, `USDT` fija para gastos en `USDT`); exigir `exchange_rate_type` cuando alguna de las dos monedas sea `Bs`; para `bcv` y `eur` leer la tasa con `getExchangeRatesAsOf(paid_date)` y exigir `isRateFresh` (si no, `staleExchangeRate` sin escribir); para `custom` usar la tasa recibida redondeada a 4 decimales. Si la moneda de pago difiere de la del gasto: exigir `paid_amount`, conservar `amount` y guardar `paid_currency`, `paid_amount`, `exchange_rate` y `exchange_rate_type`. Si es `Bs` pagado en `Bs`: sobrescribir `amount` y guardar la tasa, `reference_amount` y `reference_currency`. Si es `USD` pagado en `USD` o `USDT`: comportamiento actual con las seis columnas nulas. Mantener el `update` protegido con `.eq('status', 'pending')`. Verificar: cada fila de la matriz guarda lo esperado (gasto de 110 USD pagado en Bs con tasa 881,0664 conserva `amount = 110` y guarda `paid_amount` y `paid_currency = 'Bs'`; gasto en Bs pagado en USD; Bs pagado en Bs con equivalente; USD pagado en USD sin tasa), con tasa vencida devuelve `staleExchangeRate` y sigue `pending`, `custom` no consulta la tabla, y un segundo pago devuelve `alreadyPaid`.

## 4. Diálogo de pago

- [x] 4.1 En `components/gastos/GastosPageClient.tsx` mostrar siempre la moneda de pago: selector `USD`/`Bs` con la moneda del gasto por defecto (y `USDT` fija para gastos en `USDT`), el combo de tasa (`bcv`, `eur`, `custom`, sin Binance) cuando alguna de las dos monedas sea `Bs`, y el input del monto pagado prellenado con el monto convertido y editable (recalculado al cambiar moneda, tasa, fecha o monto del gasto). Mantener la carga de tasas con `getExchangeRatesAsOf(paid_date)` (se recarga al cambiar la fecha) con las opciones ausentes o vencidas deshabilitadas, el input de tasa para `custom` y el envío de `payment_currency`, `paid_amount`, `exchange_rate_type` y `custom_rate`. Textos nuevos en `messages/es.json` y `messages/en.json` (quitando `markPaidDialog.rateTypes.binance`) y UI con shadcn sobre Base UI según `design-system/asobarcelona/MASTER.md`. Verificar: un gasto en USD muestra el selector con `USD` y sin combo; al elegir `Bs` aparece el combo y el monto se recalcula; un gasto en Bs muestra el combo con `Bs` y al elegir `USD` recalcula el monto en dólares; un gasto en USDT muestra `USDT` fija sin combo.

## 5. Lista de gastos pagados

- [x] 5.1 En `app/[locale]/(admin)/gastos-pagados/page.tsx` y `components/gastos/GastosPagadosPageClient.tsx` seleccionar `paid_currency` y `paid_amount` y mostrar columnas "Pagado" (monto y moneda), "Tasa" (valor y tipo, sin `binance`) y "Equivalente", ordenables, con "—" cuando son nulas y sin agregar totales ni usar esos montos en ningún agregado; seleccionar también las columnas nuevas en `app/[locale]/(admin)/gastos/page.tsx`. Textos en `messages/es.json` y `messages/en.json`. Verificar: un gasto en USD pagado en Bs muestra monto pagado, tasa y tipo; un gasto en Bs pagado en Bs muestra tasa y equivalente; uno en USD pagado en USD o anterior al change muestra "—"; "Gastos pendientes del mes" del dashboard sigue agrupado por moneda original sin esos montos.

## 6. Documentación de la excepción

- [x] 6.1 Ajustar en `CLAUDE.md` (Architecture) y en la regla transversal de `openspec/config.yaml` la segunda excepción de conversión: pagar un gasto con alguna moneda en Bs, eligiendo tasa BCV dólar, BCV euro o personalizada (ya no menciona Binance), con lo pagado y el equivalente guardados por fila sin entrar en ningún total. Verificar: ambos textos nombran las dos excepciones, no mencionan Binance para gastos y remiten a los specs `mi-cartera` y `gastos`.

## 7. Cierre y verificación

- [x] 7.1 Con el Supabase local (`scripts/e2e/setup-local-supabase.sh`, migración aplicada, `NODE_ENV=test npm run dev`), probar de punta a punta cada fila de la matriz: USD pagado en USD, USD pagado en Bs (tasa dólar, tasa euro y personalizada), Bs pagado en Bs y Bs pagado en USD, un gasto en USDT, el bloqueo con tasa vencida y con una `paid_date` sin tasa fresca, y la lista de pagados. Anotar el resultado.
- [x] 7.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados (`use-mobile.ts`, `SplitAmounts.tsx`, `CuotaFormClient.tsx`, `GastoFormClient.tsx`).
- [x] 7.3 Ejecutar el agente `spec-auditor` sobre `gastos` y `mi-cartera` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- Ajustar el change `pagos-en-espera-por-tasa` a esta regla de monedas (el "en espera" de gastos debe cubrir también un gasto en USD pagado en Bs con tasa BCV o euro).
- Aplicar la migración del punto 1 en Supabase antes de desplegar el código.
- Revisar el diff con `/pr` (corre el revisor adversarial) y publicar la rama con GitHub Desktop.
- Archivar con `/opsx:archive` una vez verificado el flujo de pago de gastos.

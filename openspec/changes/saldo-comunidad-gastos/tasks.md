# Tasks

## 1. Cálculo del saldo

- [x] 1.1 Crear `lib/reporting/communityBalance.ts` con las funciones puras `communityBalance` (por moneda: lo aplicado a cuotas por moneda de financiamiento, sin contar filas con `installment_id` nulo, más los créditos, menos los gastos `paid`/`on_hold`) y `expenseCashOut` (moneda y monto que sale de caja de un pago de gasto), en centavos enteros. Verificar con un script desechable de Node: pago en la moneda de la cuota; Bs a una cuota en USD (cuenta como Bs); sobrante a saldo a favor (cuenta una vez, sin la fila de depósito); consumo posterior de crédito (no cambia el saldo); fila de barrido; desglose antiguo con varios elementos; gasto pagado en otra moneda; gasto USDT; gasto en espera cuenta como gastado.
- [x] 1.2 Agregar la consulta (módulo en `lib/reporting/`, p. ej. `communityBalanceQuery.ts`, con el tipo de cliente de `lib/supabase/dbClient.ts`) que carga con selects mínimos `condo_payments` (`installment_id, amount_paid, currency, funding_breakdown`), `condo_house_credits` (`currency, balance`) y `condo_expenses` (`status, currency, amount, paid_currency, paid_amount`, sin borrados) y devuelve el saldo por moneda. Verificar contra el Supabase local con datos sembrados que coincide con el cálculo manual de la fórmula del design.

## 2. Validación del pago de gastos

- [x] 2.1 En `markExpensePaid` (`lib/actions/gastos.ts`) calcular lo que sale de caja con `expenseCashOut` y, antes de escribir y también cuando el gasto quedaría `on_hold`, comparar con el saldo de esa moneda en centavos y devolver `insufficientCommunityBalance` (moneda, disponible, necesario y faltante) si no alcanza; no validar en `lib/payments/releaseHeld.ts`. Agregar el mensaje en `gastos.errors` de `messages/es.json` y `messages/en.json`. Verificar: con saldo suficiente el gasto se paga; con saldo insuficiente se bloquea y sigue `pending`; se valida la moneda de pago (USD pagado en Bs mira el saldo en Bs); saldo justo permite pagar; un gasto que iba a quedar en espera también se bloquea; la liberación no revalida.

## 3. Interfaz

- [x] 3.1 En `app/[locale]/(admin)/dashboard/page.tsx` y `components/dashboard/DashboardPageClient.tsx` cargar los créditos y las columnas de pago de los gastos y agregar la tarjeta "Saldo de la comunidad" por moneda (sin sumar monedas, con vacío y con importes negativos), sin exponerla al residente ni reutilizar la etiqueta "saldo disponible". Textos en `messages/es.json` y `messages/en.json`, y UI con shadcn sobre Base UI según `design-system/asobarcelona/MASTER.md`. Verificar: con cobros y gastos en USD y Bs la tarjeta muestra cada importe aparte; sin movimientos muestra el texto de vacío; un saldo negativo se ve negativo.
- [x] 3.2 En `app/[locale]/(admin)/gastos/page.tsx` calcular el saldo y pasarlo a `components/gastos/GastosPageClient.tsx`; en el diálogo "Marcar gasto como pagado" mostrar "Saldo disponible en {moneda}" para la moneda de pago elegida y, si el monto a pagar lo supera, el aviso con el faltante y la confirmación deshabilitada, recalculado al cambiar moneda o monto. Textos en es/en. Verificar: con saldo suficiente permite confirmar; con saldo insuficiente muestra el faltante y deshabilita; cambiar la moneda de pago cambia el saldo mostrado.

## 4. Cierre y verificación

- [x] 4.1 Con el Supabase local (`scripts/e2e/setup-local-supabase.sh`, `NODE_ENV=test npm run dev`), probar de punta a punta: cobrar en USD y en Bs (incluido un abono en Bs a una cuota en USD y uno con sobrante a saldo a favor), ver la tarjeta del dashboard, pagar un gasto con saldo suficiente, intentar uno sin saldo (bloqueo con faltante en el diálogo y en el servidor), pagar un gasto USD en Bs validando el saldo en Bs, y un gasto que quedaría en espera sin saldo (bloqueado). Anotar el resultado.
- [x] 4.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados (`use-mobile.ts`, `SplitAmounts.tsx`, `CuotaFormClient.tsx`, `GastoFormClient.tsx`).
- [x] 4.3 Ejecutar el agente `spec-auditor` sobre `gastos` y `reporting-morosos` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- No hay migración: el despliegue no requiere pasos previos en Supabase.
- Revisar el diff con el agente `adversarial-reviewer` antes de fusionar.
- Al archivar, agregar a Known Limitations de `gastos`: sin saldo inicial el saldo puede salir insuficiente y bloquear gastos legítimos; dos pagos simultáneos pueden gastar el mismo saldo; las filas antiguas sin desglose cuentan en la moneda de la fila.
- Archivar con `/opsx:archive` una vez verificado el flujo.

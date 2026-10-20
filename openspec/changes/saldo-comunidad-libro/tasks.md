# Tasks

## 1. Migración de base de datos

- [x] 1.1 Crear `supabase/migrations/<timestamp posterior a 20261020000000>_community_balance_ledger.sql` con las tablas `condo_community_balances` y `condo_community_movements` (`community_id`, RLS solo lectura para `condo_is_community_admin`, sin políticas de escritura), el índice único parcial por `(community_id, type, reference_id)` y el único de `opening` por moneda, las funciones `condo_apply_payment_batch`, `condo_pay_expense` y `condo_add_community_movement` (`security definer`, `search_path = ''`, solo admin de la comunidad o `service_role`, revocadas de `public`) y el backfill por comunidad y moneda como un movimiento `adjustment` de migración que reproduce la fórmula derivada. Verificar: la migración es re-ejecutable (`if not exists`, `create or replace`, backfill solo si no hay movimientos) y usa el prefijo `condo_`.
- [x] 1.2 Aplicarla en el stack local (`scripts/e2e/setup-local-supabase.sh`) y probar las funciones con un script desechable: un abono suma `payment_in` en su moneda; repetir la misma referencia no duplica; un gasto resta `expense_out` en la moneda de pago; con saldo insuficiente no escribe nada y devuelve el disponible; dos pagos de gasto simultáneos contra un saldo que alcanza para uno dejan uno pagado y uno rechazado; `opening` se rechaza si ya existe o si el monto no es mayor que cero; `adjustment` exige nota y monto distinto de cero; un usuario no admin es rechazado. Verificar: todos los casos pasan.
- [x] 1.3 Verificar el backfill contra la fórmula vigente: sembrar localmente pagos en USD, Bs y USDT, un pago cruzado, un sobrante, un crédito consumido y gastos `paid` y `on_hold`, comparar el balance sembrado con `communityBalance(...)` de TypeScript antes de retirarla. Verificar: los saldos por moneda coinciden al centavo.
- [x] 1.4 Migración lista para que el usuario la aplique: entregar el nombre del archivo y recordar que va antes de desplegar el código. Verificar: el timestamp es posterior a `20261020000000_payment_explicit_installments.sql`.

## 2. Lógica y acciones

- [x] 2.1 En `lib/reporting/communityBalance.ts` conservar `expenseCashOut`, `checkBalance` y los tipos que sigan en uso, y retirar `communityBalance`, `receivedByCurrency` y `spentByCurrency`; reemplazar `communityBalanceQuery.ts` por una lectura de `condo_community_balances` (devuelve un `CurrencyAmountMap`) y una de `condo_community_movements` paginada con `range` y conteo exacto. Verificar: `npx tsc --noEmit` sin errores y sin referencias a las funciones retiradas.
- [x] 2.2 En `lib/payments/applyAllocation.ts` reemplazar el `insert` directo a `condo_payments` por `condo_apply_payment_batch` (filas del lote más el movimiento `payment_in` de `amount_received` en `params.currency` cuando es mayor que cero); un error del movimiento deja el lote sin guardar y devuelve error. No sumar en el barrido de crédito (`creditSweep.ts`). Verificar: un abono del admin, un reporte confirmado y un pago liberado desde espera suman una vez y en su moneda; un pago solo con saldo a favor no suma.
- [x] 2.3 En `markExpensePaid` (`lib/actions/gastos.ts`) reemplazar la lectura del saldo y el `update` por `condo_pay_expense` con las mismas columnas calculadas y el monto y la moneda de `expenseCashOut`, mapeando sus resultados: éxito, saldo insuficiente (con disponible, necesario y faltante), gasto ya pagado y error. Mantener `revalidatePath` de `/gastos`, `/dashboard` y la pantalla nueva. Verificar: el saldo insuficiente no deja el gasto modificado y el pago en espera también resta.
- [x] 2.4 Crear `lib/validation/communityBalance.ts` (zod: moneda, monto, motivo) y `lib/actions/communityBalance.ts` con `registerOpeningBalance` y `registerAdjustment` (verifican admin con `getUser()`, llaman a `condo_add_community_movement`, revalidan `/saldo-comunidad`, `/dashboard` y `/gastos`) y la lectura paginada del libro. Verificar: `tsc` sin errores y las validaciones rechazan monto cero, motivo vacío y saldo inicial repetido.

## 3. Interfaz

- [x] 3.1 En `app/[locale]/(admin)/dashboard/page.tsx` y `app/[locale]/(admin)/gastos/page.tsx` leer el balance guardado en lugar de la consulta derivada, manteniendo la tarjeta "Saldo de la comunidad" y el saldo del diálogo "Marcar gasto como pagado" (`components/dashboard/DashboardPageClient.tsx`, `components/gastos/GastosPageClient.tsx`). Verificar: ambos muestran el balance guardado y el error de lectura sigue mostrando el texto de falla.
- [x] 3.2 Crear la pantalla `app/[locale]/(admin)/saldo-comunidad/page.tsx` y su cliente: balance por moneda, formulario de saldo inicial (oculto por moneda cuando ya existe), formulario de ajuste con motivo y libro paginado (tipo con insignia, moneda, monto con signo, referencia, nota, autor, fecha). Agregar la entrada en `components/admin/AdminSidebar.tsx` y los textos en `messages/es.json` y `messages/en.json`, con UI shadcn sobre Base UI según `design-system/asobarcelona/MASTER.md`. Verificar: el libro pagina, el saldo inicial no se puede repetir y un ajuste sin motivo se rechaza.

## 4. Cierre y verificación

- [x] 4.1 Con el Supabase local (`scripts/e2e/setup-local-supabase.sh`, `NODE_ENV=test npm run dev`), probar de punta a punta: saldo inicial en USD, abono en USD y en Bs, abono con sobrante, reporte confirmado, pago liberado desde espera, gasto pagado en USD y en Bs, gasto que se bloquea por saldo, ajuste negativo y la pantalla del libro con paginación. Verificar: el saldo de la tarjeta, del diálogo y de la pantalla coincide en cada paso y con la suma manual de los movimientos.
- [x] 4.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados.
- [x] 4.3 Ejecutar el agente `spec-auditor` sobre `saldo-comunidad`, `gastos`, `payments` y `reporting-morosos` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- La migración debe aplicarse antes de desplegar; el usuario la aplica manualmente en Supabase.
- Tras desplegar, el admin registra el saldo inicial real de cada moneda en la pantalla nueva.
- Revisar el diff con el agente `adversarial-reviewer` antes de fusionar.
- Al archivar, actualizar Known Limitations de `gastos`: quitar las de "sin saldo inicial", "pagos simultáneos" y "dashboard con saldo desactualizado"; conservar la de filas anteriores sin `funding_breakdown` solo como nota del backfill; y agregar que el balance no se audita automáticamente contra los registros.
- Archivar con `/opsx:archive` una vez verificado el flujo.

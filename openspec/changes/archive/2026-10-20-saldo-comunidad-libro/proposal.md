# Proposal

## Why

Hoy el saldo de la comunidad se **deriva** cada vez de `condo_payments`, `condo_house_credits` y `condo_expenses` (`lib/reporting/communityBalance.ts`). Esa fórmula es frágil (`funding_breakdown`, filas de depósito con `installment_id` nulo, créditos que se consumen), **no admite un saldo inicial** —si la caja real tenía dinero antes del sistema, el saldo sale bajo y bloquea gastos legítimos sin escape— y **no cierra la carrera** de dos pagos de gastos simultáneos, porque leer el saldo y escribir el gasto no son atómicos. El usuario pidió manejar el saldo con el mismo lenguaje del negocio: lo que se abona a cartera suma a la comunidad y lo que se paga a gastos resta.

## What Changes

- **Nuevo balance guardado por comunidad y moneda** (`condo_community_balances`) y **libro de movimientos de solo agregar** (`condo_community_movements`) con tipos `opening`, `payment_in`, `expense_out` y `adjustment`, monto con signo, moneda, referencia al pago o gasto, autor y nota. Los movimientos nunca se editan ni se borran.
- **Funciones SQL atómicas** que registran el movimiento y mueven el balance en la misma transacción, idempotentes por referencia (un mismo pago o gasto no suma ni resta dos veces):
  - un abono aplicado inserta sus filas de `condo_payments` y suma `payment_in` por el dinero recibido, en la moneda con que entró;
  - un gasto pagado (`paid` u `on_hold`) se actualiza y resta `expense_out` en la moneda de pago, bloqueando el balance y **rechazando el pago si no alcanza**. Esto cierra la carrera de pagos simultáneos.
- **Saldo inicial** desde una pantalla del admin, por moneda y una sola vez (`opening`), y **ajustes manuales** positivos o negativos con motivo obligatorio.
- **Pantalla de admin** "Saldo de la comunidad": balance por moneda, libro paginado, formulario de saldo inicial y de ajuste.
- **La tarjeta del dashboard y el diálogo de pago de gastos leen el balance guardado**, no la fórmula derivada. Se elimina la consulta derivada (`communityBalanceQuery.ts`) y el cálculo de recibido y gastado.
- **Migración con backfill**: crea las tablas y funciones, y siembra el balance de cada moneda con lo que hoy calcula la fórmula derivada, para que el saldo no salte al desplegar. La aplica el usuario.
- Sin cambios para el residente: el saldo sigue siendo solo del admin.

## Capabilities

### New Capabilities
- `saldo-comunidad`: balance por moneda y libro de movimientos de la comunidad, saldo inicial, ajustes manuales, registro automático de abonos y pagos de gastos, y la pantalla del admin.

### Modified Capabilities
- `gastos`: el saldo de la comunidad pasa de calcularse a leerse del balance guardado, y el bloqueo por saldo insuficiente se hace de forma atómica en el pago del gasto.
- `reporting-morosos`: la tarjeta "Saldo de la comunidad" del dashboard lee el balance guardado.
- `payments`: todo abono aplicado (admin, reporte confirmado o liberado desde espera) suma al balance de la comunidad.

## Fuera de alcance

- Saldo de la comunidad visible para residentes.
- Conversión entre monedas o saldo consolidado; el saldo nunca se suma entre `USD`, `Bs` y `USDT`.
- Editar o borrar movimientos, y reversos o anulaciones de pagos y gastos.
- Ingresos que no sean abonos de cuotas (donaciones, multas, intereses).
- Reservar fondos para gastos pendientes o pagos parciales de gastos.
- Comparar el balance guardado con la fórmula derivada como auditoría (queda como mejora posterior).
- Cambiar la regla de 24 h de las tasas, el flujo de "en espera", el barrido de saldo a favor o la selección de cuotas especiales.

## Impact

- **Base de datos (migración nueva, la aplica el usuario):** tablas `condo_community_balances` y `condo_community_movements` con `community_id`, RLS solo para admins de la comunidad (`condo_is_community_admin`), funciones SQL `condo_*` y backfill.
- **Código:** `lib/payments/applyAllocation.ts` (inserta el lote de pagos y el movimiento por la función), `lib/actions/gastos.ts` (`markExpensePaid` paga por la función), `lib/payments/releaseHeld.ts` (sin cambios de lógica; hereda la suma por `applyPaymentAllocation`), `lib/reporting/communityBalance.ts` (se conservan `expenseCashOut` y `checkBalance`; se retira el resto) y `communityBalanceQuery.ts` (se reemplaza por la lectura del balance), nuevas acciones `lib/actions/communityBalance.ts`, validación en `lib/validation/`, dashboard, diálogo de gastos, nueva página admin y entrada en `components/admin/AdminSidebar.tsx`.
- **Mensajes:** `messages/es.json` y `messages/en.json`.
- **Riesgos:** el backfill debe reproducir la fórmula actual (se verifica contra datos locales); si el balance guardado y los registros divergen por un fallo parcial en los pasos posteriores al lote de pagos, no hay auditoría automática (límite documentado).

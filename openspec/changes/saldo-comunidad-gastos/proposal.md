# Proposal

## Why

Hoy se puede marcar como pagado cualquier gasto aunque la comunidad no tenga ese dinero: el sistema registra lo que se cobra (pagos de cuotas) y lo que se gasta, pero nunca los compara. Falta el "saldo de la comunidad" para que el admin vea cuánto dinero hay disponible por moneda y para que no pueda pagar un gasto que la caja no cubre.

## What Changes

- Nuevo cálculo del **saldo de la comunidad**, por moneda y sin mezclar monedas: **cobrado − gastos pagados**, sin saldo inicial (solo cuenta lo que el sistema registra). "Cobrado" es el dinero realmente recibido (lo aplicado a cuotas en la moneda con que se pagó, más el saldo a favor aún sin aplicar de las casas); "gastos pagados" es lo que salió de caja en la moneda en que se pagó, incluidos los gastos en espera de tasa (ya comprometidos).
- `markExpensePaid` **bloquea** el pago si el saldo de la moneda de pago no alcanza, y devuelve un error que dice cuánto hay, cuánto hace falta y cuánto falta. Aplica igual si el gasto iba a quedar pagado o en espera de tasa; al liberar un gasto en espera no se vuelve a validar.
- Tarjeta "Saldo de la comunidad" por moneda en el dashboard del admin.
- El diálogo "Marcar gasto como pagado" muestra el saldo disponible en la moneda de pago y, si no alcanza, avisa con el faltante y deshabilita la confirmación; el servidor revalida siempre.

Fuera de alcance:
- Saldo inicial o saldo manual, y mostrar el saldo al residente (su tarjeta "saldo disponible" es otra cosa: la suma de créditos de las casas).
- Ingresos que no sean pagos de cuotas (no existen en el sistema) y pagos parciales de gastos.
- Reservar fondos entre pagos simultáneos (dos pagos a la vez pueden gastar el mismo saldo).
- Cambiar la regla de 24 h o el flujo de conversión.

## Capabilities

### New Capabilities
<!-- Ninguna: el comportamiento pertenece a capacidades existentes. -->

### Modified Capabilities
- `gastos`: cálculo del saldo de la comunidad, bloqueo del pago de un gasto sin saldo suficiente y saldo visible en el diálogo de pago.
- `reporting-morosos`: tarjeta "Saldo de la comunidad" en el dashboard del admin.

## Impact

- BD: ninguna. El saldo se calcula en TypeScript con consultas mínimas (el dashboard ya carga todos los pagos y gastos). Sin migración.
- Código: un módulo nuevo de cálculo (`lib/reporting/communityBalance.ts`) y de consulta, `lib/actions/gastos.ts` (`markExpensePaid`), `app/[locale]/(admin)/dashboard/page.tsx` y `components/dashboard/DashboardPageClient.tsx`, `app/[locale]/(admin)/gastos/page.tsx` y `components/gastos/GastosPageClient.tsx`, y `messages/es.json`/`en.json`.
- Monedas: el saldo se lleva por moneda (`USD`, `Bs`, `USDT`) y nunca se suma ni se convierte entre ellas.
- Riesgo operativo: sin saldo inicial, si la caja real tenía dinero antes del sistema o hubo gastos pagados fuera de él, el saldo puede salir insuficiente y bloquear gastos legítimos; el sistema no ofrece escape (decisión del usuario).

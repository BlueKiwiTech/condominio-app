# Proposal

## Why

Hoy, al abonar desde el admin, el sistema reparte el dinero automáticamente contra todas las cuotas pendientes de la casa, de la más antigua a la más nueva y solo dentro de la ventana de 30 días (decisión del 2026-09-24: el admin ya no escoge cuotas). Eso no sirve cuando un vecino quiere pagar una cuota **especial** concreta (una derrama, una cuota única o dividida) que vence en meses: el abono se va a las cuotas viejas o queda como saldo a favor sin tocar la especial. El admin necesita poder decir "este abono es para estas cuotas especiales".

## What Changes

- El formulario de pago del admin lista, al elegir la casa, sus cuotas especiales pendientes (nombre, vencimiento, saldo y moneda) con casillas opcionales y un texto que explica que, si se marca alguna, el abono se aplica solo a ellas.
- Si el admin marca cuotas especiales, el abono se aplica **únicamente** a esas, de la más antigua a la más nueva entre ellas (full-or-nothing en centavos); lo que sobre va a saldo a favor. Si no marca ninguna, todo funciona exactamente como hoy.
- Las cuotas elegidas **se saltan la ventana de 30 días**: elegirlas expresamente basta para pagarlas aunque venzan más lejos. La ventana sigue igual para el flujo sin selección.
- `registerPayment` valida en el servidor que las cuotas elegidas pertenezcan a la casa, estén pendientes y provengan de una plantilla `special`; si no, rechaza sin escribir nada.
- Un pago del admin que queda en espera de tasa conserva su selección: el reporte `on_hold` guarda un indicador de "selección explícita" y, al liberarse, se aplica solo a las cuotas elegidas y sin ventana.
- La conversión de monedas, la tasa BCV a la fecha del pago, la regla de frescura de 24 h, el estado en espera, el saldo a favor, el recibo y el lote no cambian.

Fuera de alcance:
- Cambiar la regla de frescura de 24 h o el flujo de conversión.
- Que el residente elija cuotas especiales al reportar un pago (ya etiqueta cuotas y su confirmación no cambia).
- Elegir cuotas recurrentes (no especiales) o pagos parciales de una cuota.
- El saldo de la comunidad y la validación al pagar gastos (otro change).

## Capabilities

### New Capabilities
<!-- Ninguna: el comportamiento pertenece a una capacidad existente. -->

### Modified Capabilities
- `payments`: el registro de pago admite elegir cuotas especiales (entrada, validación, asignación solo a las elegidas y salto de la ventana de 30 días), el pago en espera conserva la selección y el formulario del admin la muestra.

## Impact

- BD: una migración con la columna `explicit_installments boolean not null default false` en `condo_payment_reports`. Sin cambios de RLS ni de índices.
- Código: `lib/payments/applyAllocation.ts`, `lib/payments/releaseHeld.ts`, `lib/actions/payments.ts`, `lib/validation/payments.ts`, un helper nuevo de validación de la selección, `app/[locale]/(admin)/pagos/nuevo/page.tsx`, `components/payments/PaymentFormClient.tsx`, `components/payments/types.ts` y `messages/es.json`/`en.json`.
- Monedas: ninguna conversión ni suma cambia; el abono en una moneda puede pagar una cuota especial en otra con la tasa vigente a la fecha, como hoy.
- Operación: la migración la aplica el usuario antes de desplegar el código.

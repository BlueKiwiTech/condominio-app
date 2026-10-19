# Design

## Context

El formulario de pago del admin ([components/payments/PaymentFormClient.tsx](components/payments/PaymentFormClient.tsx)) manda a `registerPayment` ([lib/actions/payments.ts](lib/actions/payments.ts)) los ids de **todas** las cuotas pendientes de la casa; `applyPaymentAllocation` ([lib/payments/applyAllocation.ts](lib/payments/applyAllocation.ts)) los relee, aplica la ventana de 30 días (`filterEligibleForConversionWindow`), los ordena de la más antigua a la más nueva y reparte full-or-nothing con `allocateFunds`. Si falta la tasa BCV, `registerPayment` guarda un reporte `on_hold` en `condo_payment_reports` con `created_by` y `installment_ids` (todas las pendientes), y `releaseHeld` ([lib/payments/releaseHeld.ts](lib/payments/releaseHeld.ts)) lo vuelve a aplicar con esos mismos ids al llegar la tasa.

Las cuotas especiales se distinguen por su plantilla: `condo_installments.template_id` apunta a `condo_installment_templates`, cuyo `installment_type` es `recurring` o `special`. La página del formulario ([app/[locale]/(admin)/pagos/nuevo/page.tsx](app/[locale]/(admin)/pagos/nuevo/page.tsx)) hoy no trae el tipo. El resultado: el admin no puede dirigir un abono a una cuota especial concreta, sobre todo si vence a más de 30 días.

## Goals / Non-Goals

**Goals:**
- Que el admin elija opcionalmente cuotas especiales al abonar y que el abono se aplique solo a ellas, sin ventana de 30 días.
- Que un pago en espera de tasa conserve esa selección y la respete al liberarse.
- No cambiar nada del flujo sin selección ni del flujo del residente.

**Non-Goals:**
- Cambiar la regla de 24 h, la conversión, el barrido de crédito o la confirmación de reportes del residente.
- Elegir cuotas recurrentes, pagos parciales o que el residente elija especiales.

## Decisions

**1. Entrada separada: `selected_special_ids`.** `registerPaymentSchema` suma `selected_special_ids` (arreglo de uuids, vacío por defecto) y conserva `installment_ids` tal cual. Sin selección el cliente sigue mandando todas las pendientes; con selección, el servidor usa **solo** `selected_special_ids` e ignora `installment_ids`. Alternativa descartada: reutilizar `installment_ids` y adivinar si es una selección; no se puede distinguir "todas las pendientes" de "elegí todas", y el salto de ventana depende justo de esa diferencia.

**2. Validación en el servidor.** Un helper (`lib/payments/specialSelection.ts`) consulta las cuotas elegidas con su plantilla (`condo_installment_templates!inner(installment_type)`) y exige que pertenezcan a la casa, estén `pending` o `partial`, no estén borradas y su plantilla sea `special`; si no, `registerPayment` devuelve un error de selección inválida sin escribir. El cliente nunca decide qué es "especial".

**3. Bandera `explicitInstallments` en el motor.** `ApplyAllocationParams` suma `explicit_installments` (booleano, falso por defecto). Cuando es verdadero, `evaluatePaymentAllocation` no aplica `filterEligibleForConversionWindow` y reparte entre exactamente los ids recibidos, igual de más antigua a más nueva y full-or-nothing; el sobrante sigue yendo a saldo a favor. Con falso, el comportamiento es el actual. La conversión y la frescura no se tocan.

**4. El pago en espera guarda la bandera.** `condo_payment_reports` suma `explicit_installments boolean not null default false` (migración `20261020000000_payment_explicit_installments.sql`). `registerPayment` la fija en verdadero y guarda como `installment_ids` solo las elegidas cuando hay selección; sin selección queda en falso. `releaseHeld` la pasa a `evaluatePaymentAllocation` y `applyPaymentAllocation`. Los reportes del residente nacen con falso, y `reportPayment` y `confirmPaymentReport` no cambian.

**5. Vista previa en el formulario.** `PendingInstallment` suma `is_special`, calculado en la página a partir de `condo_installment_templates(installment_type)` embebido en la consulta. El formulario muestra las especiales de la casa con casillas (componente `Checkbox` existente) y un texto de aviso; con selección, las cuotas elegibles de la vista previa son exactamente las marcadas (sin ventana), si no, las de hoy. Cambiar de casa vacía la selección.

**6. Barrido de crédito intacto.** El sobrante que va a saldo a favor sigue pudiendo barrerse después contra cuotas vencidas de la misma moneda; no se agrega ninguna regla para que el sobrante vuelva a la especial.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* ningún total suma USD/Bs/USDT; la conversión sigue siendo la de `allocateFunds` con la tasa vigente a `payment_date` y `funding_breakdown`. Una especial en USD se puede pagar en Bs como cualquier otra cuota.
- *Idempotencia:* no se agregan escrituras nuevas; el pago en espera sigue liberándose con el reclamo `release_claimed_at`. La migración es re-ejecutable (`add column if not exists`).
- *Fechas:* la ventana de 30 días se mide como hoy (`payment_date` + 30 días calendario) y solo se omite para las cuotas elegidas; sin instantes UTC nuevos.
- *RLS / `community_id`:* sin tablas nuevas ni cambios de políticas. La validación corre con la sesión del admin y el RLS de las cuotas; los residentes no participan.

## Risks / Trade-offs

- [Se revierte parcialmente la decisión del 2026-09-24 ("el admin ya no escoge cuotas")] → Solo para cuotas especiales y de forma opcional; sin selección nada cambia.
- [Elegir una especial lejana en otra moneda convierte con la tasa del día del pago] → Es la regla de siempre (tasa a la fecha del abono, 24 h); queda registrada en `funding_breakdown`.
- [Un pago en espera con selección cuya cuota se paga por otra vía antes de liberarse] → La liberación falla y se reintenta (límite ya conocido de pagos del admin en espera); el admin puede rechazarlo.
- [La vista previa del cliente y el servidor pueden diferir si cambian los datos entre pantalla y envío] → El servidor revalida todo; la vista previa es solo orientativa, como hoy.

## Migration Plan

1. Migración `supabase/migrations/20261020000000_payment_explicit_installments.sql` (la aplica el usuario antes de desplegar): `alter table condo_payment_reports add column if not exists explicit_installments boolean not null default false;`. Sin backfill (los reportes existentes quedan en falso, que es su comportamiento actual).
2. Desplegar el código. El código nuevo escribe la columna, así que la migración va antes.
3. Rollback: revertir el código; la columna es aditiva y el código anterior la ignora.

## Open Questions

- Ninguna que bloquee. Decisiones confirmadas por el usuario el 2026-10-19: el abono con selección se aplica solo a las cuotas elegidas, y las elegidas se saltan la ventana de 30 días. Supuestos míos: una cuota `partial` también es elegible; solo se pueden elegir cuotas de plantillas `special`.

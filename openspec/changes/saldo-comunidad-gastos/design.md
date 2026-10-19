# Design

## Context

El sistema registra lo que entra (`condo_payments`, `condo_house_credits`) y lo que sale (`condo_expenses`), pero no los compara: `markExpensePaid` ([lib/actions/gastos.ts](lib/actions/gastos.ts)) marca cualquier gasto como pagado. El dashboard ya carga todos los pagos y gastos del admin (`app/[locale]/(admin)/dashboard/page.tsx`) para sus tarjetas, lo que muestra que calcular agregados en TypeScript es aceptable para el volumen de esta comunidad.

Cómo se escribe el dinero hoy, relevante para saber qué es "cobrado":
- `applyPaymentAllocation` escribe una fila de `condo_payments` por cuota pagada, en la moneda de la **cuota**; si el pago vino en otra moneda, `funding_breakdown` trae `[{ currency, amountDrawn, exchangeRate, exchangeRateType }]` con lo realmente recibido. El sobrante va en una fila con `installment_id` nulo (depósito a cartera) y actualiza `condo_house_credits`.
- Un abono usa como fondos `amount_received + saldo a favor de esa moneda`, así que consume crédito previo sin que entre dinero nuevo.
- El barrido de crédito (`creditSweep`) escribe filas por cuota en la moneda de la cuota (sin desglose) y baja el crédito de la misma moneda.
Por eso sumar `amount_paid` de todas las filas no sirve: mezcla monedas de cuota con monedas de pago, cuenta dos veces el dinero que pasa por el saldo a favor y cuenta el sobrante como si fuera un cobro aparte.

## Goals / Non-Goals

**Goals:**
- Un saldo de la comunidad por moneda (cobrado − gastos pagados) calculado de forma consistente con cómo se escribe el dinero.
- Bloquear el pago de un gasto que la caja no cubre, con un mensaje claro, y mostrar el saldo en el admin.

**Non-Goals:**
- Saldo inicial o manual, mostrar el saldo al residente, ingresos que no sean pagos de cuotas, pagos parciales de gastos, reservar fondos entre pagos simultáneos, cambiar la regla de 24 h o la conversión.

## Decisions

**1. Fórmula contable.** Con `C` una moneda:
`recibido[C]` = suma de lo aplicado a cuotas financiado en `C` + suma de `condo_house_credits.balance` en `C`.
- Lo aplicado: para cada fila de `condo_payments` con `installment_id` **no nulo**, si `funding_breakdown` tiene elementos se suma `amountDrawn` de cada uno a su `currency`; si es nulo, se suma `amount_paid` a la moneda de la fila.
- Las filas con `installment_id` nulo (depósito del sobrante) se ignoran: ese dinero ya está en `condo_house_credits`.
Esto funciona porque el dinero recibido termina siempre en uno de dos lugares: aplicado a una cuota o esperando como saldo a favor; un abono que consume crédito previo suma a lo aplicado y resta del crédito en la misma cantidad. `gastosPagados[C]` = suma de los gastos con `status` `paid` u `on_hold` en la moneda con que salió el dinero: `paid_currency`/`paid_amount` si la moneda de pago difiere de la del gasto, o `currency`/`amount` (incluye `USDT`). `saldo[C] = recibido[C] − gastosPagados[C]`. Un gasto `on_hold` ya cuenta como gastado porque el admin ya lo pagó y solo espera su tasa.

**2. Función pura más consulta mínima, sin migración.** `lib/reporting/communityBalance.ts` expone funciones puras (`communityBalance`, `expenseCashOut`) sobre filas ya cargadas, usadas por el dashboard, la página de gastos y la acción. Una consulta con selects mínimos (`condo_payments`: `installment_id, amount_paid, currency, funding_breakdown`; `condo_house_credits`: `currency, balance`; `condo_expenses`: `status, currency, amount, paid_currency, paid_amount, deleted_at`) la alimenta. Alternativa descartada: una función SQL `condo_*` con migración; el volumen no lo exige y el dashboard ya carga más datos que esto.

**3. Qué sale de caja y qué se valida.** `expenseCashOut` devuelve la moneda y el monto de un pago: `paid_currency`/`paid_amount` si la moneda de pago difiere, o el monto final en la moneda del gasto (`USDT` en `USDT`). `markExpensePaid` lo calcula con los datos ya validados y compara con `saldo[moneda]` **antes de escribir**, tanto si el gasto quedaría `paid` como `on_hold`; si no alcanza, devuelve `insufficientCommunityBalance` con moneda, disponible, necesario y faltante. Al liberar un gasto en espera (`releaseHeld`) no se vuelve a validar. La comparación es en centavos para evitar errores de coma flotante.

**4. Interfaz.** La página de gastos calcula el saldo en el servidor y lo pasa al diálogo; este muestra "Saldo disponible en {moneda}" para la moneda de pago elegida y, si el monto a pagar lo supera, un aviso con el faltante y la confirmación deshabilitada. El dashboard agrega la tarjeta "Saldo de la comunidad" (el dashboard ya carga pagos y gastos; se suman créditos y las dos columnas de pago de gastos). Se evita el nombre "saldo disponible" porque el portal del residente ya lo usa para la suma de créditos de las casas, y el saldo de la comunidad no se expone al residente.

**5. Sin saldo inicial: riesgo explícito.** El saldo arranca solo con lo que el sistema registró. Si la caja real tenía dinero antes del sistema, o hubo gastos pagados fuera de él, el saldo puede salir insuficiente y bloquear pagos de gastos legítimos; el sistema no ofrece escape (decisión del usuario). Se documenta en Known Limitations.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* el saldo se lleva por moneda y nunca se suma ni convierte; un gasto pagado en otra moneda descuenta de la moneda con que se pagó.
- *Idempotencia:* solo lecturas más la validación previa a una escritura que ya existía; no se agregan escrituras. Dos pagos simultáneos pueden gastar el mismo saldo (sin transacción): límite conocido.
- *Fechas:* el saldo es acumulado a hoy, sin cortes por fecha; no hay comparaciones de fechas nuevas.
- *RLS / `community_id`:* sin tablas ni políticas nuevas. Las consultas corren con la sesión del admin y su RLS; los residentes no ven el saldo ni se les expone.

## Risks / Trade-offs

- [Sin saldo inicial se pueden bloquear gastos legítimos] → Decisión del usuario; queda señalado en el design y en Known Limitations. La tarjeta del dashboard hace visible el saldo calculado.
- [Dos pagos de gastos simultáneos pueden gastar el mismo saldo] → Sin transacción no se puede reservar; el admin es un solo usuario en la práctica. Se documenta.
- [Filas históricas de `condo_payments` sin desglose cuentan en la moneda de la fila] → Es la moneda de la cuota y, en pagos antiguos, normalmente la misma con la que se pagó; puede desviar el saldo de pagos cruzados muy antiguos.
- [Cuotas borradas con pagos] → Sus pagos siguen en `condo_payments` y cuentan como cobrados, porque el dinero se recibió.
- [Nuevos tipos de ingreso que no pasen por pagos de cuotas] → No existen hoy; si se agregan, habrá que sumarlos al cobrado.

## Migration Plan

1. Sin migración ni variables nuevas: se despliega solo el código.
2. Rollback: revertir el código; no hay datos nuevos.

## Open Questions

- Ninguna que bloquee. Decisiones confirmadas por el usuario el 2026-10-19: el saldo es cobrado menos gastos pagados, por moneda, sin saldo inicial ni manual, y un pago sin saldo suficiente se bloquea. Supuesto mío: un gasto en espera de tasa ya cuenta como gastado.

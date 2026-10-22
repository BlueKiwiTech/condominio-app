# Design

## Context

`evaluatePaymentAllocation` (`lib/payments/applyAllocation.ts`) calcula `fundsAvailable = amount_received + existingCredit` y todo el sobrante (`leftover`) va a una fila top-up, así que el recibo suma recibido + crédito previo: con $25 recibidos, $5 de crédito y una especial de $24 el recibo mostró $30 y un "Abono a cartera" de $6, cuando el vecino entregó $25 y solo $1 es nuevo. `condo_apply_payment_batch` recibe `p_expected_credit` y `p_new_credit` (valor absoluto, no delta). La misma función la usan `registerPayment`, `confirmPaymentReport` y la liberación de pagos en espera (`releaseHeld.ts`). `explicit_installments` ya existe y distingue la selección expresa. Ver proposal.md para la motivación.

## Goals / Non-Goals

**Goals:**
- Que el recibo y el saldo de la comunidad reflejen exactamente lo recibido y el saldo previo solo aparezca como "aplicado" cuando se usa.
- Reusar la validación y el flujo de especiales ya existentes también al confirmar reportes.

**Non-Goals:**
- Cambiar la regla de que el saldo a favor puede completar un pago, ni el barrido de crédito.
- Migración de datos ni corrección retroactiva de recibos anteriores.

## Decisions

1. **Atribución recibido vs saldo previo** en `evaluatePaymentAllocation`: el netting se mantiene (el saldo puede completar el pago), pero se separa de dónde sale cada centavo: `applied = suma de allocations`, `creditUsed = max(0, applied − amount_received)` y `topUp = max(0, amount_received − applied)`. Nuevo crédito = `existingCredit − creditUsed + topUp` (para `p_new_credit`; `p_expected_credit` sigue siendo el crédito leído). La fila top-up del lote guarda solo `topUp`, de modo que las filas suman `amount_received` (+ `creditUsed` cuando existe, mostrado como saldo aplicado). Aplica a todos los pagos, con o sin selección. Alternativa descartada: no netear con selección explícita; contradice que el saldo pueda pagar y era una regla distinta según el flujo. Ejemplo: recibido 25, crédito 5, especial 24 → creditUsed 0, topUp 1, crédito 6, recibo 25.
   - **Recibo y vista previa**: el encabezado del recibo (admin `pagos/[batchId]` y vecino `mi-cartera/[batchId]`) muestra el monto recibido (`amount_received`) y, si `creditUsed > 0`, una línea "Saldo a favor aplicado". Hoy el total sale de sumar filas; debe leer lo recibido (p. ej. el movimiento `payment_in` del lote) o guardar `creditUsed` en el lote. Se decide en implementación; si hace falta una columna o ajuste en `condo_apply_payment_batch`, se escribe una migración nueva. El panel "Resumen del pago" muestra "Saldo a favor aplicado" = `creditUsed` (hoy muestra el crédito completo aunque no se use) y "Sobrante a saldo a favor" = nuevo crédito.
2. **Misma ruta para la liberación y la confirmación de reportes**: comparten `evaluatePaymentAllocation`, así que heredan la atribución.
3. **Diálogo de confirmación**: la página de reportes carga las especiales pendientes por casa (cuotas `pending`/`partial` de plantillas `special`, igual que el formulario de pago) y `confirmPaymentReport(reportId, locale, selectedSpecialIds?)` las valida con `validateSpecialSelection`. Con selección, `installment_ids = selected` y `explicit_installments = true`; en espera se persisten ambos en el reporte (misma mecánica que los pagos del admin). Sin selección, nada cambia.
4. **Saldo guardado para el vecino**: `getCommunityBalanceData` lee `condo_community_balances` con el cliente service-role (sin filtro por casa, igual que sus otras lecturas comunitarias) y expone solo `balance` por moneda; `MiComunidadClient` lo usa en "saldo disponible". `CommunityBalanceCard` de `/mi-hogar` no cambia.
5. **Tasa en el reporte**: `ReportPaymentDialog` ya trae `dateRates`; se muestra `rate` y la fecha efectiva (`effective_date`, o la fecha de `updated_at` si es nula) cuando `currency === 'Bs'` y la tasa es fresca (`isRateFresh`), más el texto de referencia. Textos en `messages/es.json` y `en.json`.
6. **Saldo inicial**: se eliminan el botón, el diálogo, `registerOpeningBalance` y su esquema de validación; el tipo `opening` permanece en la lista de tipos del libro para históricos. La RPC/SQL queda como está.

Impacto en monedas: nada se suma entre USD/Bs/USDT; el crédito sigue por casa+moneda y el saldo del vecino se muestra por moneda. Idempotencia: sin cambios (candado del reporte y unicidad del movimiento por lote). Fechas: la fecha de la tasa se formatea con `parseISO`/date-fns, sin split UTC. RLS: el vecino lee el saldo por service-role (ya es el patrón del portal); no se expone el libro y no hay cambios de políticas.

## Risks / Trade-offs

- [Recibos de un pago sin dinero recibido (solo saldo)] → Muestran 0 recibido y el saldo aplicado; verificarlo en el recibo.
- [Cambiar `p_new_credit` mal rompe el chequeo de concurrencia] → Mantener `p_expected_credit` = crédito leído y verificar con pagos concurrentes a la misma casa.
- [El saldo del vecino pasa a coincidir con el del admin, que puede ser negativo] → Se muestra tal cual, con el estilo de monto negativo existente.
- [`opening` histórico sigue en el libro] → Se muestra sin cambios.

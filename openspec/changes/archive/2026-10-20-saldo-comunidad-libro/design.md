# Design

## Context

Hoy el saldo de la comunidad lo calcula `lib/reporting/communityBalance.ts` con datos que carga `communityBalanceQuery.ts` (change archivado `saldo-comunidad-gastos`): recibido = lo aplicado a cuotas en la moneda de financiamiento (`funding_breakdown`, o `amount_paid`; las filas de `condo_payments` con `installment_id` nulo no cuentan) más `condo_house_credits.balance`; gastado = gastos `paid` u `on_hold` en `paid_currency`/`paid_amount` o `currency`/`amount`. `markExpensePaid` ([lib/actions/gastos.ts](lib/actions/gastos.ts)) lee ese saldo y después hace el `update` del gasto: dos llamadas separadas, de modo que dos pagos simultáneos pueden gastar el mismo saldo.

Dónde entra dinero de verdad: solo en `applyPaymentAllocation` ([lib/payments/applyAllocation.ts](lib/payments/applyAllocation.ts)), que usan `registerPayment`, `confirmPaymentReport` y `releaseHeld`. Ahí `params.amount_received` en `params.currency` es el efectivo nuevo del lote (`payment_batch_id`); el saldo a favor consumido y el barrido de `creditSweep.ts` (que también escribe `condo_payments`) mueven dinero ya contado. Dónde sale: solo en `markExpensePaid`; liberar un gasto en espera (`releaseHeld.ts`) no cambia el monto que salió.

Las acciones corren por PostgREST (sin transacciones desde Server Actions) y el admin usa el cliente con RLS; `releaseHeld` y el cron usan service-role. Las tablas llevan `community_id` y RLS con `condo_is_community_admin`. Ver proposal.md - Why.

## Goals / Non-Goals

**Goals:**
- Un balance por comunidad y moneda que cambie solo por movimientos registrados, con rastro completo.
- Que registrar el movimiento sea atómico con la operación que lo origina, para cerrar la carrera de gastos y no perder abonos en el libro.
- Saldo inicial y ajustes del admin con la misma lógica de libro.
- Que activar el libro no cambie el saldo que el admin ve hoy.

**Non-Goals:**
- Auditoría automática entre el balance y los registros (queda como mejora posterior).
- Hacer transaccionales los pasos de cuotas y crédito de un abono, que hoy ya no lo son.
- Reversos, ediciones o ingresos que no sean abonos.

## Decisions

**1. Balance guardado más libro de movimientos, en dos tablas.** `condo_community_balances (community_id, currency, balance numeric(14,2), updated_at)` con clave primaria `(community_id, currency)` y `condo_community_movements (id, community_id, type, currency, amount, reference_id, occurred_on, note, created_by, created_at)`. `type` ∈ `opening|payment_in|expense_out|adjustment`; `amount` lleva signo (positivo suma, negativo resta); `occurred_on` es una fecha de calendario (`payment_date` o `paid_date` en abonos y gastos, el día de registro en saldo inicial y ajustes), sin instantes UTC. Alternativas descartadas: una columna en `condo_communities` (el balance es por moneda y no se suma entre monedas, así que serían tres columnas o un jsonb, y bloquear y actualizar un jsonb atómicamente es incómodo); seguir derivando (no admite saldo inicial ni cierra la carrera, y la fórmula depende de detalles de `funding_breakdown`). Las filas son pocas (miles al año), así que el libro no necesita particiones.

**2. Idempotencia por referencia.** Un índice único parcial `(community_id, type, reference_id) where reference_id is not null` hace que un mismo lote de pagos o un mismo gasto registren un solo movimiento; las funciones usan `insert … on conflict do nothing` y solo mueven el balance si el insert ocurrió. `reference_id` es el `payment_batch_id` en `payment_in` y el id del gasto en `expense_out`. `opening` tiene un índice único por `(community_id, currency)`.

**3. Funciones SQL `condo_*`, `security definer`, con control de acceso explícito.** Todas fijan `search_path = ''`, rechazan a quien no sea admin de la comunidad (`condo_is_community_admin`) o `service_role` (liberación de pagos desde el cron), se revocan de `public` y se conceden a `authenticated` y `service_role`. Las funciones son:
- `condo_apply_payment_batch(...)`: inserta las filas del lote (jsonb → `condo_payments`) y registra el movimiento `payment_in` (monto recibido > 0) en una transacción.
- `condo_pay_expense(...)`: bloquea la fila del balance con `for update` (creándola si falta), verifica que el gasto siga `pending` y no esté borrado, comprueba el saldo de la moneda de pago, actualiza el gasto con las columnas que calcula la acción (mismas que hoy) y registra `expense_out`. Si falta saldo devuelve el disponible sin escribir; si el gasto ya no está `pending`, lo indica.
- `condo_add_community_movement(...)`: para `opening` (monto > 0, una vez por moneda) y `adjustment` (monto ≠ 0, nota obligatoria), con `created_by = auth.uid()`.
Los montos se validan también en SQL (no solo en zod), porque la función es el último control.

**4. Qué es atómico y qué no.** En un abono, las filas de `condo_payments` y el movimiento van juntos (decisión 3); si el movimiento falla, el lote no queda guardado y la acción devuelve error. Las actualizaciones posteriores de `condo_installments` y del crédito siguen siendo pasos separados, como hoy; un fallo ahí deja el libro y el balance coherentes con los pagos escritos pero deja cuotas o crédito por reconciliar a mano (límite ya conocido de la capacidad `payments`). En un gasto, la validación del saldo, el cambio de estado y el movimiento van en una sola función, lo que cierra la carrera documentada: la fila del balance se bloquea, y dos pagos simultáneos se serializan. Se bloquea solo la fila `(community_id, currency)`, así que no hay riesgo de interbloqueo entre funciones. Alternativa descartada: registrar el movimiento como paso posterior reintentable; deja ventanas en que el balance no coincide con los pagos y exige un proceso de reparación que hoy no existe.

**5. Liberación desde espera.** Un pago `on_hold` del admin se aplica con `applyPaymentAllocation`, así que suma en ese momento y no antes. Un gasto `on_hold` ya restó al pagarse (cuenta como gastado, igual que hoy); `releaseHeld.ts` no cambia el monto, así que no resta de nuevo ni valida el saldo. Un reporte del residente `on_hold` solo vuelve a `pending` y suma al confirmarlo el admin.

**6. Backfill con la fórmula actual.** La migración, por comunidad y moneda, calcula `recibido − gastado` con la misma regla que `communityBalance.ts` (filas con `installment_id` no nulo: cada elemento de `funding_breakdown` con su `currency` y `amountDrawn`, o `amount_paid` en la moneda de la fila si es nulo; más `condo_house_credits.balance`; menos gastos `paid` y `on_hold` no borrados en `coalesce(paid_currency, currency)` y `coalesce(paid_amount, amount)`), y si el neto es distinto de cero inserta un movimiento `adjustment` con nota fija ("Saldo calculado al activar el libro de movimientos") y sin autor, y crea el balance con ese valor. Se verifica contra la fórmula de TypeScript con datos locales antes de retirarla. El saldo inicial real de la caja lo registra el admin después con `opening`, que se suma al balance; por ser una suma, el orden no importa.

**7. Lectura y limpieza del código.** El dashboard y la página de gastos leen `condo_community_balances` (3 filas como máximo) en vez de paginar tres tablas. `communityBalance.ts` conserva `expenseCashOut` y `checkBalance` (el diálogo compara en el cliente); se retiran `communityBalance`, `receivedByCurrency` y `spentByCurrency`, y `communityBalanceQuery.ts` se reemplaza por una lectura del balance. Esto también elimina la limitación de la consulta paginada. Las mutaciones revalidan `/dashboard`, `/gastos` y la pantalla nueva, lo que arregla de paso el saldo desactualizado del dashboard.

**8. Pantalla de admin.** Ruta `/saldo-comunidad` con entrada en `components/admin/AdminSidebar.tsx`: tarjetas de balance por moneda, formularios de saldo inicial (se oculta por moneda cuando ya existe) y de ajuste (react-hook-form + zod, componentes shadcn/Base UI según `design-system/asobarcelona/MASTER.md`) y el libro paginado de 25 en 25 con `range` y conteo exacto, del más reciente al más antiguo. El libro muestra el tipo con una insignia, la referencia (enlace al recibo del lote en los abonos), la nota y el autor.

**9. Permisos de las funciones.** En Supabase las funciones nuevas del esquema `public` reciben EXECUTE para `anon` y `authenticated` por privilegios por defecto, y `revoke ... from public` no los quita; por eso la migración revoca por nombre: las funciones internas (`condo_record_movement`, `condo_assert_can_write_balance`) no son invocables desde la API y las tres públicas se niegan a `anon`. Además cada función valida por dentro (admin de la comunidad o `service_role`), el autor es `auth.uid()` y nunca un parámetro (salvo `service_role`, que pasa el admin que registró un pago en espera), y el lote de pagos acepta solo filas de la casa autorizada y de cuotas de esa casa, porque inserta con los privilegios de su dueño y no aplica la política RLS de `condo_payments`. Las fechas de registro usan el día de `America/Caracas`.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* el balance es por moneda y nunca se suma ni convierte; el movimiento de un pago usa la moneda con que entró el dinero y el de un gasto la moneda de pago. Esto reproduce la fórmula vigente.
- *Idempotencia:* índice único por `(community_id, type, reference_id)`; las funciones no mueven el balance si el movimiento ya existía. El lote de un abono usa un `payment_batch_id` nuevo por intento, así que un reintento del usuario es un pago nuevo, como hoy.
- *Fechas:* `occurred_on` es `date` tomada de `payment_date` o `paid_date`; `created_at` es solo informativo; la interfaz formatea con las utilidades de calendario existentes.
- *RLS y residentes:* ambas tablas con `community_id`, RLS habilitado, solo lectura para admins de la comunidad (`condo_is_community_admin`) y sin política de escritura directa (se escribe solo por las funciones). Los residentes no tienen política ni lectura service-role de estas tablas.

## Risks / Trade-offs

- [El backfill no reproduce exactamente la fórmula] → Se verifica con datos locales sembrados (USD, Bs, USDT, pagos cruzados, sobrante, crédito consumido, gasto en espera) antes de retirar el código derivado; la migración es re-ejecutable y solo siembra si no hay movimientos.
- [Un fallo en las actualizaciones de cuotas o crédito después del lote de pagos] → Ya existía; el libro y el balance quedan coherentes con los pagos escritos. Sin auditoría automática en este change.
- [Sin saldo inicial hasta que el admin lo registre, el saldo sigue pudiendo bloquear gastos legítimos] → Ahora existe la vía: saldo inicial y ajustes; hay que registrarlo al desplegar.
- [Ajustes que dejan el saldo negativo o corrigen mal] → Son explícitos, con motivo y autor, y no se pueden borrar; una corrección es otro ajuste.
- [Los pagos que ya entraron antes del backfill no tienen movimiento propio] → El único movimiento de migración por moneda los resume; el libro no desglosa lo anterior.
- [La función de gastos recibe columnas calculadas por la acción] → Es la misma confianza que hoy tiene el `update` directo del admin; la función solo agrega la validación atómica del saldo y el estado.

## Migration Plan

1. Migración `supabase/migrations/<timestamp>_community_balance_ledger.sql` (posterior a `20261020000000_payment_explicit_installments.sql`; la aplica el usuario antes de desplegar): tablas, índices, RLS, funciones y backfill.
2. Desplegar el código; el código nuevo llama las funciones, así que la migración va antes.
3. El admin registra el saldo inicial real de cada moneda en la pantalla nueva.
4. Rollback: revertir el código (las tablas y funciones sobran sin daño); el código anterior vuelve a derivar el saldo sin ellas, aunque ignora el saldo inicial y los ajustes.

## Open Questions

- Ninguna que bloquee. Decisiones del usuario del 2026-10-20: balance por moneda más libro de movimientos; saldo inicial desde una pantalla del admin, por moneda y una sola vez; ajustes manuales con motivo obligatorio. Supuestos míos: el saldo inicial se suma al balance sin importar cuándo se registra; un ajuste puede dejar el saldo negativo; el movimiento de backfill es un `adjustment` sin autor.

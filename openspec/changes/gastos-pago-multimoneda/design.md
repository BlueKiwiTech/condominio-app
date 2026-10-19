# Design

## Context

Hoy `condo_expenses` guarda `currency` (`USD|Bs|USDT`, copiada de la plantilla), `amount`, `status` (`pending|paid`), `paid_date` y `notes`. `markExpensePaid` ([lib/actions/gastos.ts](lib/actions/gastos.ts)) solo actualiza `amount`, `paid_date`, `notes` y `status`, y registra el audit log `expense.mark_paid`. El diálogo vive en `components/gastos/GastosPageClient.tsx` (input de monto, fecha y notas) y la lista de pagados en `components/gastos/GastosPagadosPageClient.tsx`.

Las tasas ya existen: `condo_exchange_rates` tiene `bcv`, `eur` y `binance` (el `eur` llegó con `tasa-bcv-calendario`, archivado). `getExchangeRatesAsOf(dateStr)` devuelve la última fila por tipo con `updated_at` hasta ese día, e `isRateFresh(updated_at, referenceDate)` aplica la regla de 24 h. `PaymentFormClient` ya carga esas tasas desde el cliente según la fecha del abono, que es el patrón a reutilizar. La conversión entre monedas hoy solo existe en `allocateFunds` (Mi Cartera).

## Goals / Non-Goals

**Goals:**
- Al pagar un gasto en `Bs`, elegir la tasa (`bcv`, `eur`, `binance` o personalizada), ver el equivalente en vivo y guardar tasa, tipo y equivalente en la fila del gasto.
- Reutilizar la regla de frescura y de "tasa a una fecha" existentes, sin cambiarlas.
- Mostrar la tasa y el equivalente en la lista de gastos pagados sin que ningún agregado use el equivalente.

**Non-Goals:**
- Validar saldo disponible de la comunidad (no existe esa entidad; irá en otro spec).
- Pagos parciales, cambio de la regla de 24 h, segunda fuente de tasas.
- Conversión para gastos en `USD` o `USDT`.
- Guardar la tasa personalizada en `condo_exchange_rates`.

## Decisions

**1. Cuatro columnas nuevas, nulas, en `condo_expenses`:** `exchange_rate decimal(14,4)`, `exchange_rate_type varchar` (check `bcv|eur|binance|custom`), `reference_amount decimal(12,2)` y `reference_currency varchar` (check `USD|EUR|USDT`), más un check de "todas nulas o todas con valor". Alternativa descartada: tabla aparte de pagos de gastos; el modelo es un pago por gasto sin parciales, así que columnas en la misma fila bastan y no cambian las lecturas existentes. Los gastos ya pagados quedan con valores nulos (sin backfill: no existe la tasa con la que se pagaron).

**2. Solo los gastos en `Bs` piden tasa.** Las tasas son "Bs por unidad" (`bcv` por USD, `eur` por EUR, `binance` por USDT), así que solo tienen sentido para convertir un monto en Bs. En `USD` y `USDT` el diálogo y la acción no cambian y las cuatro columnas quedan nulas.

**3. Moneda del equivalente = moneda de la tasa elegida.** `reference_amount = amount / exchange_rate`, redondeado a 2 decimales, y `reference_currency` es `USD` para `bcv` y `custom`, `EUR` para `eur` y `USDT` para `binance`. Se evita así necesitar una segunda tasa para llevar el euro o el USDT a dólares y no se inventa una conversión cruzada. La tasa personalizada se interpreta como Bs por USD y se redondea a 4 decimales (los de la columna) antes de guardarse y de calcular el equivalente. El `amount` nunca se convierte: sigue en la moneda del gasto.

**4. La tasa de `bcv`, `eur` y `binance` se lee en el servidor.** El cliente envía solo el `exchange_rate_type`; `markExpensePaid` consulta `getExchangeRatesAsOf(paid_date)`, exige que `isRateFresh(row.updated_at, referenceDate)` y devuelve `staleExchangeRate` sin escribir si falta o está vencida. Para `custom` el cliente envía la tasa (> 0, validada con zod) y no hay regla de frescura. Así el valor guardado nunca depende de lo que mostró la pantalla.

**5. Combo con tasas a la fecha de pago.** El diálogo carga `getExchangeRatesAsOf(paid_date)` desde el cliente (mismo patrón de `PaymentFormClient`) y vuelve a cargarlo al cambiar la fecha. Una tasa ausente o vencida se muestra deshabilitada con su aviso, para que el bloqueo del servidor no sorprenda.

**6. Guardia contra doble pago.** El `update` agrega `.eq('status', 'pending')` y comprueba que afectó una fila, de modo que dos envíos simultáneos no sobrescriban la tasa de un gasto ya pagado (hoy la verificación de `status` y el `update` son dos pasos separados).

**7. Declarar la excepción de conversión.** Es la segunda conversión del sistema (la primera es la asignación de wallet de Mi Cartera). Se documenta en el spec `mi-cartera`, en `CLAUDE.md` y en `openspec/config.yaml` (regla transversal), para que no parezca una violación de la regla "nunca sumar ni convertir entre monedas".

**8. Lista de pagados con columnas aparte.** La tasa, su tipo y el equivalente se muestran en columnas propias, "—" cuando son nulos. La lista no tiene totales hoy; el único agregado de gastos ("Gastos pendientes del mes" del dashboard) lee solo `currency`, `amount`, `period_date`, `status` y `paid_date`, y ningún agregado debe usar `reference_amount`.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* ningún total suma USD/Bs/USDT ni mezcla equivalentes. La conversión se limita a calcular y guardar `reference_amount` por fila; el dashboard ("Gastos pendientes del mes") sigue agrupado por la moneda original y ningún agregado usa `reference_amount`.
- *Idempotencia:* `markExpensePaid` rechaza un gasto ya pagado y el `update` queda protegido por `status = 'pending'` (decisión 6). Repetir la llamada no modifica un pago existente. La migración es re-ejecutable (`add column if not exists`, constraints con `drop constraint if exists`).
- *Fechas:* `paid_date` es una fecha calendario `YYYY-MM-DD`; la frescura se mide contra esa fecha con los mismos helpers que los pagos de cuotas, sin instantes UTC ni `split` de strings.
- *RLS / `community_id`:* las columnas nuevas están en `condo_expenses`, con RLS solo admin sin cambios. Los residentes solo leen el resumen comunitario por service-role; esas consultas no seleccionan las columnas nuevas y no deben hacerlo.

## Risks / Trade-offs

- [El equivalente del `eur` y `binance` no está en USD] → Es deliberado (decisión 3), pero quien espere "todo en dólares" verá EUR o USDT en la columna de equivalente. Si se quiere USD siempre, hay que definir una tasa cruzada; sería otro change.
- [Tasa vencida bloquea el pago de un gasto] → Es el comportamiento de la regla de 24 h; el admin puede elegir una tasa personalizada o esperar el pull del cron. Cuenta con la garantía operativa del cron diario.
- [Tasa personalizada sin límites] → Un typo (por ejemplo 90,55 en vez de 905,50) se guarda tal cual. Mitigación: el diálogo muestra el equivalente en vivo antes de confirmar; no se agrega tope máximo en este change.
- [Gastos pagados antes del change sin tasa] → Quedan con "—"; no se reconvierten.
- [Sin validación de saldo] → Aceptado: no existe la entidad; se atiende en otro spec.

## Migration Plan

1. Migración `supabase/migrations/20261016000000_expense_payment_rate.sql` (la aplica el usuario antes de desplegar el código): `alter table condo_expenses add column if not exists exchange_rate decimal(14,4), add column if not exists exchange_rate_type varchar, add column if not exists reference_amount decimal(12,2), add column if not exists reference_currency varchar`; checks de valores permitidos, `exchange_rate > 0` y "todas o ninguna". Sin backfill ni cambios de RLS o índices.
2. Desplegar el código. El código nuevo escribe las columnas, así que la migración va antes.
3. Rollback: revertir el código; las columnas son nulas y aditivas y el código anterior las ignora.

## Open Questions

Ninguna pendiente. Supuestos confirmados por el usuario el 2026-10-16:
- **Moneda del equivalente:** es la de la tasa elegida (`USD`, `EUR` o `USDT`), no siempre USD (decisión 3).
- **Solo gastos en `Bs`:** los gastos en `USDT` no piden tasa; en la práctica los gastos se mueven entre Bs y USD (decisión 2).
- **Input del monto:** es el monto pagado en la moneda del gasto, prellenado y editable.
- **Tasa personalizada:** es particular de ese gasto, se guarda solo en la fila del gasto y no lleva tope.

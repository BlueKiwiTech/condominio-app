# Design

## Context

Hoy `condo_expenses` guarda `currency` (`USD|Bs|USDT`, copiada de la plantilla), `amount`, `status` (`pending|paid`), `paid_date` y `notes`. `markExpensePaid` ([lib/actions/gastos.ts](lib/actions/gastos.ts)) actualiza `amount`, `paid_date`, `notes` y `status`, y registra el audit log `expense.mark_paid`; el pago siempre se asume en la moneda del gasto. El diálogo vive en `components/gastos/GastosPageClient.tsx` y la lista de pagados en `components/gastos/GastosPagadosPageClient.tsx`.

Las tasas ya existen: `condo_exchange_rates` tiene `bcv`, `eur` y `binance` (el `eur` llegó con `tasa-bcv-calendario`, archivado). `getExchangeRatesAsOf(dateStr)` devuelve la última fila por tipo con `updated_at` hasta ese día, e `isRateFresh(updated_at, referenceDate)` aplica la regla de 24 h. `PaymentFormClient` ya carga esas tasas desde el cliente según la fecha del abono, que es el patrón a reutilizar. La conversión entre monedas hoy solo existe en `allocateFunds` (Mi Cartera).

Una primera versión de este change (solo gastos en Bs, con tasa Binance, y sin moneda de pago) ya está en `main` local pero sin publicar ni aplicar su migración. Esta revisión la reemplaza: el diálogo siempre muestra la moneda de pago, se quita Binance y se guarda lo pagado cuando la moneda de pago difiere de la del gasto.

## Goals / Non-Goals

**Goals:**
- Mostrar siempre la moneda de pago al pagar un gasto y permitir elegirla entre `$` y `Bs`.
- Convertir con una tasa elegida (`bcv`, `eur` o personalizada) cuando alguna de las dos monedas es Bs, y guardar lo pagado, la tasa y el equivalente en la fila del gasto.
- Reutilizar la regla de frescura y de "tasa a una fecha" existentes, sin cambiarlas.
- Mostrar lo pagado y la tasa en la lista de gastos pagados sin que ningún agregado use esos montos.

**Non-Goals:**
- Validar saldo disponible de la comunidad (no existe esa entidad; irá en otro spec).
- Pagos parciales, cambio de la regla de 24 h, segunda fuente de tasas.
- Binance/USDT como moneda de pago u opción de tasa.
- Guardar la tasa personalizada en `condo_exchange_rates`.

## Decisions

**1. Moneda de pago siempre visible, con un selector `USD`/`Bs`.** Para gastos en `USD` o `Bs` el diálogo muestra el selector con la moneda del gasto por defecto. Para un gasto en `USDT` la moneda de pago aparece fija como `USDT`, sin selector ni conversión: en la práctica los gastos se mueven entre Bs y $, y no hay una tasa "Bs por USDT" entre las opciones. Alternativa descartada: permitir `USDT` como moneda de pago; implicaría reintroducir Binance.

**2. Matriz de comportamiento.** Con `E` la moneda del gasto y `P` la de pago:

| E | P | Combo de tasa | Qué se guarda |
|---|---|---|---|
| USD | USD | no | `amount` se sobrescribe con el monto final (como hoy) |
| USD | Bs | sí | `amount` se conserva; `paid_currency = 'Bs'`, `paid_amount`, `exchange_rate`, `exchange_rate_type` |
| Bs | Bs | sí | `amount` se sobrescribe; `exchange_rate`, `exchange_rate_type`, `reference_amount`, `reference_currency` |
| Bs | USD | sí | `amount` se conserva; `paid_currency = 'USD'`, `paid_amount`, `exchange_rate`, `exchange_rate_type` |
| USDT | USDT | no | como hoy |

El combo aparece siempre que `E` o `P` sea `Bs`. Cuando `P` difiere de `E`, el gasto conserva su monto original (es lo que se debía) y lo pagado se guarda aparte; cuando coinciden, `amount` se sobrescribe como siempre con el "Monto final".

**3. La tasa es el multiplicador entre las monedas.** De `USD` a `Bs`, `paid = amount × tasa`; de `Bs` a `USD`, `paid = amount ÷ tasa`; ambos redondeados a 2 decimales. Es válido usar la tasa euro para un gasto expresado en dólares ("a tasa euro"): la tasa solo decide cuántos Bs equivalen al monto. La tasa personalizada se interpreta como Bs por unidad y se redondea a 4 decimales (los de la columna) antes de guardarse y de calcular montos.

**4. Seis columnas nulas en `condo_expenses`:** `exchange_rate decimal(14,4)`, `exchange_rate_type varchar` (`bcv|eur|custom`), `reference_amount decimal(12,2)`, `reference_currency varchar` (`USD|EUR`), `paid_currency varchar` (`USD|Bs`) y `paid_amount decimal(12,2)` (> 0). El check de "las cuatro nulas o con valor" se reemplaza por reglas de pares: `exchange_rate` y `exchange_rate_type` van juntos; `reference_amount` y `reference_currency` van juntos; `paid_currency` y `paid_amount` van juntos; y los dos últimos pares solo pueden tener valor si hay tasa. Alternativa descartada: tabla aparte de pagos de gastos; el modelo es un pago por gasto sin parciales, así que columnas en la misma fila bastan. Los gastos ya pagados quedan con valores nulos (sin backfill: no existe la tasa con la que se pagaron).

**5. La tasa de `bcv` y `eur` se lee en el servidor; el monto pagado lo confirma el admin.** El cliente envía el `exchange_rate_type` (y `custom_rate` solo para `custom`); `markExpensePaid` consulta `getExchangeRatesAsOf(paid_date)`, exige `isRateFresh(row.updated_at, referenceDate)` y devuelve `staleExchangeRate` sin escribir si falta o está vencida. El `paid_amount` lo envía el cliente (prellenado y editable, como el "Monto final" de hoy) y se valida solo como número mayor a 0: no se recalcula en el servidor para permitir que el admin lo ajuste (por ejemplo, al monto exacto que transfirió). Para `custom` el cliente envía la tasa (> 0, validada con zod) y no hay regla de frescura.

**6. Combo con tasas a la fecha de pago.** El diálogo carga `getExchangeRatesAsOf(paid_date)` desde el cliente y vuelve a cargarlo al cambiar la fecha. Una tasa ausente o vencida se muestra deshabilitada con su aviso, para que el bloqueo del servidor no sorprenda. Al cambiar la moneda de pago, la tasa o la fecha, el monto pagado se vuelve a prellenar.

**7. Guardia contra doble pago.** El `update` agrega `.eq('status', 'pending')` y comprueba que afectó una fila, de modo que dos envíos simultáneos no sobrescriban la tasa de un gasto ya pagado.

**8. Declarar la excepción de conversión.** Es la segunda conversión del sistema (la primera es la asignación de wallet de Mi Cartera). Se documenta en el spec `mi-cartera`, en `CLAUDE.md` y en `openspec/config.yaml`.

**9. Lista de pagados con columnas aparte.** Monto pagado (con su moneda), tasa (con su tipo) y equivalente se muestran en columnas propias, "—" cuando son nulos. La lista no tiene totales; el único agregado de gastos ("Gastos pendientes del mes" del dashboard) lee solo `currency`, `amount`, `period_date`, `status` y `paid_date`, y ningún agregado debe usar `paid_amount` ni `reference_amount`.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* ningún total suma USD/Bs/USDT ni mezcla montos pagados o equivalentes. La conversión se limita a calcular y guardar `paid_amount` o `reference_amount` por fila; el dashboard ("Gastos pendientes del mes") sigue agrupado por la moneda original del gasto.
- *Idempotencia:* `markExpensePaid` rechaza un gasto ya pagado y el `update` queda protegido por `status = 'pending'` (decisión 7). Repetir la llamada no modifica un pago existente. La migración es re-ejecutable (`add column if not exists`, constraints con `drop constraint if exists`).
- *Fechas:* `paid_date` es una fecha calendario `YYYY-MM-DD`; la frescura se mide contra esa fecha con los mismos helpers que los pagos de cuotas, sin instantes UTC ni `split` de strings.
- *RLS / `community_id`:* las columnas nuevas están en `condo_expenses`, con RLS solo admin sin cambios. Los residentes solo leen el resumen comunitario por service-role; esas consultas no seleccionan las columnas nuevas y no deben hacerlo.

## Risks / Trade-offs

- [El `paid_amount` no se recalcula en el servidor] → Es deliberado (decisión 5): el admin puede ajustarlo al monto real. Un error de tipeo se guarda tal cual; el diálogo muestra el monto convertido antes de confirmar y la tasa queda registrada para auditar.
- [Tasa vencida bloquea el pago de un gasto] → Es el comportamiento de la regla de 24 h; el admin puede elegir una tasa personalizada o esperar el pull del cron. El "en espera" para tasas BCV vive en el change `pagos-en-espera-por-tasa`, que habrá que ajustar a esta regla de monedas.
- [Tasa personalizada sin límites] → Un typo (por ejemplo 90,55 en vez de 905,50) se guarda tal cual. Mitigación: el monto convertido se muestra en vivo antes de confirmar; no se agrega tope máximo.
- [La tasa euro aplicada a un gasto en dólares] → Es un uso explícito y esperado ("a tasa euro"); el tipo de tasa queda guardado para saber con cuál se calculó.
- [Gastos pagados antes del change sin datos de pago] → Quedan con "—"; no se reconvierten.
- [Sin validación de saldo] → Aceptado: no existe la entidad; se atiende en otro spec.

## Migration Plan

1. Editar `supabase/migrations/20261016000000_expense_payment_rate.sql` (todavía no está aplicada en ninguna base de producción ni publicada, así que se corrige en lugar de crear otra): agregar `paid_currency` y `paid_amount`; dejar `exchange_rate_type` en `bcv|eur|custom` y `reference_currency` en `USD|EUR`; reemplazar el check de "todas o ninguna" por los checks de pares. Sigue siendo re-ejecutable: debe eliminar también el check anterior (`drop constraint if exists`) por si una base local ya aplicó la primera versión. La aplica el usuario antes de desplegar el código.
2. Desplegar el código. El código nuevo escribe las columnas, así que la migración va antes.
3. Rollback: revertir el código; las columnas son nulas y aditivas y el código anterior las ignora.

## Open Questions

Ninguna pendiente. Confirmado por el usuario el 2026-10-19:
- El diálogo siempre muestra la moneda de pago, con `$` y `Bs`; el combo de tasa aparece siempre que alguna de las dos monedas sea Bs.
- Las opciones de tasa son BCV dólar, BCV euro y personalizada (el admin escribe la tasa); no se incluye Binance.
- El input del monto es lo realmente pagado en la moneda de pago, prellenado y editable; cuando la moneda difiere, el gasto conserva su monto original.

Supuesto mío, a verificar al aplicar: un gasto en `USDT` muestra `USDT` fijo y no ofrece conversión.

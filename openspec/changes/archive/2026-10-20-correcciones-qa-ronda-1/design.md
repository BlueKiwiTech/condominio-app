# Design

## Context

Hallazgos del reporte `qa/reports/2026-10-20-agente.md`. Causas encontradas leyendo y reproduciendo:
- **H-01:** `applyPaymentAllocation` leía cuotas y saldo a favor, calculaba en la app y escribía lote, cuotas y crédito en llamadas separadas; dos abonos simultáneos leían el mismo estado y el segundo pisaba al primero.
- **H-02/H-03:** `MoneyInput` descartaba en silencio cualquier carácter que no fuera dígito o el primer separador, así que `1.000,50` quedaba `1.00050` y `-5` quedaba `5`.
- **H-04:** `formatShortDate("2026-10-20")` hacía `new Date(...)`, que interpreta la fecha como medianoche UTC y la muestra el día anterior al oeste de UTC.
- **H-09:** la guarda "tiene pagos" hacía `.in('installment_id', ids)` con todos los ids de la plantilla; con cientos de cuotas la URL superaba el límite ("URI too long") y respondía con un error genérico.
- **H-07:** el proxy redirige a `/login` cualquier petición a una ruta protegida sin sesión, también el POST de una Server Action, lo que rompe el cliente.

## Goals / Non-Goals

**Goals:** que el dinero no se pierda ni se duplique bajo concurrencia; que ningún monto se altere en silencio; que cada validación dé un mensaje claro en español e inglés; que los specs lo dejen escrito.

**Non-Goals:** las decisiones de negocio listadas en el proposal; reescribir el motor de asignación; auditoría automática del saldo.

## Decisions

**1. Un abono es una transacción, serializada por casa.** `condo_apply_payment_batch` (misma función, nueva firma) toma `pg_advisory_xact_lock` sobre la casa, bloquea las cuotas a actualizar y la fila del saldo a favor, y comprueba que sigan **exactamente** como las leyó la app (`expected_amount_paid`, `expected_status`, `expected_credit`). Si no, devuelve `conflict` sin escribir; si sí, inserta el lote, registra `payment_in`, actualiza las cuotas y fija el crédito, todo junto. La app reevalúa con el estado nuevo y reintenta hasta 4 veces con una pausa corta; en una selección automática descarta las cuotas que otro pago ya cubrió, en una elegida a propósito (cuotas especiales) falla con "ya pagada" en vez de pagar otra cosa. El número de recibo se reserva una sola vez por abono. Alternativas descartadas: reescribir toda la asignación en SQL (demasiado código duplicado de `allocateFunds`); un `select … for update` desde PostgREST (no hay transacciones entre llamadas). Esto también elimina el hueco "lote escrito sin cuotas actualizadas". `creditSweep` (cron y generación de cuotas) NO usa el candado ni la comprobación: sigue escribiendo cuotas y crédito en llamadas separadas, así que una colisión con un abono sigue siendo posible (límite previo, documentado; la revisión lo señaló y moverlo a SQL queda como mejora posterior). Cada envío es un pago: no hay clave de idempotencia, así que un envío duplicado deliberado (no el doble clic, que el botón impide) es un segundo pago, y si otro abono cubrió toda la selección automática, el reintento lo registra como saldo a favor porque el dinero sí se recibió.

**2. Un solo parser de montos, estricto.** `lib/money/parseMoney.ts` lee `1.234,56` (punto = miles, coma = decimal) y también `1234.5` y `10.25` (un punto seguido de 1 o 2 dígitos es decimal; un punto seguido de exactamente 3 dígitos y nada más es miles, como imprime la app). Todo lo ambiguo o extraño devuelve error (letras, signos, exponente, más de una coma, grupos que no son de 3 dígitos, 3+ decimales tras un punto). `MoneyInput` conserva lo escrito, muestra el mensaje y entrega `null` mientras sea inválido, en vez de "arreglarlo". Los campos `type="number"` nativos (cuotas, diálogo de gastos) se quedan con su validación del navegador y los esquemas del servidor.

**3. Reglas de monto en el servidor.** `lib/validation/money.ts`: máximo 999.999.999.999 (cabe en `numeric(12,2)` y `numeric(14,2)`), como máximo 2 decimales (se rechaza `10,005` en vez de redondearlo) y, en los abonos, cero o al menos 0,01. Aplica a abonos, reportes del residente, cuotas, gastos, saldo inicial y ajustes. La tasa de cambio se acota a 1.000.000 (cliente y servidor).

**4. Fechas.** `formatShortDate/DateTime` interpretan una cadena `YYYY-MM-DD` con `parseISO` (día local); los llamadores dejan de envolver las fechas en `new Date(...)`. El servidor decide "hoy" con `caracasToday()` (`Intl` con `America/Caracas`), para rechazar fechas de abono futuras y para fechar saldo inicial y ajustes; el selector del formulario del admin no deja elegir días futuros (como ya hacía el del residente).

**5. Server Actions sin sesión.** El proxy no redirige las peticiones con la cabecera `next-action` en rutas protegidas del admin: la acción llega a `requireAdmin` y responde "sesión expirada". Las páginas y cualquier otra petición se redirigen como antes. Las Server Actions son invocables desde cualquier ruta, así que el redirect nunca fue una barrera real; la barrera es `requireAdmin` en cada acción (verificado: todas las acciones de escritura lo usan). `/saldo-comunidad` se añade a las rutas protegidas.

**6. "Tiene pagos" sin listar ids.** Un helper consulta `condo_payments` con `condo_installments!inner(template_id)` y `eq('condo_installments.template_id', id)` con `limit(1)`: una condición corta, sin depender del número de cuotas. Se sustituyen los tres usos de `.in(ids)` y las consultas `HEAD` con conteo (que fallaban sin mensaje) por selects normales.

**7. Rechazo con motivo.** El motivo (3 a 500 caracteres) se exige en el servidor y el botón se deshabilita en el cliente; es la regla de negocio del 2026-09-29 (el vecino ve la explicación en Mi Cartera). Confirmar o rechazar un reporte ya procesado responde "ya fue procesado".

**8. Menú.** Sección nueva "Comunidad" entre Gastos y Reportes con "Saldo de la comunidad".

**9. Un reporte se reserva antes de aplicarse.** `confirmPaymentReport` reclama el reporte con el mismo candado corto (`release_claimed_at`, 10 minutos) que usa la liberación de pagos en espera, antes de mover dinero: dos pestañas que confirman a la vez ya no aplican dos veces; la segunda responde "ya fue procesado". Si falla antes de aplicar, suelta el candado; si el pago ya se aplicó y falla el marcado final, lo conserva para no pagar de nuevo.

**10. Monto cero con saldo a favor.** Un abono de 0 es válido cuando el saldo a favor de la casa paga por completo al menos una cuota (el código y el spec ya lo anunciaban, pero el servidor lo rechazaba siempre); sin ninguna cuota pagada sigue siendo `insufficientAmount`. No suma a la comunidad (ese dinero se contó al recibirse).

**11. La función verifica también el precio de la cuota.** Además de `amount_paid` y `status`, comprueba `amount`: si un admin cambió el precio entre la lectura y la escritura, es un conflicto y se reevalúa, para no marcar `paid` con un monto calculado sobre el precio viejo.

**12. El monto se lee antes de enviarse.** `MoneyInput` muestra "Se leerá como …" mientras se escribe un monto con separadores, porque `1.500` es 1500 en el formato de la app y una persona con teclado anglosajón podría esperar 1,5.

**Impacto declarado (reglas del proyecto):**
- *Monedas:* nada se suma ni convierte entre monedas; el resumen del pago ahora etiqueta cada cuota en SU moneda.
- *Idempotencia:* un reintento por conflicto no escribe nada antes de tener éxito y reutiliza el lote y el recibo; el movimiento sigue siendo único por `(community, type, reference)`.
- *Fechas:* día calendario sin zona en toda la capa de presentación; "hoy" del servidor en Caracas.
- *RLS / residente:* sin tablas nuevas; la función sigue siendo `security definer` con permiso de admin de la comunidad o `service_role`, con las mismas revocaciones a `anon`/`public`; el residente no ve nada nuevo.

## Risks / Trade-offs

- [Reintentos que agotan los 4 intentos bajo mucha concurrencia] → se devuelve "otro pago se estaba procesando, nada se registró"; el admin reintenta; el candado por casa hace improbable más de un reintento.
- [El parser rechaza entradas que antes se aceptaban en silencio, como `1.2345`] → es intencional y el mensaje explica el formato.
- [`1.234` es 1234] → coincide con el formato en que la app imprime los montos; quien quiera decimales con punto escribe 1 o 2 dígitos.
- [Una fecha de abono "de hoy" cerca de la medianoche] → se compara contra el día de Caracas, no el del servidor.
- [El proxy deja pasar peticiones de acción sin sesión] → cada acción valida con `getUser()`; las acciones de lectura devuelven vacío por RLS.

## Migration Plan

1. Migración `20261022000000_payment_batch_atomic.sql` (la aplica el usuario antes de desplegar): elimina `condo_apply_payment_batch` con la firma anterior y crea la nueva. Sin cambios de datos.
2. Desplegar el código: el código nuevo llama a la firma nueva (con `expected_amount`), así que la migración va antes.
3. Rollback: revertir el código y la migración anterior; no hay datos que deshacer.

## Open Questions

- Ninguna que bloquee. Supuestos míos: fechas futuras de abono se rechazan (el formulario del residente ya lo hacía); más de 2 decimales se rechaza en vez de redondear; `1.234` es miles.

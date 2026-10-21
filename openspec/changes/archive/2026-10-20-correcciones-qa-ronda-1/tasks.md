# Tasks

## 1. Base de datos

- [x] 1.1 Crear `supabase/migrations/20261022000000_payment_batch_atomic.sql`: elimina `condo_apply_payment_batch` con la firma anterior y crea la nueva (candado por casa, comprobación del estado esperado de cuotas y saldo a favor, y escritura del lote, movimiento, cuotas y crédito en una sola transacción; devuelve `conflict` sin escribir). Verificar: es re-ejecutable, usa el prefijo `condo_`, mantiene las revocaciones a `public`/`anon` y la validación de permisos, y se aplica en el stack local sin errores.
- [x] 1.2 Migración lista para que el usuario la aplique: entregar el nombre del archivo y recordar que va antes de desplegar el código. Verificar: el timestamp es posterior a `20261021000000_community_balance_ledger.sql`.

## 2. Montos, fechas y validaciones

- [x] 2.1 Crear `lib/money/parseMoney.ts` (parser es-VE estricto) y reescribir `components/ui/money-input.tsx` para conservar lo escrito, mostrar el mensaje y entregar `null` mientras sea inválido. Verificar: una tabla de casos (`1.000,50`, `1.000`, `1234.5`, `-5`, `1e9`, `1,000.50`, vacío) da el resultado esperado.
- [x] 2.2 Crear `lib/validation/money.ts` (tope, máximo 2 decimales, cero solo en abonos) y aplicarlo en los esquemas de abonos, reportes del residente, cuotas, gastos, saldo inicial y ajustes; acotar la tasa de cambio en cliente y servidor; agregar los mensajes en es y en. Verificar: un monto enorme, `0,004` y `10,005` se rechazan con su mensaje.
- [x] 2.3 Corregir `lib/dateFormat.ts` para leer `YYYY-MM-DD` como día local, quitar los `new Date(...)` de fechas de calendario en los llamadores, y crear `lib/dates/caracas.ts` (`caracasToday`). Verificar: con zona UTC−5 el recibo, el historial y el libro muestran el mismo día.
- [x] 2.4 Rechazar en el servidor la fecha de abono futura (admin y residente) y limitar el selector del formulario del admin. Verificar: el selector no permite días futuros y el servidor responde con el mensaje.
- [x] 2.5 Agregar límites de longitud (casas, cuotas, gastos) y teléfono válido con sus mensajes. Verificar: un número de casa de 60 caracteres y un teléfono con letras se rechazan.

## 3. Abonos y reportes

- [x] 3.1 Reescribir `applyPaymentAllocation` (`lib/payments/applyAllocation.ts`) para llamar a la función atómica con el estado esperado y reintentar ante `conflict` (hasta 4 veces, descartando cuotas pagadas en una selección automática), reservando el recibo una sola vez; agregar el error `concurrentPayment` en todos los llamadores. Verificar: dos depósitos simultáneos de 3 USD dejan crédito 6; dos abonos de 70 USD a una cuota de 100 con 30 de crédito pagan la cuota una vez y dejan crédito 70.
- [x] 3.2 Exigir el motivo (3 a 500 caracteres) al rechazar un reporte en el servidor y en el botón, y responder "ya fue procesado" al confirmar o rechazar un reporte que ya no está pendiente. Verificar: no se puede rechazar sin motivo y la segunda confirmación desde una pestaña vieja muestra el mensaje sin aplicar dos veces.
- [x] 3.3 Corregir el formulario de abono: cuota en su moneda en el resumen, sin "al día" con monto vacío, USD por defecto sin cuotas y envío bloqueado con monto 0 sin nada que aplicar. Verificar: los cuatro casos.
- [x] 3.4 Diálogo de pago de gastos: confirmar deshabilitado con monto no válido y error que se limpia al cambiar datos. Verificar: con `0` y `-5` no se puede confirmar.

## 4. Acceso, cuotas y menú

- [x] 4.1 En `proxy.ts` proteger `/saldo-comunidad` y dejar pasar las peticiones con la cabecera `next-action` para que la acción responda `sessionExpired`; limpiar el error del servidor del login al editar un campo. Verificar: sin sesión `/saldo-comunidad` va a `/login`, y enviar un abono tras cerrar sesión en otra pestaña muestra "sesión expiró" sin escribir nada.
- [x] 4.2 Sustituir las comprobaciones "tiene pagos" por un helper que filtra por relación (`condo_installments!inner(template_id)`) con `limit(1)` en `lib/actions/cuotas.ts` y las consultas `HEAD` con conteo por selects normales (cuotas y gastos). Verificar: eliminar una cuota con pagos muestra "ya tiene pagos" y una de 300 cuotas sin pagos se elimina.
- [x] 4.3 Mover "Saldo de la comunidad" a una sección nueva "Comunidad" del menú del admin (es y en). Verificar: aparece en "Comunidad" y no en "Gastos".
- [x] 4.4 `scripts/e2e/setup-local-supabase.sh` genera `RESIDENT_SESSION_SECRET`. Verificar: el login de residente funciona en una máquina sin `.env`.
- [x] 4.5 Tras la revisión: reservar el reporte antes de aplicarlo en `confirmPaymentReport` (candado corto), comprobar también `expected_amount` en la función SQL, aceptar un abono de 0 pagado con saldo a favor, mostrar "Se leerá como …" en `MoneyInput` y hacer exacta la comprobación de 2 decimales. Verificar: dos confirmaciones simultáneas aplican una sola vez; cambiar el precio de la cuota entre lectura y escritura da `conflict`; un abono de 0 con saldo a favor suficiente paga la cuota.

## 5. Cierre y verificación



- [x] 5.1 Con el Supabase local y la migración aplicada, repetir de punta a punta los hallazgos corregidos (concurrencia, montos, fechas, rechazo, eliminación, menú) y los escenarios de `qa/`. Verificar: todo pasa y el invariante del saldo de la comunidad cuadra.
- [x] 5.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados.
- [x] 5.3 Ejecutar el agente `spec-auditor` sobre `payments`, `dual-auth`, `saldo-comunidad`, `cuota-engine`, `houses-residents`, `gastos`, `reporting-morosos` y `entrada-de-montos` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- La migración debe aplicarse antes de desplegar; el usuario la aplica manualmente en Supabase.
- Revisar el diff con el agente `adversarial-reviewer` antes de fusionar.
- Al archivar, actualizar Known Limitations: en `payments` quitar la de "Sin transacción: los fallos tras insertar `condo_payments`…" y la de `applyPaymentAllocation` no transaccional, y agregar: `creditSweep` no usa el candado ni la comprobación de estado, un envío duplicado deliberado es un segundo pago (sin clave de idempotencia) y un abono que agota los reintentos deja un hueco en la numeración de recibos; en `saldo-comunidad` quitar "si fallan los pasos posteriores al lote de pagos el dinero ya sumó".

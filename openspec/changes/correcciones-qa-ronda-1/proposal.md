# Proposal

## Why

La primera ronda de pruebas exploratorias con un agente (`qa/reports/2026-10-20-agente.md`, 31 hallazgos) encontró dos fallos de dinero reproducibles y varios huecos de validación y de mensajes: dos abonos simultáneos a la misma casa pierden saldo a favor y pueden pagar dos veces la misma cuota; `1.000,50` se registra como 1,00 y un `-5` se guarda como +5; las fechas se muestran un día antes; montos enormes, decimales de más y textos largos llegan a la base de datos y fallan con un error genérico; y una cuota con muchos meses y casas no se puede ni eliminar. Los specs no decían cómo debía comportarse nada de esto, así que hay que dejarlo escrito.

## What Changes

- **Abonos concurrentes (H-01):** el lote de pagos, el movimiento del saldo de la comunidad, las cuotas y el saldo a favor se guardan en **una sola transacción**, serializada por casa; si otro pago a la misma casa cambió el estado, no se escribe nada y el abono se reevalúa y se reintenta. Reemplaza la escritura "ledger-first no transaccional".
- **Entrada de montos (H-02, H-03, H-05, H-08, H-09):** un parser único es-VE (`1.234,56`) que rechaza con mensaje lo ambiguo (signos, `e`, `1,000.50`) en vez de alterarlo; tope de monto, máximo 2 decimales y mínimo 0,01 en todos los formularios; tasa de cambio acotada.
- **Fechas (H-04, H-06):** una fecha de calendario se muestra como ese mismo día en todas las pantallas; un abono no puede tener fecha futura (en el selector y en el servidor, con el día de Caracas).
- **Formularios y mensajes (H-07, H-10, H-13 a H-16, H-18, H-19, H-20, H-21):** una acción sin sesión responde "sesión expirada" en vez de romper la página; el rechazo de un reporte exige motivo; el resumen del pago etiqueta cada cuota en su moneda y no dice "al día" sin monto; se bloquea enviar un abono sin nada que aplicar; mensajes claros al confirmar un reporte ya procesado; el error de login no se acumula; límites de largo y teléfono válido en casas, cuotas y gastos.
- **Eliminar o editar cuotas (H-09):** la comprobación "tiene pagos" ya no lista todos los ids en la URL (fallaba con "URI too long" en cuotas con cientos de cuotas generadas).
- **Rutas:** `/saldo-comunidad` pasa a estar protegida por el proxy, y el menú del admin agrupa "Saldo de la comunidad" en una sección nueva **Comunidad** (antes estaba bajo Gastos).
- **Entorno de pruebas:** `setup-local-supabase.sh` genera `RESIDENT_SESSION_SECRET` (sin él, el login de residente fallaba en una máquina sin `.env`).

## Capabilities

### New Capabilities
- `entrada-de-montos`: cómo se interpreta, valida y acota un monto escrito por el usuario en cualquier formulario.

### Modified Capabilities
- `payments`: escritura atómica y serializada por casa del abono; fecha de abono no futura; motivo obligatorio al rechazar un reporte; formulario que no deja enviar sin nada que aplicar y etiqueta cada cuota en su moneda.
- `dual-auth`: la ruta `/saldo-comunidad` queda protegida y una Server Action sin sesión responde por sí misma.
- `saldo-comunidad`: la pantalla vive en la sección "Comunidad" del menú.
- `cuota-engine`: la guarda de eliminación comprueba pagos sin depender del número de cuotas; límites de nombre y descripción.
- `houses-residents`: límites de longitud y teléfono válido.
- `gastos`: límites de texto y confirmación de pago bloqueada con un monto no válido.
- `reporting-morosos`: las fechas de calendario se muestran como el mismo día.

## Fuera de alcance

Quedan pendientes de decisión del negocio y NO se tocan: pantalla para registrar una tasa con fecha pasada (H-11), qué pasa al reactivar una cuota desactivada (H-12), el "Balance de la comunidad" del portal del residente que suma saldos a favor de todas las casas (H-24), la definición de "Cobrado" (H-26), los nombres en el login del residente (H-27), si un gasto en espera aparece en "pagados" (H-31), y los totales de los recibos con saldo a favor aplicado (H-17, H-25). Tampoco: mensajes por campo en formularios vacíos (H-22), aviso de conceptos de gasto duplicados (H-23), ni un tope de partes de una cuota dividida (ya existe el máximo de 360).

## Impact

- **Base de datos (migración nueva, la aplica el usuario antes de desplegar):** `20261022000000_payment_batch_atomic.sql` reemplaza `condo_apply_payment_batch` por una versión con candado por casa y comprobación de estado esperado. No cambia datos.
- **Código:** `lib/payments/applyAllocation.ts`, `lib/validation/*`, `lib/money/parseMoney.ts`, `lib/dates/caracas.ts`, `lib/dateFormat.ts`, `components/ui/money-input.tsx`, formulario de abonos, diálogo de gastos, rechazo de reportes, login, `proxy.ts`, acciones de cuotas y gastos, menú del admin, `messages/*`.
- **Riesgos:** el parser es más estricto que el campo anterior (por diseño); `1.234` se lee como 1234 (miles), como imprime la app.

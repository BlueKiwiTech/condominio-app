# Tasks

## 1. Bug de montos: recibido vs saldo previo

- [x] 1.1 En `lib/payments/applyAllocation.ts` separar `creditUsed` y `topUp` (nuevo crédito = existente − usado + sobrante) y guardar en la fila top-up solo el sobrante del dinero recibido; verificar: crédito 5, especial 24, recibido 25 → filas suman 25, crédito 6, comunidad +25
- [x] 1.2 Mostrar el monto recibido en el encabezado del recibo (admin y vecino) y "Saldo a favor aplicado" cuando exista; si hace falta persistir `creditUsed`, migración nueva lista para que el usuario la aplique; verificar con los casos del spec (crédito 5, especial 28, recibido 25 → recibo 25 + 3 aplicado, crédito 2)
- [x] 1.3 Corregir el "Resumen del pago" de `PaymentFormClient` ("Saldo a favor aplicado" real y sobrante); verificar con el escenario de la casa 2041 en el formulario
- [x] 1.4 Verificar la misma atribución en `registerPayment`, confirmación de reportes y liberación (`releaseHeld`), monto 0 cubierto por crédito y el caso concurrente (`conflict`)

## 2. Confirmar reporte con especiales

- [x] 2.1 Extender `confirmPaymentReport` con `selected_special_ids` opcionales: validar con `validateSpecialSelection`, aplicar con `explicit_installments` y persistir selección en `on_hold`; verificar rechazando una cuota de otra casa
- [x] 2.2 Cargar las especiales pendientes por casa en `app/[locale]/(admin)/pagos-reportados/page.tsx` y mostrar el diálogo en `PaymentReportsPageClient` (casillas sin marcar, confirma directo si no hay especiales); textos es/en; verificar en el navegador ambos caminos
- [x] 2.3 Verificar que confirmar con la especial de 24 y reporte de 25 USD deja recibo de 25 y sobrante 1 a saldo a favor

## 3. Admin: quitar saldo inicial

- [x] 3.1 Retirar botón, diálogo, acción `registerOpeningBalance`, esquema y textos huérfanos; `page.tsx` deja de consultar `opening`; verificar que la pantalla solo muestra "Ajuste" y que un movimiento `opening` histórico se sigue listando

## 4. Vista Vecino

- [x] 4.1 `getCommunityBalanceData` devuelve el saldo guardado por moneda y `MiComunidadClient` lo usa en "saldo disponible"; verificar que coincide con `/saldo-comunidad` del admin y que no se expone el libro
- [x] 4.2 En `ReportPaymentDialog`, con Bs y tasa fresca mostrar tasa BCV, fecha y aviso de referencia; textos es/en; verificar Bs, USDT y tasa vencida en el navegador

## 5. Cierre

- [x] 5.1 Ejecutar `npm run build` y `npx eslint .` sin errores
- [ ] 5.2 Ejecutar el agente `spec-auditor` sobre `saldo-comunidad`, `payments` y `resident-portal` antes de archivar

## Workflow follow-up

- Cerrar con `/commit` y `/pr`; archivar el change después de la revisión.

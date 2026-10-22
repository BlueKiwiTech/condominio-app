# Proposal

## Why

La ronda de pruebas del 21/OCT dejó tres ajustes de admin y dos de la vista del vecino, más un bug de montos: un abono de $25 a una cuota especial de $24 (casa Mafalda, todo USD) quedó registrado como $26 porque el sistema mezcló en la transacción el saldo a favor que la casa ya tenía. Además, el saldo de la comunidad que ve el vecino sigue calculándose con créditos de casas, no con el saldo guardado del libro.

## What Changes

- **Admin, Saldo de la comunidad**: se elimina el botón y el formulario "Saldo inicial"; queda solo "Ajuste". Se retira el requisito `Opening balance per currency`. El tipo de movimiento `opening` se conserva solo para movimientos históricos ya registrados.
- **Admin, confirmar reporte del vecino**: si la casa tiene cuotas especiales pendientes, confirmar abre un diálogo con esas cuotas (casillas sin marcar, opcional). Si marca alguna, el abono se aplica solo a ellas (misma regla que el formulario de pago); si no marca, flujo normal. Sin especiales pendientes, confirma directo como hoy.
- **Bug de montos en recibos**: el saldo a favor existente puede seguir completando un pago, pero la transacción solo refleja lo entregado: el recibo y el saldo de la comunidad suman lo recibido, el saldo usado se muestra aparte como "saldo a favor aplicado" y el sobrante a la billetera es solo del dinero recibido.
- **Vista Vecino, `/mi-comunidad`**: la tarjeta "saldo disponible" muestra el saldo guardado de la comunidad por moneda (el del libro), solo lectura y sin movimientos.
- **Vista Vecino, reportar pago**: al elegir Bs se muestra la tasa BCV (Bs por USD) y su fecha, junto con un aviso de que es solo referencia. USDT queda igual.

Fuera de alcance: cambiar el barrido de crédito, el libro de movimientos o los ajustes manuales; mostrar tasa en USDT; mostrar el libro o el detalle de movimientos al vecino; modificar saldos ya registrados (no se corrigen retroactivamente los recibos pasados con el bug).

## Capabilities

### New Capabilities

### Modified Capabilities
- `saldo-comunidad`: se retira el saldo inicial; la pantalla del admin ya no ofrece ese formulario; el vecino puede leer el saldo por moneda (no el libro).
- `payments`: con cuotas elegidas expresamente no se netea el saldo a favor existente; confirmar un reporte permite elegir cuotas especiales.
- `resident-portal`: "saldo disponible" de `/mi-comunidad` usa el saldo guardado; el formulario de reporte muestra tasa BCV, fecha y aviso de referencia al elegir Bs.

## Impact

- Código: `components/saldo/CommunityBalancePageClient.tsx`, `app/[locale]/(admin)/saldo-comunidad/page.tsx`, `lib/actions/communityBalance.ts` y su validación (retirar apertura); `lib/payments/applyAllocation.ts` (atribución recibido/saldo), `lib/payments/releaseHeld.ts` (misma ruta), vista previa de `PaymentFormClient.tsx` y recibo `pagos/[batchId]` y `mi-cartera/[batchId]`; `lib/actions/paymentReports.ts` y `components/paymentReports/PaymentReportsPageClient.tsx` (diálogo y selección); `lib/resident/queries.ts`, `components/resident/MiComunidadClient.tsx`; `components/resident/ReportPaymentDialog.tsx`; `messages/es.json` y `messages/en.json`.
- Datos: sin migración prevista (`condo_apply_payment_batch` ya recibe el crédito esperado y el nuevo). Lectura del saldo del resident con service-role.
- Specs: deltas en los tres capabilities anteriores.

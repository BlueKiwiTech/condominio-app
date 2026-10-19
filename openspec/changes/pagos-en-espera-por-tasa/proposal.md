# Proposal

## Why

Cuando falta la tasa BCV que corresponde a la fecha de un pago en Bs que se convierte a USD, hoy el sistema responde `staleExchangeRate` y el pago no se registra: el admin queda bloqueado y el residente no puede confirmar su reporte. No debería bloquearse a nadie. El pago debe registrarse como "en espera de tasa" y procesarse solo cuando la tasa esté disponible, sin que nadie tenga que reintentarlo. Con el change `tasas-bcv-dolarvzla` esos casos serán pocos (caída de la fuente, o registrar un pago fechado el sábado antes del cron de las 06:00 VET), pero cuando ocurran no deben perder ni bloquear el pago.

## What Changes

- Estado nuevo `on_hold` ("En espera de tasa") en `condo_payment_reports` y `condo_expenses`, sin tabla nueva. Un reporte ya guarda todo lo necesario para repetir un pago (casa, monto, moneda, fecha, referencia, notas, cuotas) y se enlaza al recibo al confirmarse, así que nada se migra entre tablas al aprobarse.
- Pago registrado por el admin: si la asignación se bloquea por falta de tasa BCV fresca a `payment_date`, en vez de `staleExchangeRate` se crea un reporte `on_hold` (con `created_by` del admin) y la acción responde éxito indicando que quedó en espera.
- Reporte del residente: se crea como `on_hold` en vez de `pending` si no puede convertirse aún; el admin no puede confirmarlo mientras esté en espera. Si al confirmar un reporte `pending` la tasa sigue faltando, pasa a `on_hold` en vez de dar error. Un reporte en espera puede rechazarse.
- Gasto con alguna moneda en Bs (USD pagado en Bs, Bs pagado en USD o Bs pagado en Bs) con tasa `bcv` o `eur` sin tasa fresca a `paid_date`: queda `on_hold` guardando fecha, notas, tipo de tasa y lo pagado (la moneda de pago y el monto pagado si la moneda difiere, o el monto final si coincide). La tasa personalizada se procesa al momento; USD pagado en USD y USDT no usan tasa.
- Liberación automática: `releaseHeldTransactions` corre al final del cron de tasas y tras fijar una tasa manual. Un pago del admin o un gasto se aplican solos; un reporte de residente pasa a `pending` para que el admin lo confirme. Cada liberación se reclama con `release_claimed_at` para no duplicar pagos ni recibos.
- Mientras algo está en espera no se tocan cuotas, pagos ni saldo a favor: la casa sigue mostrando su deuda. El residente ve "En espera de tasa" y el admin lo ve en pagos reportados y en gastos.

Fuera de alcance:
- Notificaciones por correo o push al liberar.
- El barrido automático del saldo a favor (no convierte entre monedas).
- "En espera" para Binance/USDT en pagos de cuotas (mercado 24/7: conserva `staleExchangeRate`) y para pagos en USD o en la misma moneda de la cuota. Los gastos ya no usan Binance.
- Depósitos a cartera sin cuotas elegibles: no convierten, así que no entran en espera.
- Cambiar la regla de frescura de 24 h o el corte por `updated_at`.
- Deshacer pagos ya confirmados.

## Capabilities

### New Capabilities
<!-- Ninguna: el comportamiento pertenece a capacidades existentes. -->

### Modified Capabilities
- `payments`: pago sin tasa BCV queda en espera en vez de rechazarse, creación y confirmación de reportes, rechazo de reportes en espera y liberación automática.
- `mi-cartera`: estado `on_hold` del reporte visible para el residente y liberación disparada por el cron de tasas y por la tasa manual.
- `resident-portal`: Mi Cartera muestra los reportes "En espera de tasa".
- `gastos`: un gasto con Bs en alguna de sus monedas (la del gasto o la de pago) sin tasa BCV o EUR fresca queda en espera, se libera solo y sigue contando como pendiente.

## Impact

- BD: migración nueva con el check de `status` de `condo_payment_reports` y `condo_expenses` ampliado a `on_hold`, columnas `created_by` (reportes) y `release_claimed_at` (ambas tablas) y los checks de pares y de dependencia de las columnas de tasa y de pago de gastos relajados solo para el estado en espera. Sin cambios de RLS.
- Código: `lib/payments/applyAllocation.ts`, `lib/actions/payments.ts`, `lib/actions/paymentReports.ts`, `lib/actions/residentPayments.ts`, `lib/actions/gastos.ts`, `lib/actions/exchangeRate.ts`, `app/api/cron/exchange-rate/route.ts`, un módulo nuevo de liberación, la consulta de gastos pendientes del dashboard, y la interfaz de pagos reportados, Mi Cartera, formulario de pago y lista de gastos, con textos en `messages/es.json` y `messages/en.json`.
- Monedas: lo pagado y el equivalente de un gasto liberado se calculan como en `gastos-pago-multimoneda`; ningún total suma monedas.
- Dependencias: la parte de gastos usa las columnas de moneda de pago y de tasa de `gastos-pago-multimoneda` (ya fusionado en `main`, pendiente de archivar). La migración de este change va después de la de ese change.

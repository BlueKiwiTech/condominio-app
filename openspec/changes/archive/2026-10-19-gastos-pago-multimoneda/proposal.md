# Proposal

## Why

Al marcar un gasto como pagado hoy solo se puede ajustar el monto, la fecha y las notas ([lib/actions/gastos.ts](lib/actions/gastos.ts) `markExpensePaid`), siempre en la moneda del gasto. En la práctica un gasto se puede pagar en una moneda distinta a la suya (un gasto de $110 pagado en bolívares, o un gasto en Bs pagado en dólares), y entonces el monto cambia según la tasa del día. Hoy no queda ningún registro ni de la moneda en que se pagó, ni del monto realmente pagado, ni de la tasa. El admin necesita ver siempre en qué moneda se registra el pago, elegir con qué tasa se convierte (BCV dólar, BCV euro o una personalizada que él escribe) y dejar guardado lo pagado, para poder contestar después "cuánto costó realmente este gasto". La tasa del euro ya se almacena desde el change `tasa-bcv-calendario` (archivado) y este es el change que la consume.

## What Changes

- El diálogo "Marcar gasto como pagado" muestra siempre la **moneda de pago**: un selector con `$` y `Bs`, por defecto la moneda del gasto. Para un gasto en `USDT` la moneda de pago se muestra fija como `USDT`, sin conversión.
- El combo de tasa aparece siempre que la moneda del gasto o la de pago sea `Bs` (solo `$` pagado en `$` no lo muestra). Sus opciones son BCV dólar (`bcv`), BCV euro (`eur`) y personalizada (`custom`, donde el admin escribe la tasa en Bs por unidad). No incluye Binance. Cada opción muestra su valor vigente a la fecha de pago.
- La tasa elegida es el multiplicador entre las dos monedas: gasto en `$` pagado en `Bs` da `monto × tasa` (110 $ con dólar 881,0664 son 96.917,30 Bs; con euro 991,1645, 109.028,10 Bs, "a tasa euro"); gasto en `Bs` pagado en `$` da `monto ÷ tasa`.
- El input del monto es lo realmente pagado en la moneda de pago, prellenado con el monto convertido y editable.
- Cuando la moneda de pago difiere de la del gasto, el gasto conserva su `amount` original y se guarda aparte lo pagado (`paid_currency`, `paid_amount`) con la tasa (`exchange_rate`, `exchange_rate_type`). Cuando coinciden, `amount` se sobrescribe como hoy; en un gasto en `Bs` pagado en `Bs` se guarda además el equivalente (`reference_amount`, `reference_currency`: `USD` para `bcv` y `custom`, `EUR` para `eur`).
- Las tasas `bcv` y `eur` deben estar frescas (menos de 24 h desde `updated_at`, medida contra `paid_date`, regla vigente de `mi-cartera`); sin tasa fresca, el pago se bloquea con `staleExchangeRate` y no se escribe nada. La tasa personalizada no pasa por esa regla.
- La lista de gastos pagados muestra el monto pagado con su moneda, la tasa y el equivalente, sin sumarlos a ningún agregado.
- Segunda excepción declarada a la regla "no convertir entre monedas" (la primera es la asignación de wallet de Mi Cartera): se documenta en el spec `mi-cartera`, en `CLAUDE.md` y en `openspec/config.yaml`.

Fuera de alcance:
- Validar el saldo disponible de la comunidad al pagar un gasto: no existe la entidad "comunidad con saldo"; irá en otro spec.
- Pagos parciales de un gasto (un gasto sigue teniendo un solo pago).
- Cambiar la regla de frescura de 24 h o la regla de "tasa a una fecha".
- Binance/USDT como moneda de pago o como opción de tasa, y una segunda fuente de tasas.
- Sumar o convertir montos en cualquier agregado de gastos (siguen agrupados por la moneda original del gasto).
- Guardar la tasa personalizada en `condo_exchange_rates` (queda solo en la fila del gasto).
- El "en espera" cuando falta la tasa BCV: vive en el change `pagos-en-espera-por-tasa`, que debe ajustarse después a esta regla de monedas.

## Capabilities

### New Capabilities
<!-- Ninguna: el comportamiento pertenece a capacidades existentes. -->

### Modified Capabilities
- `gastos`: el requisito "Mark as paid" admite elegir moneda de pago y tasa y guarda lo pagado; la lista de pagados lo muestra.
- `mi-cartera`: el requisito "Single cross-currency exception" pasa a declarar la conversión al pagar gastos como segunda excepción.

## Impact

- BD: migración nueva sobre `condo_expenses` con seis columnas nulas (`exchange_rate`, `exchange_rate_type`, `reference_amount`, `reference_currency`, `paid_currency`, `paid_amount`) y sus checks. Sin cambios de RLS; los gastos siguen siendo solo admin. La migración aún no está aplicada ni publicada, así que se edita en lugar de crear otra.
- Código: `lib/actions/gastos.ts` (`markExpensePaid`), `lib/validation/gastos.ts`, `lib/gastos/paymentRate.ts`, `components/gastos/GastosPageClient.tsx`, `components/gastos/GastosPagadosPageClient.tsx`, `components/gastos/types.ts`, `app/[locale]/(admin)/gastos/page.tsx`, `app/[locale]/(admin)/gastos-pagados/page.tsx`, `messages/es.json` y `messages/en.json`. Una primera versión ya está en `main` local y se ajusta en la fase de aplicación.
- Docs: `CLAUDE.md` y `openspec/config.yaml` (declaración de la excepción).
- Monedas: ningún total suma entre USD/Bs/USDT; lo pagado y el equivalente se guardan y muestran por fila, aparte del monto original.

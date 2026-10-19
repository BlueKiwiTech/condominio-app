# Proposal

## Why

Al marcar un gasto como pagado hoy solo se puede ajustar el monto, la fecha y las notas ([lib/actions/gastos.ts](lib/actions/gastos.ts) `markExpensePaid`). Cuando el gasto está en bolívares (`Bs`), el equivalente en una moneda de referencia depende de la tasa del día, y hoy no queda ningún registro de la tasa con la que se pagó. El admin necesita elegir, al pagar, con qué tasa se valora el pago (BCV dólar, BCV euro, Binance o una personalizada) y dejar guardado el equivalente, para poder contestar después "cuánto costó realmente este gasto". La tasa del euro ya se almacena desde el change `tasa-bcv-calendario` (archivado) y este es el change que la consume.

## What Changes

- El diálogo "Marcar como pagado" muestra la moneda del gasto. Si es `Bs`, aparece además un combo de tasa con el valor vigente de cada opción (BCV USD, BCV EUR, Binance y personalizada) a la fecha de pago elegida, y el equivalente calculado se actualiza al cambiar la tasa, el monto o la fecha. En `USD` y `USDT` el diálogo no cambia.
- El monto (input existente) sigue siendo el monto realmente pagado en la moneda del gasto, prellenado con el `amount` del gasto y editable.
- Al guardar, la fila de `condo_expenses` registra la tasa usada (`exchange_rate`, `exchange_rate_type` con `bcv|eur|binance|custom`), el equivalente (`reference_amount`) y su moneda (`reference_currency`: `USD` para `bcv`, `binance` y `custom`; `EUR` para `eur`; `USDT` para `binance`).
- Las tasas `bcv`, `eur` y `binance` deben estar frescas (menos de 24 h desde `updated_at`, medida contra `paid_date`, regla vigente de `mi-cartera`); sin tasa fresca, el pago se bloquea con `staleExchangeRate` y no se escribe nada. La tasa personalizada no pasa por esa regla.
- La lista de gastos pagados muestra la tasa y el equivalente de cada gasto convertido, sin sumarlo a ningún agregado.
- Segunda excepción declarada a la regla "no convertir entre monedas" (la primera es la asignación de wallet de Mi Cartera): se documenta en el spec `mi-cartera`, en `CLAUDE.md` y en `openspec/config.yaml`.

Fuera de alcance:
- Validar el saldo disponible de la comunidad al pagar un gasto: no existe la entidad "comunidad con saldo"; irá en otro spec.
- Pagos parciales de un gasto (un gasto sigue teniendo un solo pago).
- Cambiar la regla de frescura de 24 h o la regla de "tasa a una fecha".
- Una segunda fuente de tasas (dolarvzla).
- Conversión para gastos en `USD` o `USDT`, y sumar o convertir montos en cualquier agregado de gastos (siguen agrupados por la moneda original del gasto).
- Guardar la tasa personalizada en `condo_exchange_rates` (queda solo en la fila del gasto).

## Capabilities

### New Capabilities
<!-- Ninguna: el comportamiento pertenece a capacidades existentes. -->

### Modified Capabilities
- `gastos`: el requisito "Mark as paid" admite elegir tasa y guarda tasa y equivalente; la lista de pagados los muestra.
- `mi-cartera`: el requisito "Single cross-currency exception" pasa a declarar la conversión al pagar gastos como segunda excepción.

## Impact

- BD: migración nueva sobre `condo_expenses` con cuatro columnas nulas y un check para `exchange_rate_type`. Sin cambios de RLS; los gastos siguen siendo solo admin.
- Código: `lib/actions/gastos.ts` (`markExpensePaid`), `lib/validation/gastos.ts`, `lib/exchangeRate.ts` o un helper nuevo para el cálculo del equivalente, `components/gastos/GastosPageClient.tsx`, `components/gastos/GastosPagadosPageClient.tsx`, `components/gastos/types.ts`, `app/[locale]/(admin)/gastos/page.tsx`, `messages/es.json` y `messages/en.json`.
- Docs: `CLAUDE.md` y `openspec/config.yaml` (declaración de la excepción).
- Monedas: ningún total suma entre USD/Bs/USDT; el equivalente se guarda y muestra por fila, aparte del monto original.

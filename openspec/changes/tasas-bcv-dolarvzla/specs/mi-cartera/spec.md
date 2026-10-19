## MODIFIED Requirements

### Requirement: Daily exchange-rate cron
La ruta `GET /api/cron/exchange-rate` (`0 10 * * *` UTC en `vercel.json`, una sola vez al día) SHALL exigir `Authorization: Bearer ${CRON_SECRET}` (401) y obtener las tasas de dos fuentes independientes: `bcv` y `eur` de `https://rates.dolarvzla.com/bcv/current.json` (`current.usd` y `current.eur`, sin clave) y `binance` de cotizave (`https://api.cotizave.com/v1/fx/rates`, mercado `binance`, campo `mid`, con `COTIZAVE_API_KEY`). SHALL insertar cada tasa con `source = 'cron'` solo si es un número mayor a 0.

#### Scenario: Sin autorización
- **WHEN** falta o es incorrecto el Bearer
- **THEN** responde 401 y no inserta nada

#### Scenario: Fuente de cada tasa
- **WHEN** el cron corre y ambas fuentes responden
- **THEN** `bcv` y `eur` se insertan con `current.usd` y `current.eur` de dolarvzla, y `binance` con el `mid` del mercado `binance` de cotizave

#### Scenario: Tasa BCV no sale de cotizave
- **WHEN** la respuesta de cotizave trae los mercados `reference` y `eur_reference`
- **THEN** se ignoran y no se inserta ninguna tasa `bcv` ni `eur` a partir de ellos

#### Scenario: Falla el proveedor
- **WHEN** dolarvzla y cotizave fallan (respuesta no-OK o excepción)
- **THEN** responde 502 con `success: false` y no inserta nada

#### Scenario: Un mercado ausente
- **WHEN** falta el mercado `binance` en la respuesta de cotizave
- **THEN** se insertan `bcv` y `eur`, `binance` se reporta `skipped` y `success` es `false`

#### Scenario: Guarda la fecha de vigencia
- **WHEN** dolarvzla responde `current.date = 2026-10-19` con `usd = 881.0664`
- **THEN** la fila `bcv` se guarda con `rate = 881.0664` y `effective_date = 2026-10-19`

#### Scenario: Corrida en fin de semana
- **WHEN** el cron corre un sábado y dolarvzla devuelve `current.date` del lunes siguiente
- **THEN** se inserta una fila nueva con esa `effective_date` y su `updated_at` del sábado

#### Scenario: Fecha de vigencia inválida
- **WHEN** `current.date` llega ausente o con un formato inválido (`YYYY-MM-DD`)
- **THEN** `bcv` y `eur` se insertan con `effective_date` nula, se reporta un aviso y `success` no cambia por ese motivo

#### Scenario: Binance sin fecha de vigencia
- **WHEN** el cron inserta la tasa `binance`
- **THEN** `effective_date` queda nula y `source_updated_at` es el `updated_at` del mercado si existe

#### Scenario: Respuesta del cron
- **WHEN** termina una corrida
- **THEN** la respuesta incluye por tipo el resultado y la `effective_date` guardada, además de los avisos

## ADDED Requirements

### Requirement: Cron rounds BCV rates and omits the source time
Para `bcv` y `eur`, el cron SHALL redondear la tasa a 4 decimales antes de insertarla, reportar ese mismo valor y guardar `source_updated_at` nulo, porque dolarvzla no entrega hora.

#### Scenario: Euro con más de 4 decimales
- **WHEN** dolarvzla responde `current.eur = 991.16445734`
- **THEN** la fila `eur` se guarda con `rate = 991.1645`, el resultado reporta ese mismo valor y `source_updated_at` queda nulo

### Requirement: Cron source failures are independent
Si dolarvzla falla (respuesta no OK, excepción o `current.usd` y `current.eur` inválidos), `bcv` y `eur` SHALL omitirse y reportarse con `success: false`, sin usar cotizave como respaldo. Si cotizave falla o falta `COTIZAVE_API_KEY`, solo `binance` SHALL omitirse y reportarse con `success: false`. La ruta SHALL responder 502 únicamente cuando ambas fuentes fallen.

#### Scenario: Falla dolarvzla
- **WHEN** dolarvzla responde no-OK o lanza excepción y cotizave responde bien
- **THEN** `bcv` y `eur` se reportan `skipped`, `binance` se inserta y `success` es `false`

#### Scenario: Falla cotizave
- **WHEN** cotizave responde no-OK o falta `COTIZAVE_API_KEY` y dolarvzla responde bien
- **THEN** `bcv` y `eur` se insertan, `binance` se reporta `skipped` y `success` es `false`

#### Scenario: Sin respaldo desde cotizave
- **WHEN** dolarvzla falla y cotizave sí trae el mercado `reference`
- **THEN** no se inserta ninguna tasa `bcv` ni `eur`

### Requirement: Weekend rate of the next business day
El cron SHALL insertar, en una corrida de sábado, domingo o feriado, la tasa BCV que dolarvzla entrega en `current` (la del próximo día hábil, publicada el viernes), de modo que un pago con fecha de fin de semana se convierta con esa tasa mediante la regla existente de "tasa a una fecha" (`updated_at`) y la frescura de 24 h, sin cambios en esas reglas.

#### Scenario: Pago fechado en sábado
- **WHEN** dolarvzla devolvió el viernes `current.date = 2026-10-19` y el cron del sábado 2026-10-17 insertó esa tasa
- **THEN** un pago en Bs fechado el 2026-10-17 se convierte con la tasa con `effective_date = 2026-10-19`

#### Scenario: Pago fechado en viernes
- **WHEN** el cron del viernes 2026-10-16 (06:00 VET) insertó `current.date = 2026-10-16` y el del sábado insertó la del lunes
- **THEN** un pago fechado el viernes, registrado el sábado o después, se convierte con la tasa del viernes

#### Scenario: Lunes feriado
- **WHEN** el lunes es feriado y el BCV publicó el viernes la tasa del martes
- **THEN** el cron del sábado, domingo y lunes inserta la tasa del martes y un pago fechado el lunes se convierte con ella

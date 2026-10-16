## MODIFIED Requirements

### Requirement: Rate types and currency mapping
Existirán exactamente tres tipos de tasa: `bcv` (dólar oficial, para `Bs`), `eur` (euro oficial del BCV) y `binance` (para `USDT`). `USD` SHALL NOT requerir tasa y `eur` SHALL NOT estar asociado a ninguna moneda de pago de la app (`rateTypeForCurrency`); se almacena para uso de otras capacidades.

#### Scenario: Mapeo
- **WHEN** se consulta el tipo de tasa para `Bs`, `USDT` y `USD`
- **THEN** devuelve `bcv`, `binance` y `null` respectivamente

#### Scenario: Euro sin moneda asociada
- **WHEN** se inserta una tasa `eur`
- **THEN** no cambia ninguna conversión de pagos existente y queda disponible en el historial

### Requirement: Exchange rate table is append-only
La tabla `condo_exchange_rates` (`rate_type` en `bcv|eur|binance`, `rate` decimal(14,4) > 0, `source` en `cron|admin`, `effective_date` date opcional, `source_updated_at` timestamptz opcional, `updated_at`, `updated_by`) SHALL ser un historial de solo inserciones; la tasa "actual" SHALL ser la fila más reciente por `updated_at` de cada `rate_type`. `effective_date` es la fecha de vigencia publicada por la fuente y SHALL ser nula cuando la fuente no la entrega; `effective_date` y `source_updated_at` SHALL ser solo datos de auditoría y NO intervenir en la frescura ni en el corte "a una fecha". RLS SHALL estar activo con política de admin; el cron y las lecturas del residente usan service-role.

#### Scenario: Nueva tasa
- **WHEN** se establece una tasa nueva
- **THEN** se inserta una fila nueva y las anteriores se conservan

#### Scenario: Fecha de vigencia no interviene
- **WHEN** existen dos filas `bcv` y la más reciente por `updated_at` tiene una `effective_date` anterior a la de la otra
- **THEN** la tasa actual sigue siendo la más reciente por `updated_at`

### Requirement: Daily exchange-rate cron
La ruta `GET /api/cron/exchange-rate` (programada en `vercel.json` a las `0 10 * * *` UTC) SHALL exigir `Authorization: Bearer ${CRON_SECRET}` (401 si no coincide), SHALL requerir `COTIZAVE_API_KEY` (500 si falta), SHALL consultar `https://api.cotizave.com/v1/fx/rates` con cabecera `X-API-Key`, y SHALL insertar de forma independiente, con `source = 'cron'` y solo si son números > 0: la tasa `bcv` (mercado `reference`), la `eur` (mercado `eur_reference`) y la `binance` (mercado `binance`), todas con el campo `mid`. Para `bcv` y `eur` SHALL guardar `effective_date` y `source_updated_at` tomados de la respuesta (`effective_date` y `updated_at` del mercado); si `effective_date` falta o no tiene el formato `YYYY-MM-DD`, la tasa SHALL insertarse igualmente con `effective_date` nula y el aviso SHALL reportarse sin marcar `success: false`. Para `binance`, que no trae fecha de vigencia, `effective_date` SHALL ser nula y `source_updated_at` el `updated_at` del mercado si existe. La respuesta SHALL incluir por tipo el resultado y la `effective_date` guardada.

#### Scenario: Sin autorización
- **WHEN** falta o es incorrecto el Bearer
- **THEN** responde 401 y no inserta nada

#### Scenario: Falla el proveedor
- **WHEN** cotizave responde no-OK o la llamada lanza excepción
- **THEN** responde 502 con `success: false`

#### Scenario: Un mercado ausente
- **WHEN** falta el mercado `binance` en la respuesta
- **THEN** se insertan `bcv` y `eur`, `binance` se reporta `skipped` y `success` es `false`

#### Scenario: Guarda la fecha de vigencia
- **WHEN** el mercado `reference` llega con `effective_date` `2026-10-13` y `updated_at` de la fuente
- **THEN** la fila `bcv` se guarda con `effective_date = 2026-10-13` y `source_updated_at` de la fuente

#### Scenario: Corrida en fin de semana
- **WHEN** el cron corre un sábado y la API devuelve `bcv` con `effective_date` del viernes
- **THEN** se inserta una fila nueva con `effective_date` del viernes y su `updated_at` del sábado

#### Scenario: Fecha de vigencia inválida
- **WHEN** el mercado `reference` llega sin `effective_date` o con un formato inválido
- **THEN** `bcv` se inserta con `effective_date` nula, se reporta un aviso y `success` no cambia por ese motivo

### Requirement: Rate history and display hint
`getExchangeRateHistory(monthsBack = 12)` SHALL devolver las tasas de los últimos `monthsBack` meses, incluyendo `effective_date` y `source_updated_at`, ordenadas descendentemente. La tabla de filas del reporte Tasa de Cambio SHALL mostrar `effective_date` en una columna "Vigencia" ordenable, en formato `YYYY-MM-DD` sin conversión de zona horaria (con "—" si es nula), junto a la fecha/hora de inserción. `referenceUsdAmount` SHALL calcular solo una pista de equivalente en USD para Bs/USDT (nulo si no hay tasa fresca o el monto no es positivo) sin guardarse.

#### Scenario: Pista en formulario
- **WHEN** el residente o admin ingresa un monto en Bs con tasa fresca a la fecha elegida
- **THEN** se muestra el equivalente `amount / rate` en USD, sin persistirlo

#### Scenario: Columna Vigencia en el reporte
- **WHEN** el admin abre el reporte y hay una fila `bcv` insertada un sábado con `effective_date` del viernes
- **THEN** la fila muestra la fecha del viernes en Vigencia y la fecha/hora del sábado en la columna de inserción, sin desfase de un día

#### Scenario: Fila sin fecha de vigencia
- **WHEN** la fila es `binance`, una tasa manual o una anterior a este change
- **THEN** la columna Vigencia muestra "—" y al ordenar por Vigencia esas filas quedan agrupadas (al inicio en orden ascendente y al final en descendente)

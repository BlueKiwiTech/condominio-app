# Spec Delta

## Purpose
Reglas comunes para interpretar, validar y acotar un monto escrito por el usuario en cualquier formulario, sin alterarlo en silencio.

## ADDED Requirements

### Requirement: Amounts are read in the es-VE format or rejected
Un monto escrito en un campo de monto de la aplicación SHALL leerse con el punto como separador de miles y la coma como decimal (`1.234,56`); un punto seguido de 1 o 2 dígitos SHALL leerse como decimal (`1234.5`) y un punto seguido de exactamente 3 dígitos, como miles (`1.234` es 1234). Lo que no se pueda leer sin ambigüedad (letras, signos `-` o `+`, exponentes, más de una coma, `1,000.50`) SHALL rechazarse con un mensaje y NO enviarse, en lugar de corregirse en silencio.

#### Scenario: Miles y decimales
- **WHEN** el usuario escribe `1.000,50` en un monto
- **THEN** el campo conserva el texto y el monto es 1000,50

#### Scenario: Negativo o exponente
- **WHEN** el usuario escribe `-5` o `1e9`
- **THEN** el campo muestra el mensaje de monto inválido y el formulario no puede enviarse

#### Scenario: Separadores ambiguos
- **WHEN** el usuario escribe `1,000.50` o `1.2.3`
- **THEN** se rechaza con el mensaje y no se interpreta de ninguna manera

#### Scenario: Campo vacío
- **WHEN** el campo está vacío
- **THEN** no hay monto todavía y no se muestra ningún error

#### Scenario: Lectura visible
- **WHEN** el usuario escribe un monto con puntos o comas, como `1.500`
- **THEN** el campo muestra "Se leerá como 1.500,00" mientras escribe

#### Scenario: Campos numéricos nativos
- **WHEN** un formulario usa un campo numérico del navegador (cuotas, concepto de gasto, diálogo de pago de un gasto)
- **THEN** el navegador y las reglas del servidor de abajo son su única validación (por ejemplo `1.234` allí es 1,234 y el servidor lo rechaza por decimales)

### Requirement: Amount limits enforced on the server
Todo monto tecleado SHALL validarse en el servidor: mayor que cero (cero solo en un abono financiado por saldo a favor), como máximo 999.999.999.999 y como máximo 2 decimales. Un monto fuera de esos límites SHALL rechazarse con un mensaje propio (monto demasiado grande, máximo 2 decimales, mayor que cero) y no escribir nada. La tasa de cambio SHALL acotarse a un máximo de 1.000.000.

#### Scenario: Monto demasiado grande
- **WHEN** se envía un monto de 99999999999999
- **THEN** se rechaza con "El monto es demasiado grande." y no se escribe nada

#### Scenario: Más de dos decimales
- **WHEN** se envía `0,004` o `10,005` como monto
- **THEN** se rechaza con "El monto admite como máximo 2 decimales." y no se redondea

#### Scenario: Tasa fuera de rango
- **WHEN** el admin guarda una tasa de cambio de 99999999999999
- **THEN** se rechaza con un mensaje de rango y la tasa no cambia

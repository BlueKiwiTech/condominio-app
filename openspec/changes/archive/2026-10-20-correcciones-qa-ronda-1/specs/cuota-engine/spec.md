# Spec Delta

## MODIFIED Requirements

### Requirement: Template deletion guard
Eliminar una plantilla SHALL ser rechazado si existe cualquier pago contra alguna de sus cuotas, sin importar cuántas cuotas haya generado (cientos de cuotas SHALL comprobarse igual), y SHALL responder con un mensaje claro de que la cuota ya tiene pagos, nunca con un error genérico.

#### Scenario: Plantilla con pagos
- **WHEN** el admin intenta eliminar una plantilla con al menos un pago registrado
- **THEN** la operación falla con el error `hasPayments` y no se elimina nada

#### Scenario: Plantilla grande sin pagos
- **WHEN** el admin elimina una plantilla con 300 cuotas generadas y ningún pago
- **THEN** se eliminan la plantilla y sus cuotas sin error

## ADDED Requirements

### Requirement: Cuota field limits
El nombre de una cuota SHALL tener como máximo 120 caracteres y su descripción 500, y su monto SHALL cumplir las reglas de `entrada-de-montos` (máximo 2 decimales y un tope). Un valor fuera de los límites SHALL rechazarse con un mensaje por campo.

#### Scenario: Nombre demasiado largo
- **WHEN** el admin crea una cuota con un nombre de 130 caracteres
- **THEN** se rechaza con un mensaje de longitud y no se crea

#### Scenario: Monto con tres decimales
- **WHEN** el admin crea una cuota de 1,234
- **THEN** se rechaza con "máximo 2 decimales"

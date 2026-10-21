# Spec Delta

## ADDED Requirements

### Requirement: Expense field limits and payment dialog validity
El nombre y el proveedor de un concepto de gasto SHALL tener como máximo 120 caracteres y las notas 500; los montos SHALL cumplir las reglas de `entrada-de-montos` y la tasa personalizada SHALL tener un máximo de 1.000.000. El diálogo de pago SHALL deshabilitar la confirmación mientras el monto no sea mayor que cero y SHALL limpiar el error anterior al cambiar la moneda, la tasa, la fecha o el monto.

#### Scenario: Monto cero o negativo
- **WHEN** el admin escribe `0` o `-5` como monto final del pago
- **THEN** la confirmación está deshabilitada

#### Scenario: Error que se limpia
- **WHEN** el diálogo mostraba un error y el admin cambia la moneda de pago
- **THEN** el error anterior desaparece

#### Scenario: Proveedor demasiado largo
- **WHEN** el admin guarda un concepto con un proveedor de 130 caracteres
- **THEN** se rechaza con un mensaje de longitud

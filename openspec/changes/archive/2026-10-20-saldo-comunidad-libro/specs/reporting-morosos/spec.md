# Spec Delta

## MODIFIED Requirements

### Requirement: Community balance card on the admin dashboard
El dashboard del admin SHALL mostrar una tarjeta "Saldo de la comunidad" con el balance guardado por moneda (capacidad `saldo-comunidad`), sin sumar monedas, que puede ser negativo, y SHALL NOT mostrarse al residente ni reutilizar la etiqueta "saldo disponible" del portal del residente.

#### Scenario: Saldo por moneda
- **WHEN** el balance guardado es 390 USD y 88.000 Bs
- **THEN** la tarjeta muestra 390 USD y 88.000 Bs como importes separados

#### Scenario: Sin movimientos
- **WHEN** el libro no tiene movimientos
- **THEN** la tarjeta muestra el texto de vacío en lugar de importes

#### Scenario: Saldo negativo
- **WHEN** el balance guardado de una moneda es negativo
- **THEN** la tarjeta muestra el importe negativo de esa moneda

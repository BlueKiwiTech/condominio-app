## ADDED Requirements

### Requirement: Community balance card on the admin dashboard
El dashboard del admin SHALL mostrar una tarjeta "Saldo de la comunidad" con el saldo por moneda (cobrado menos gastos pagados, según el cálculo de `gastos`), sin sumar monedas, que puede ser negativo, y SHALL NOT mostrarse al residente ni reutilizar la etiqueta "saldo disponible" del portal del residente.

#### Scenario: Saldo por moneda
- **WHEN** hay 500 USD cobrados, 110 USD gastados y 88.000 Bs cobrados
- **THEN** la tarjeta muestra 390 USD y 88.000 Bs como importes separados

#### Scenario: Sin movimientos
- **WHEN** no hay cobros ni gastos pagados
- **THEN** la tarjeta muestra el texto de vacío en lugar de importes

#### Scenario: Saldo negativo
- **WHEN** los gastos pagados en una moneda superan lo cobrado en esa moneda
- **THEN** la tarjeta muestra el importe negativo de esa moneda

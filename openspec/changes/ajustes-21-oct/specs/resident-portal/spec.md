# Spec Delta

## MODIFIED Requirements

### Requirement: Community balance view
`/mi-comunidad` (página de aterrizaje) SHALL mostrar dos tarjetas comunitarias por moneda: "saldo disponible" (el saldo guardado de la comunidad por moneda, el mismo del admin, solo lectura y sin movimientos) y "saldo pendiente" (`outstandingByCurrency` sobre todas las cuotas de la comunidad con vencimiento hasta fin del mes actual); sin desglose por casa. El saludo SHALL usar `owner_name` o, si no existe, el número/nombre de casa.

#### Scenario: Sin saldos
- **WHEN** no hay saldo guardado ni deuda en el alcance
- **THEN** cada tarjeta muestra el texto de vacío en lugar de importes

#### Scenario: Saldo disponible del libro
- **WHEN** el saldo guardado de la comunidad es 500 USD y 88.000 Bs
- **THEN** "saldo disponible" muestra 500 USD y 88.000 Bs, aunque los créditos de las casas sumen otra cifra

#### Scenario: Sin libro para el residente
- **WHEN** el residente abre su portal
- **THEN** no ve movimientos del libro, solo el saldo por moneda

### Requirement: Reference USD hint
Al reportar un pago en Bs o USDT, el formulario SHALL mostrar una equivalencia de referencia en USD usando la tasa BCV (Bs) o Binance (USDT) vigente a la fecha del pago, y SHALL ocultarla si la tasa no existe o tiene más de 24 horas (`isRateFresh`). Al elegir Bs SHALL mostrar además el valor de la tasa BCV (Bs por USD) y su fecha, y un texto que indique que es solo referencia. Estos valores son solo informativos y MUST NOT almacenarse.

#### Scenario: Tasa vencida
- **WHEN** la última tasa tiene más de 24 horas respecto a la fecha de referencia
- **THEN** no se muestra equivalencia en USD ni la tasa

#### Scenario: Bs con tasa vigente
- **WHEN** el residente elige Bs y hay una tasa BCV fresca a la fecha del pago
- **THEN** ve la tasa (Bs por USD), su fecha y el aviso de que es solo referencia, junto a la equivalencia en USD

#### Scenario: USDT
- **WHEN** el residente elige USDT
- **THEN** ve la equivalencia como hasta ahora, sin el bloque de tasa BCV ni su aviso

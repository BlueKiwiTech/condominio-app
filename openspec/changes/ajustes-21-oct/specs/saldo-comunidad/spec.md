# Spec Delta

## REMOVED Requirements

### Requirement: Opening balance per currency
**Reason**: El admin deja de registrar un saldo inicial; el saldo de partida se carga con un ajuste manual con motivo.
**Migration**: Usar "Ajuste" con motivo. Los movimientos `opening` ya existentes permanecen en el libro y se siguen mostrando.

## MODIFIED Requirements

### Requirement: Community balance screen for admins
Una pantalla del admin, enlazada en una sección propia **Comunidad** del menú (no bajo Gastos), SHALL mostrar el saldo por moneda y el libro de movimientos paginado, del más reciente al más antiguo, con tipo, moneda, monto, referencia, nota, autor y fecha, y SHALL ofrecer solo el formulario de ajuste (sin saldo inicial). El libro SHALL ser visible solo para los admins de la comunidad. El residente SHALL NOT tener acceso a la pantalla ni al libro; solo ve el saldo por moneda en su portal (capacidad `resident-portal`).

#### Scenario: Libro paginado
- **WHEN** el libro tiene más movimientos que una página
- **THEN** el admin recorre las páginas sin que se trunque el listado

#### Scenario: Acceso del residente
- **WHEN** un residente intenta abrir la pantalla del admin o leer el libro
- **THEN** no tiene acceso

#### Scenario: Otra comunidad
- **WHEN** un admin consulta balance o libro
- **THEN** solo ve los de su propia comunidad

#### Scenario: Sección del menú
- **WHEN** el admin mira el menú lateral
- **THEN** "Saldo de la comunidad" aparece en la sección "Comunidad" y no en "Gastos"

#### Scenario: Página fuera de rango
- **WHEN** el admin abre el libro con una página que no existe
- **THEN** ve la primera página, sin error

#### Scenario: Sin botón de saldo inicial
- **WHEN** el admin abre la pantalla del saldo de la comunidad
- **THEN** solo ve la acción "Ajuste" y ninguna acción de saldo inicial

#### Scenario: Movimiento de apertura histórico
- **WHEN** el libro contiene un movimiento `opening` registrado antes de este cambio
- **THEN** se sigue mostrando con su tipo, monto, autor y fecha

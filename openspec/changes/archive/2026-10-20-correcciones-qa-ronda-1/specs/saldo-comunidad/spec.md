# Spec Delta

## MODIFIED Requirements

### Requirement: Community balance screen for admins
Una pantalla del admin, enlazada en una sección propia **Comunidad** del menú (no bajo Gastos), SHALL mostrar el saldo por moneda y el libro de movimientos paginado, del más reciente al más antiguo, con tipo, moneda, monto, referencia, nota, autor y fecha, y SHALL ofrecer los formularios de saldo inicial y de ajuste. El balance y el libro SHALL ser visibles solo para los admins de la comunidad y SHALL NOT mostrarse al residente.

#### Scenario: Libro paginado
- **WHEN** el libro tiene más movimientos que una página
- **THEN** el admin recorre las páginas sin que se trunque el listado

#### Scenario: Acceso del residente
- **WHEN** un residente intenta abrir la pantalla o leer el balance
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

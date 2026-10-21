# Spec Delta

## ADDED Requirements

### Requirement: House field limits
El número de casa SHALL tener como máximo 20 caracteres; el nombre y el propietario, 100; y un teléfono (el principal y los adicionales) SHALL contener solo números, espacios, `+`, `-`, `.` y paréntesis, entre 6 y 25 caracteres. Un valor fuera de esos límites SHALL rechazarse con un mensaje por campo y no guardarse.

#### Scenario: Número de casa demasiado largo
- **WHEN** el admin crea una casa con un número de 60 caracteres
- **THEN** se rechaza con un mensaje de longitud

#### Scenario: Teléfono con letras
- **WHEN** el admin guarda un teléfono `abc<script>`
- **THEN** se rechaza con "El teléfono no es válido"

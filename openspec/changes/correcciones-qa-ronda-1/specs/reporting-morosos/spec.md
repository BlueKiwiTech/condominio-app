# Spec Delta

## ADDED Requirements

### Requirement: Calendar days display as the same day on every screen
Una fecha de calendario guardada como `date` (`YYYY-MM-DD`) SHALL mostrarse como ese mismo día en todas las pantallas (recibos, historial, libro, panel, portal del residente), sin desfase por la zona horaria del navegador ni del servidor. Una marca de tiempo con hora SHALL seguir mostrándose en hora local.

#### Scenario: Mismo día en todas partes
- **WHEN** se registra un abono con fecha 20/10/2026 y el navegador está en UTC−5
- **THEN** el recibo, el historial de abonos y el libro muestran 20/10/2026

#### Scenario: Marca de tiempo
- **WHEN** se muestra la fecha y hora de actualización de una tasa
- **THEN** se muestra en la hora local del navegador

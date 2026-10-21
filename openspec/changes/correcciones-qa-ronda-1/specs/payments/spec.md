# Spec Delta

## MODIFIED Requirements

### Requirement: Ledger-first non-transactional write order
`applyPaymentAllocation` SHALL guardar las filas de `condo_payments`, el movimiento `payment_in`, la actualización de `condo_installments` (`amount_paid`, `status`) y el saldo a favor en **una sola transacción de base de datos**, y escribir el audit log después. Si algo falla, no queda nada guardado a medias.

#### Scenario: Fallo posterior
- **WHEN** falla la escritura de una cuota o del crédito del abono
- **THEN** la acción devuelve error y no queda ninguna fila de `condo_payments`, movimiento, cuota ni crédito modificado

### Requirement: Admin rejects a payment report
`rejectPaymentReport` SHALL requerir admin y un reporte `pending` u `on_hold`, exigir un `rejection_reason` de 3 a 500 caracteres, fijar `status = 'rejected'` con ese motivo y escribir el audit `payment_report.reject`. El rechazo SHALL NOT crear ni modificar filas de pagos, cuotas o crédito. Si el reporte ya no está en espera de revisión SHALL responder que ya fue procesado.

#### Scenario: Rechazo con motivo
- **WHEN** el admin rechaza con un motivo
- **THEN** el residente ve el motivo en Mi Cartera

#### Scenario: Rechazo de un reporte en espera
- **WHEN** el admin rechaza un reporte `on_hold`
- **THEN** pasa a `rejected` y la liberación posterior ya no lo procesa

#### Scenario: Reporte ya confirmado
- **WHEN** el admin intenta rechazar un reporte `confirmed`
- **THEN** la acción responde que el reporte ya fue procesado y no cambia el reporte

#### Scenario: Rechazo sin motivo
- **WHEN** el motivo está vacío o tiene menos de 3 caracteres
- **THEN** la acción lo rechaza, el botón de confirmar el rechazo está deshabilitado y el reporte no cambia

## ADDED Requirements

### Requirement: Concurrent payments to the same house
Los abonos a la misma casa SHALL serializarse: la operación atómica SHALL comprobar que las cuotas a actualizar y el saldo a favor sigan exactamente como los leyó la evaluación y, si cambiaron, SHALL no escribir nada y devolver un conflicto; la aplicación SHALL reevaluar con el estado nuevo y reintentar (hasta 4 veces). Un abono SHALL NOT perder saldo a favor ni pagar dos veces la misma cuota, y si no se logra tras los reintentos SHALL responder que no se registró nada.

#### Scenario: Dos depósitos simultáneos
- **WHEN** se envían a la vez dos abonos de 3 USD a una casa sin cuotas
- **THEN** el saldo a favor sube exactamente 6, hay dos recibos y la comunidad sube 6

#### Scenario: Dos abonos para la misma cuota
- **WHEN** se envían a la vez dos abonos de 70 USD a una casa con una cuota de 100 USD y 30 de saldo a favor
- **THEN** la cuota se paga una sola vez y el saldo a favor queda en 70

#### Scenario: Selección elegida a propósito
- **WHEN** el admin marcó una cuota especial y otro abono la pagó primero
- **THEN** el segundo se rechaza como cuota ya pagada y no se aplica a otra cuota

### Requirement: Payment dates cannot be in the future
La fecha de un abono, registrado por el admin o reportado por el residente, SHALL NOT ser posterior al día de hoy en Caracas (`America/Caracas`). El servidor SHALL rechazarla con un mensaje y el selector del formulario del admin SHALL no permitir días futuros.

#### Scenario: Fecha futura
- **WHEN** se envía un abono con fecha de mañana
- **THEN** se rechaza con "La fecha del abono no puede ser futura." y no se registra

#### Scenario: Cerca de la medianoche
- **WHEN** son las 21:00 en Caracas y el servidor (en UTC) ya está en el día siguiente
- **THEN** la fecha de hoy en Caracas se acepta

### Requirement: Payment form blocks what cannot be applied and labels cuotas in their own currency
El formulario de abono SHALL deshabilitar el envío cuando el monto es 0 y el saldo a favor no alcanza a pagar ninguna cuota, SHALL mostrar cada cuota del resumen en la moneda de la cuota (no en la del pago), SHALL NOT mostrar "la casa queda al día" sin un monto que lo logre y SHALL iniciar en USD cuando la casa no tiene cuotas.

#### Scenario: Monto cero sin nada que aplicar
- **WHEN** el monto es 0 y la casa no tiene saldo a favor suficiente
- **THEN** el botón de enviar está deshabilitado

#### Scenario: Cuota en otra moneda
- **WHEN** se paga en Bs una cuota de 100 USD
- **THEN** el resumen muestra la cuota como "100,00 $ Efectivo"

#### Scenario: Monto vacío
- **WHEN** el monto está vacío
- **THEN** no aparece el aviso de que la casa queda al día

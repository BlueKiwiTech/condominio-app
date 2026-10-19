## MODIFIED Requirements

### Requirement: Wallet and reported payments ledger
`/mi-cartera` SHALL mostrar el saldo a favor de la casa y el total de reportes `pending` y `on_hold` por moneda, y una lista de reportes de la casa (`pending`, `on_hold`, `confirmed`, `rejected`) filtrable por mes/año de `payment_date`. Si el último reporte creado está `rejected` SHALL mostrar un aviso con el motivo. Un reporte confirmado con `resulting_payment_batch_id` SHALL enlazar a `/mi-cartera/<batchId>`.

#### Scenario: Reporte rechazado
- **WHEN** el último reporte está `rejected` con `rejection_reason`
- **THEN** se muestra el aviso destructivo con el motivo

#### Scenario: Recarga de saldo confirmada
- **WHEN** un reporte `confirmed` no tiene cuotas etiquetadas y tiene `resulting_receipt_number`
- **THEN** se muestra como "crédito agregado" con `#NNNN` y sin enlace al detalle si no hay lote

#### Scenario: Reporte en espera de tasa
- **WHEN** el residente tiene un reporte `on_hold`
- **THEN** la lista lo muestra con la etiqueta "En espera de tasa", cuenta en el total de reportes pendientes de su moneda y su deuda sigue visible

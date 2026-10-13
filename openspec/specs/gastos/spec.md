# gastos Specification

## Purpose
Registrar los gastos del condominio (salientes): fijos recurrentes y variables finitos, marcarlos como pagados y mostrar los pendientes del mes en el dashboard. La gestión (crear, pagar, eliminar) es solo de admin; los residentes ven únicamente el resumen comunitario de solo lectura (ver `resident-portal`).

## Requirements

### Requirement: Template/instance model
Los gastos SHALL modelarse como plantilla comunitaria (`condo_expense_templates`, sin `house_id`) e instancias (`condo_expenses`) con `UNIQUE(template_id, period_date)`.

#### Scenario: Instancia desnormaliza datos
- **WHEN** se genera una instancia
- **THEN** copia `category_id`, `provider` y `currency` de la plantilla, de modo que renombrar la categoría después no reescribe el historial

### Requirement: Fixed expenses use the rolling horizon
Una plantilla `kind = 'fixed'` (cadencia obligatoria, `installment_count` nulo) SHALL generar instancias inmediatamente al crearse y luego por el cron diario `/api/cron/generate-expenses`, usando el mismo `computeHorizonEnd` que cuotas.

#### Scenario: Gasto fijo recién creado
- **WHEN** el admin crea un gasto fijo
- **THEN** se generan de inmediato las instancias hasta el horizonte, cada una con `amount = default_amount` y `status = 'pending'`

#### Scenario: Idempotencia del cron
- **WHEN** el cron corre dos veces el mismo día
- **THEN** no se duplican instancias

### Requirement: Variable expenses are finite
Una plantilla `kind = 'variable'` SHALL generar las `installment_count` instancias en la creación, con fechas escalonadas, repartiendo `default_amount` (total) con `splitAmount` en centavos enteros y absorbiendo el resto en la última. No SHALL intervenir el cron.

#### Scenario: Suma exacta
- **WHEN** se crea un gasto variable de 100.00 en 3 cuotas
- **THEN** la suma de las 3 instancias es exactamente 100.00

### Requirement: Mark as paid
Marcar un gasto como pagado SHALL permitir ajustar `amount`, fijar `paid_date` y notas, y cambiar `status` a `paid`; SHALL rechazar un gasto ya pagado y SHALL registrar un audit log `expense.mark_paid`. Los estados son solo `pending` y `paid` (sin mora ni pagos parciales).

#### Scenario: Gasto ya pagado
- **WHEN** el admin intenta pagar un gasto con `status = 'paid'`
- **THEN** la acción devuelve el error `alreadyPaid`

### Requirement: Soft delete
Eliminar un gasto o plantilla SHALL poner `deleted_at` y nunca borrar la fila; todas las lecturas (listado, cron, dashboard) SHALL filtrar `deleted_at IS NULL`. Un gasto pagado SHALL NOT poder eliminarse; una plantilla con cualquier instancia pagada SHALL NOT poder eliminarse.

#### Scenario: Eliminar gasto pagado
- **WHEN** el admin intenta eliminar un gasto pagado
- **THEN** falla con `cannotDeletePaid`

#### Scenario: Eliminar plantilla sin pagos
- **WHEN** el admin elimina una plantilla sin instancias pagadas
- **THEN** la plantilla y sus instancias `pending` quedan con `deleted_at`

### Requirement: Activate and deactivate
Desactivar una plantilla SHALL marcar `active = false` y anular (soft delete) sus instancias `pending`; las pagadas SHALL permanecer.

#### Scenario: Desactivar plantilla fija
- **WHEN** el admin desactiva una plantilla fija
- **THEN** el cron deja de generarle instancias y sus pendientes desaparecen de las vistas

### Requirement: Expense categories
El sistema SHALL ofrecer categorías por comunidad con alta y baja desde la UI. El nombre SHALL ser único (error `duplicateName`) y una categoría en uso SHALL NOT poder eliminarse (error `inUse`, violación de FK).

#### Scenario: Categoría en uso
- **WHEN** el admin elimina una categoría referenciada por plantillas
- **THEN** falla con el error `inUse`

### Requirement: Dashboard pending expenses
El dashboard SHALL mostrar "Gastos pendientes del mes": suma de `amount` de instancias `pending` cuyo `period_date` cae en el mes actual, agrupada por moneda.

#### Scenario: Monedas mixtas
- **WHEN** hay gastos pendientes en USD y Bs
- **THEN** se muestran totales separados por moneda, nunca sumados

### Requirement: Admin-only management
Las tablas de gastos SHALL tener RLS solo para admins de la comunidad, y toda acción de escritura SHALL exigir `requireAdmin`. La visibilidad del residente SHALL limitarse a lecturas de solo lectura vía el cliente service-role del portal.

#### Scenario: Escritura desde residente
- **WHEN** una sesión de residente intenta crear, pagar o eliminar un gasto
- **THEN** la operación es rechazada (no existe acción ni política que lo permita)

## Known Limitations

- Los residentes SÍ ven el total y desglose de gastos de la comunidad en `/mi-comunidad` y `/mi-hogar` (lectura service-role, sin filtrar por `community_id`). Esto contradice el diseño original ("residentes nunca ven gastos"); pendiente confirmar si es intencional.

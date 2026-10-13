# cuota-engine Specification

## Purpose
Define cómo se generan las cuotas (instancias por casa) a partir de plantillas, incluyendo el modelo recurrente abierto con horizonte rodante, el modelo finito (especiales y recurrentes legacy), y el ciclo de vida de una plantilla.

## Requirements

### Requirement: Template/instance split
El sistema SHALL representar cada cuota como una plantilla (`condo_installment_templates`) y una instancia por casa y por número de cuota (`condo_installments`).

#### Scenario: Una plantilla aplica a varias casas
- **WHEN** una plantilla tiene N casas en `applicable_houses`
- **THEN** cada periodo generado produce N filas, una por casa, con el mismo `installment_number`

### Requirement: Open-ended recurring model
Una plantilla `recurring` creada con `number_of_installments = NULL` SHALL generar cuotas a través de un horizonte rodante, sin cantidad de cuotas ingresada por el admin.

#### Scenario: Generación inmediata al crear
- **WHEN** el admin crea una plantilla recurrente abierta
- **THEN** se generan de inmediato las cuotas desde `start_date` hasta `computeHorizonEnd(hoy)`

#### Scenario: Extensión diaria por cron
- **WHEN** corre `/api/cron/generate-cuotas` (diario, 06:00)
- **THEN** cada plantilla `recurring` con `number_of_installments IS NULL` y `active = true` se extiende hasta el horizonte calculado con la fecha de esa corrida

### Requirement: Horizon formula
El horizonte SHALL calcularse como `max(31 de dic del año calendario de hoy, hoy + 6 meses)`, reevaluado en cada ejecución.

#### Scenario: Creada en enero
- **WHEN** hoy es enero
- **THEN** el horizonte es el 31 de diciembre del mismo año

#### Scenario: Creada en octubre
- **WHEN** hoy es octubre
- **THEN** el horizonte es hoy + 6 meses (posterior al 31 de diciembre)

### Requirement: Due-date stepping
Para `monthly`, `quarterly` y `annual`, la siguiente fecha SHALL avanzar con `addMonths` (1, 3 y 12) conservando el día de `start_date`; para `weekly` y `biweekly` SHALL avanzar 7 y 14 días. No se fuerza el día 1.

#### Scenario: Día 31 en mes corto
- **WHEN** la fecha previa es 31 de enero y la cadencia es mensual
- **THEN** la siguiente es 28 (o 29) de febrero (clamp de date-fns) y no se corrige en meses posteriores

### Requirement: Idempotent and transactional generation
La generación SHALL insertar todas las filas de un top-up en un único upsert con `onConflict: template_id,house_id,installment_number` e `ignoreDuplicates`, y SHALL tener un tope `MAX_PERIODS_PER_TEMPLATE = 400`.

#### Scenario: Doble ejecución del cron el mismo día
- **WHEN** el cron se ejecuta dos veces
- **THEN** no se crean filas duplicadas

#### Scenario: Cadencia que no avanza
- **WHEN** una plantilla tiene datos malformados que impiden avanzar la fecha
- **THEN** el bucle se detiene al llegar a 400 periodos

### Requirement: Single source of generation math
Cada dominio SHALL tener una única función de top-up por plantilla, invocada solo desde la acción de creación y desde el cron. La vista previa del formulario SHALL usar las mismas funciones de fechas que el servidor.

#### Scenario: Preview coincide con lo insertado
- **WHEN** el admin ve la vista previa de una plantilla recurrente nueva
- **THEN** las fechas mostradas coinciden con las filas que se insertan al guardar

### Requirement: Legacy and special isolation
Las plantillas `special` (únicas o divididas) y las `recurring` con `number_of_installments` real SHALL NOT ser tocadas por el cron ni por el top-up del horizonte.

#### Scenario: Plantilla recurrente legacy
- **WHEN** corre el cron
- **THEN** el conteo de cuotas de una plantilla con `number_of_installments` real no cambia

### Requirement: Credit sweep on new installments
Al generar cuotas nuevas, el sistema SHALL aplicar automáticamente el saldo a favor de la casa (misma moneda) a las cuotas recién creadas.

#### Scenario: Casa con saldo a favor
- **WHEN** se generan cuotas nuevas para una casa con saldo a favor en esa moneda
- **THEN** el saldo se aplica a las nuevas cuotas con la nota "Aplicado automáticamente desde saldo a favor."

### Requirement: Activate and deactivate templates
Desactivar una plantilla SHALL marcar `active = false` y anular (soft delete con `deleted_at`) sus cuotas `pending`; las cuotas parciales o pagadas SHALL permanecer. Las cuotas anuladas SHALL seguir ocupando su `installment_number` y `due_date` para el punto de reanudación.

#### Scenario: Desactivar
- **WHEN** el admin desactiva una plantilla abierta
- **THEN** el cron deja de generar cuotas para ella y sus cuotas `pending` desaparecen de las vistas de admin y residente

#### Scenario: Reactivar
- **WHEN** el admin reactiva la plantilla
- **THEN** la generación continúa desde la última cuota generada (incluidas las anuladas), sin duplicar números

### Requirement: Template deletion guard
Eliminar una plantilla SHALL ser rechazado si existe cualquier pago contra alguna de sus cuotas.

#### Scenario: Plantilla con pagos
- **WHEN** el admin intenta eliminar una plantilla con al menos un pago registrado
- **THEN** la operación falla con el error `hasPayments` y no se elimina nada

### Requirement: Cron authentication
El endpoint del cron SHALL responder 401 si el header `Authorization` no es `Bearer ${CRON_SECRET}`, y SHALL aislar errores por plantilla.

#### Scenario: Sin credenciales
- **WHEN** se invoca el cron sin el bearer correcto
- **THEN** la respuesta es 401

#### Scenario: Una plantilla falla
- **WHEN** el top-up de una plantilla lanza error
- **THEN** las demás plantillas se siguen procesando

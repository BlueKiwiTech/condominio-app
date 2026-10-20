# Tasks

## 1. Migración de base de datos

- [x] 1.1 Crear `supabase/migrations/20261020000000_payment_explicit_installments.sql` que agregue `explicit_installments boolean not null default false` a `condo_payment_reports` (`add column if not exists`). Sin backfill ni cambios de RLS o índices. Verificar: releer que usa el prefijo `condo_`, que es re-ejecutable y que no toca filas existentes; aplicarla con `supabase db reset` en el stack local sin errores; la migración NO se aplica en producción desde aquí.
- [x] 1.2 Migración lista para que el usuario la aplique: entregar el nombre del archivo y recordar que va antes de desplegar el código. Verificar: el timestamp es posterior a `20261019000000_held_transactions.sql`.

## 2. Motor y validación

- [x] 2.1 En `lib/payments/applyAllocation.ts` agregar `explicit_installments` (por defecto falso) a `ApplyAllocationParams` y hacer que `evaluatePaymentAllocation` omita `filterEligibleForConversionWindow` cuando es verdadero, repartiendo entre exactamente los ids recibidos (más antigua a más nueva, full-or-nothing). Verificar: `npx tsc --noEmit` sin errores y, con la bandera falsa, el reparto es idéntico al de antes.
- [x] 2.2 Crear `lib/payments/specialSelection.ts` con la validación de la selección (consulta las cuotas con `condo_installment_templates!inner(installment_type)` y exige que pertenezcan a la casa, estén `pending` o `partial`, no estén borradas y sean `special`). Verificar con un script desechable contra el Supabase local: acepta especiales pendientes de la casa; rechaza una de otra casa, una recurrente, una pagada y una borrada.
- [x] 2.3 Ampliar `registerPaymentSchema` en `lib/validation/payments.ts` con `selected_special_ids` (arreglo de uuids, vacío por defecto) y agregar el mensaje de selección inválida en `validation.payments` de `messages/es.json` y `messages/en.json`. Verificar: `tsc` sin errores y el esquema acepta el campo ausente, vacío y con uuids, y rechaza valores que no son uuid.

## 3. Acciones

- [x] 3.1 En `registerPayment` (`lib/actions/payments.ts`): con selección, validarla con el helper (error sin escribir si es inválida) y llamar a `applyPaymentAllocation` con solo `selected_special_ids` y `explicit_installments: true`; sin selección, comportamiento actual. Si el pago queda en espera, guardar el reporte `on_hold` con `installment_ids` = las elegidas y `explicit_installments` en verdadero (falso sin selección). Verificar: con selección el abono paga solo las elegidas aunque venzan a más de 30 días y el sobrante va a saldo a favor; sin selección queda igual que antes; una selección inválida no escribe nada; en espera guarda la bandera.
- [x] 3.2 En `lib/payments/releaseHeld.ts` leer `explicit_installments` del reporte y pasarla a `evaluatePaymentAllocation` y `applyPaymentAllocation`; los reportes de residente (bandera falsa) no cambian. Verificar: un pago del admin en espera con selección explícita y una cuota a 45 días se aplica solo a esa cuota al llegar la tasa; uno sin selección conserva la ventana.

## 4. Interfaz

- [x] 4.1 En `app/[locale]/(admin)/pagos/nuevo/page.tsx` traer el tipo de la plantilla de cada cuota (`condo_installment_templates(installment_type)`) y mapear `is_special` en `PendingInstallment` (`components/payments/types.ts`). Verificar: `tsc` sin errores y las cuotas de plantillas especiales llegan con `is_special = true`.
- [x] 4.2 En `components/payments/PaymentFormClient.tsx` listar las cuotas especiales pendientes de la casa elegida (nombre, vencimiento, saldo, moneda) con casillas (`Checkbox`) y el texto de aviso, usar la selección como conjunto elegible de la vista previa (sin ventana) y enviar `selected_special_ids` a `registerPayment`; vaciar la selección al cambiar de casa. Textos en `messages/es.json` y `messages/en.json`, y UI con shadcn sobre Base UI según `design-system/asobarcelona/MASTER.md`. Verificar: una casa sin especiales no muestra la lista; marcar una cambia la vista previa a solo esa; cambiar de casa vacía la selección.

## 5. Cierre y verificación

- [x] 5.1 Con el Supabase local y la migración aplicada (`scripts/e2e/setup-local-supabase.sh`, `NODE_ENV=test npm run dev`), probar de punta a punta: una casa con una cuota recurrente vencida y dos especiales (una a 45 días); abono a una especial lejana (se paga y la recurrente queda intacta), abono con fondos para una de dos especiales (sobrante a saldo a favor), abono sin selección (como antes), abono en Bs a una especial en USD con tasa fresca, una selección manipulada (cuota de otra casa o recurrente rechazada), y un pago en espera con selección que se libera al llegar la tasa. Anotar el resultado.
- [x] 5.2 Ejecutar `npm run build` y `npx eslint .`. Verificar: ambos terminan sin errores nuevos respecto de los 4 errores previos de `eslint` en archivos no tocados (`use-mobile.ts`, `SplitAmounts.tsx`, `CuotaFormClient.tsx`, `GastoFormClient.tsx`).
- [ ] 5.3 Ejecutar el agente `spec-auditor` sobre `payments` y resolver las discrepancias que reporte. Verificar: informe sin discrepancias nuevas.

## Workflow follow-up

- Aplicar la migración del punto 1 en Supabase antes de desplegar el código.
- Revisar el diff con el agente `adversarial-reviewer` antes de fusionar.
- Archivar con `/opsx:archive` una vez verificado el flujo.

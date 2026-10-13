## Resumen
<!-- Qué cambia y por qué, en 2–4 líneas. Enfócate en el motivo, no en listar archivos. -->

## Change de OpenSpec
<!-- `openspec/changes/<id>` o "N/A: sin cambio de comportamiento" (refactor, copy, estilos). -->

## Specs afectados
<!-- Capacidades de openspec/specs/ cuyo comportamiento cambia (cuota-engine, payments, ...) o "ninguno". -->

## Cambios principales
-

## Base de datos / migraciones
<!-- Archivos nuevos en supabase/migrations/ o "N/A". Las migraciones las aplica el usuario: indica si deben aplicarse ANTES o DESPUÉS del deploy. -->

## Riesgos y revisión sugerida
<!-- Marca lo que aplica y explica en una línea. -->
- [ ] Monedas: no se suman USD/Bs/USDT
- [ ] Aislamiento: RLS por `community_id` / filtro por `house_id`
- [ ] Idempotencia / reintentos (pagos, crons, generación)
- [ ] Fechas (días calendario, UTC-4)
- [ ] Textos nuevos en `messages/es.json` y `messages/en.json`

## Verificación
- [ ] `npm run build`
- [ ] `npx eslint .`
- [ ] Prueba manual: <!-- qué flujo probaste y con qué datos -->

## Fuera de alcance
<!-- Lo que se decidió NO hacer en este PR (o "N/A"). -->

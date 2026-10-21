# Reporte QA · ASOBARCELONA

<!--
  FORMATO DEL REPORTE (el script qa/report-to-html.mjs lo convierte a HTML, así que respeta esta estructura):
  - Copia este archivo, sustituye lo que está entre {{llaves}}, repite los bloques indicados y borra los comentarios.
  - Los títulos "##" van exactamente como aquí. Cada hallazgo es un "###" con la forma:  ### H-01 · título corto — Severidad
    (Severidad: Crítico, Alto, Medio, Bajo o Duda; separada del título por " — ").
  - Estado de un escenario: PASÓ, FALLÓ u OMITIDO.  Las tablas llevan la fila de guiones |---|.
  - Capturas (opcional): ![descripción](captura-01.png) con el archivo en la misma carpeta del reporte.
-->

- **Fecha:** {{AAAA-MM-DD}}
- **Agente / modelo:** {{nombre}}
- **Entorno:** http://localhost:3000 (Supabase local)
- **Alcance:** {{escenarios ejecutados y los que se omitieron, con el motivo}}

## Veredicto

{{1-2 frases honestas: qué tan sana se ve la aplicación y qué es lo más urgente.}}

| Severidad | Cantidad |
|---|---|
| Crítico | {{n}} |
| Alto | {{n}} |
| Medio | {{n}} |
| Bajo | {{n}} |
| Duda | {{n}} |

## Resultado por escenario

<!-- Una fila por escenario 00-08. -->

| Escenario | Estado | Pasos OK | Hallazgos | Nota |
|---|---|---|---|---|
| {{02 · Abonos del admin}} | PASÓ | {{7 de 7}} | — | |

## Hallazgos

<!-- REPETIR este bloque por hallazgo, del más grave al menos grave. Sin hallazgos: escribe "Sin hallazgos en el alcance probado." -->

### H-01 · {{título corto}} — {{Alto}}

- **Escenario:** {{04 · Gastos y saldo, paso 3}}
- **Se repite:** {{siempre / a veces / una sola vez}}
- **Pasos:**
  1. {{paso 1}}
  2. {{paso 2}}
- **Esperado:** {{lo que debía pasar, según 00-reglas-del-sistema}}
- **Real:** {{lo que pasó: texto exacto del mensaje, montos antes y después}}
- **Evidencia:** {{capturas, URLs, montos}}
- **Comentarios del agente:** {{causa probable (formulario, validación, cálculo, permisos), impacto en el usuario y en el dinero, y sugerencia de arreglo o de prueba para confirmarlo. Separa lo que VISTE de lo que SUPONES ("supongo que…").}}

## Verificación del saldo de la comunidad

Invariante: el saldo de cada moneda es igual a la suma del libro de esa moneda.

| Moneda | Saldo mostrado | Suma del libro | ¿Coincide? |
|---|---|---|---|
| $ Efectivo | {{0,00}} | {{0,00}} | Sí |
| Bs. | {{0,00}} | {{0,00}} | Sí |
| Binance (USDT) | {{0,00}} | {{0,00}} | Sí |

## Dudas y observaciones

- {{Algo que no está claro si es fallo o comportamiento esperado, y por qué.}}

## Qué no se probó

{{Escenarios o ideas que quedaron fuera por falta de tiempo o de acceso.}}

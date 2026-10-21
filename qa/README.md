# Pruebas exploratorias con un agente (`qa/`)

Esta carpeta es un **paquete de pruebas para un agente con navegador** (Grok, Claude u otro): sigue escenarios escritos como instrucciones, busca casos borde e intenta romper la aplicación, y entrega un reporte. Es **complementaria** a la suite automática de Playwright (`e2e/`, `npm run test:e2e`), que sirve para regresiones deterministas; esta sirve para explorar.

Todo corre **en local**: Supabase en Docker + la app en `http://localhost:3000`. Nunca toca el proyecto real.

## Contenido

| Archivo | Para qué |
|---|---|
| `AGENT.md` | El prompt maestro: reglas, cuentas, datos sembrados y cómo trabajar |
| `scenarios/` | Escenarios con pasos, resultado esperado y "Intenta romperlo" |
| `REPORT_TEMPLATE.html` | Plantilla del reporte en HTML (un archivo autocontenido: resumen, resultado por escenario, hallazgos con comentarios y verificación del saldo) |
| `REPORT_TEMPLATE.md` | Versión en texto plano de la misma plantilla, por si el agente no puede producir HTML |
| `reports/` | Reportes guardados (el contenido no se versiona) |
| `start.sh` / `seed.mjs` | Reinicia el Supabase local, siembra datos y arranca la app |

## Paso 1: levantar el entorno (lo haces tú, una vez por sesión de pruebas)

Requisitos: Docker Desktop abierto y la CLI de Supabase.

```bash
bash qa/start.sh            # reinicia la base local, siembra los datos y deja la app en http://localhost:3000
# o, para arrancar la app tú:
bash qa/start.sh --no-app && NODE_ENV=test npm run dev
```

`start.sh` **borra y recrea la base local** cada vez (así cada corrida parte del mismo estado) y aborta si `.env.test.local` no apunta a `127.0.0.1`. Para repetir las pruebas desde cero, vuelve a correrlo.

## Paso 2: darle el paquete al agente

Depende de lo que pueda hacer tu agente:

- **Solo navegador (sin archivos ni terminal):** abre `qa/AGENT.md` y pégalo como instrucción inicial; luego pega, uno por mensaje, los archivos de `qa/scenarios/` (o dile "ejecuta el escenario 02" pegándolo). El agente trabaja en `http://localhost:3000` y te entrega el reporte en el chat.
- **Con acceso a archivos del repositorio:** dile: *"Lee `qa/AGENT.md` y ejecuta las pruebas de `qa/scenarios/`. Guarda el reporte en `qa/reports/`."* No necesita terminal si ya levantaste el entorno.
- **Con terminal:** además puede correr `bash qa/start.sh` él mismo (necesita Docker y la CLI de Supabase en esa máquina).

Un agente en la nube **no puede abrir tu `localhost`**: el navegador del agente debe correr en tu máquina (o expón la app con un túnel de solo lectura de tu confianza, nunca el proyecto real).

## Paso 3: revisar el reporte

Al terminar, el agente entrega un **HTML** (`qa/reports/AAAA-MM-DD-agente.html` o un bloque de código que guardas como `.html`): ábrelo con doble clic. Trae el veredicto, el resultado de cada escenario y, por cada fallo, pasos, esperado, real y **comentarios del agente** (causa probable, impacto y sugerencia).

1. Reproduce a mano los hallazgos Críticos y Altos antes de darlos por buenos: un agente puede equivocarse o malinterpretar.
2. Los fallos reales entran al flujo normal del proyecto: se arreglan con un change de OpenSpec si cambian comportamiento (`/opsx:propose`), o con una rama de corrección.
3. Si un escenario falla por datos que el seed no creó o por una regla que cambió, actualiza el escenario o `seed.mjs`.

## Mantenimiento

- Cuando un change cambie una regla del sistema, actualiza `scenarios/00-reglas-del-sistema.md` y el escenario afectado.
- Si añades datos al seed, actualiza la tabla de "Datos sembrados" en `AGENT.md`.
- Las credenciales de `AGENT.md` son **solo del entorno local descartable** (las crea `scripts/e2e/setup-local-supabase.sh`); no pongas nunca credenciales reales aquí.

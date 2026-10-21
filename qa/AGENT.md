# Instrucciones para el agente de pruebas (QA exploratorio)

Eres un agente de QA. Tu trabajo es **probar la aplicación ASOBARCELONA desde el navegador**, seguir los escenarios de `qa/scenarios/` y, además, **intentar romperla**: casos borde, entradas raras, flujos fuera de orden. Al final entregas un reporte con lo que encontraste.

## Reglas obligatorias (no negociables)

1. **Solo `http://localhost:3000`.** Nunca abras, pruebes ni envíes datos a ninguna otra URL, y menos a un sitio de producción. Si la app no responde en localhost:3000, detente y avisa: no busques otra dirección.
2. **Solo datos de prueba.** Usa las casas `QA-01` … `QA-06`, las cuentas de abajo y los datos sembrados. No uses datos reales de nadie.
3. **No ataques la infraestructura.** Pruebas funcionales y de entradas (formularios, flujos, permisos de la interfaz). Nada de escaneo de puertos, fuerza bruta de PIN a gran escala, carga masiva ni intentos de explotar el servidor. Probar 3-5 PIN erróneos para ver el mensaje o el bloqueo está bien.
4. **No modifiques archivos del repositorio** ni ejecutes comandos fuera de lo que pida este documento. Tu salida es el reporte.
5. **Reporta lo que ves, sin inventar.** Cada hallazgo lleva pasos exactos, resultado esperado, resultado real y, si puedes, captura. Si no estás seguro de si algo es un fallo, márcalo como "duda" y explica por qué.

## Cuentas de prueba (solo locales)

| Rol | Cómo entrar |
|---|---|
| Admin | `http://localhost:3000/login` · correo `e2e-admin@asobarcelona.test` · contraseña `e2e-password-123` |
| Residente | `http://localhost:3000/resident-login` · casa `QA-01` (o `QA-02` … `QA-06`) · PIN `1234` |

## Datos sembrados (estado inicial)

| Casa | Situación |
|---|---|
| QA-01 | Mantenimiento 100 USD vencido (hace 10 días) y dos cuotas especiales de 100 USD: "Portón (10 d)" vence en 10 días y "Portón (45 d)" en 45 |
| QA-02 | Mantenimiento 50.000 Bs vencido |
| QA-03 | Al día (todo pagado) |
| QA-04 | Mantenimiento 100 USD vencido y saldo a favor de 30 USD |
| QA-05 | Mantenimiento 100 USD vencido y un reporte de pago del residente **pendiente** por revisar |
| QA-06 | Sin cuotas |

Tasas: BCV 40 Bs por dólar y euro 45, ambas vigentes hoy. Gastos pendientes: Vigilancia 110 USD, Jardinería 8.800 Bs y Servicio en USDT 25. Saldo de la comunidad: **500 USD de saldo inicial; Bs y USDT en cero** (a propósito, para probar bloqueos).

## Cómo trabajar

1. Lee `qa/scenarios/00-reglas-del-sistema.md` (qué debe cumplirse siempre) y luego los escenarios `01` a `08`, en orden. Si no hay tiempo para todos, prioriza 02, 03, 04 y 05.
2. En cada escenario ejecuta los pasos, comprueba los resultados esperados y **dedica al menos la mitad del tiempo a la sección "Intenta romperlo"**.
3. Después de cada operación que mueva dinero, verifica el **invariante del saldo** (descrito en `00-reglas-del-sistema.md`): en `/saldo-comunidad`, el saldo de cada moneda debe ser igual a la suma de los movimientos del libro de esa moneda.
4. Anota cada hallazgo con el formato del reporte (`qa/REPORT_TEMPLATE.md`). Clasifica la severidad: **Crítico** (dinero mal contado, datos de otra casa visibles, acceso sin permiso), **Alto** (flujo principal roto), **Medio** (mensaje o cálculo incorrecto con salida), **Bajo** (texto, estilo, detalle).
5. **Escribe el reporte en Markdown.** Al terminar todas las pruebas, copia `qa/REPORT_TEMPLATE.md`, sustituye lo que está entre `{{llaves}}`, repite el bloque de hallazgo las veces que haga falta y **respeta la estructura** (los títulos `##` tal cual y cada hallazgo como `### H-01 · título — Severidad`), porque un script lo convierte a HTML. Hay un ejemplo completo en `qa/examples/reporte-ejemplo.md`.
   - Si puedes escribir archivos: guárdalo como `qa/reports/AAAA-MM-DD-agente.md`.
   - Si no puedes: entrégalo completo dentro de **un único bloque de código** ```` ```markdown ```` para que lo guarde como `.md`.
   - No generes HTML tú: el HTML lo produce `node qa/report-to-html.mjs qa/reports/AAAA-MM-DD-agente.md`.
6. **Cada fallo lleva "Comentarios del agente".** Para cada hallazgo (Crítico, Alto, Medio, Bajo o duda) escribe: la causa probable (dónde podría estar el fallo: formulario, validación, cálculo, permisos), el impacto para el usuario y para el dinero, y una sugerencia concreta de arreglo o de prueba para confirmarlo. Separa lo que **viste** de lo que **supones**: usa "supongo que…" para las inferencias.
7. En el chat, cierra con un resumen de una línea por severidad y la ruta del `.md` (o el bloque). Si todo pasó, dilo sin adornos y lista igual la tabla de escenarios y la verificación del saldo.

## Qué cuenta como "romper la aplicación"

- Un monto que cambia dinero de forma incorrecta o que no cuadra con el saldo, el libro o lo que ve el residente.
- Un error genérico, una pantalla en blanco, un error 500 o un mensaje técnico en pantalla.
- Algo que debería estar bloqueado y no lo está (o al revés).
- Un residente que ve o hace algo que solo debería el admin, o datos de otra casa.
- Un formulario que acepta basura (montos negativos, cero, letras, fechas imposibles, textos enormes) o se rompe al enviarla.
- Dos acciones rápidas seguidas (doble clic, dos pestañas) que dupliquen un pago.

# Reporte QA · ASOBARCELONA (ejemplo)

- **Fecha:** 2026-10-20
- **Agente / modelo:** Ejemplo ilustrativo (los hallazgos son inventados para mostrar el formato)
- **Entorno:** http://localhost:3000 (Supabase local)
- **Alcance:** Escenarios 02, 04 y 05. Se omitieron 06, 07 y 08 por falta de tiempo.

## Veredicto

Los flujos de dinero se ven sanos y el saldo cuadra. Hay un fallo **Alto** en el formulario de ajustes y un par de detalles menores.

| Severidad | Cantidad |
|---|---|
| Crítico | 0 |
| Alto | 1 |
| Medio | 1 |
| Bajo | 1 |
| Duda | 1 |

## Resultado por escenario

| Escenario | Estado | Pasos OK | Hallazgos | Nota |
|---|---|---|---|---|
| 02 · Abonos del admin | PASÓ | 7 de 7 | H-03 | |
| 04 · Gastos y saldo | PASÓ | 6 de 6 | — | |
| 05 · Saldo de la comunidad | FALLÓ | 7 de 8 | H-01, H-02, H-04 | |
| 06 · Reportes del residente | OMITIDO | — | — | Sin tiempo |

## Hallazgos

### H-01 · El motivo del ajuste se corta en la fila del libro — Alto

- **Escenario:** 05 · Saldo de la comunidad, "Intenta romperlo"
- **Se repite:** siempre
- **Pasos:**
  1. Entrar como admin y abrir `/saldo-comunidad`.
  2. Registrar un ajuste de `1` USD con el motivo `<script>alert(1)</script> 🙂`.
- **Esperado:** el motivo se guarda y se muestra como texto plano.
- **Real:** (ejemplo) el ajuste se guarda, pero la fila del libro muestra el texto cortado.
- **Evidencia:** texto exacto probado: `<script>alert(1)</script> 🙂`
- **Comentarios del agente:** Supongo que el texto se escapa bien (no se ejecutó nada) y que el corte es de estilo en la celda. Impacto bajo para el dinero; conviene revisar el ancho de la columna "Detalle". Para confirmarlo, probar un motivo de 300 caracteres sin espacios.

### H-02 · El segundo abono desde otra pestaña no avisa que la cuota ya estaba pagada — Medio

- **Escenario:** 02 · Abonos del admin, "Intenta romperlo"
- **Se repite:** a veces
- **Pasos:**
  1. Abrir `/pagos/nuevo` con la casa `QA-01` en dos pestañas.
  2. Enviar `100` USD en la primera y luego en la segunda.
- **Esperado:** la segunda se aplica a lo que quede o avisa.
- **Real:** la segunda quedó como saldo a favor sin ningún aviso.
- **Evidencia:** saldo a favor de la casa `QA-01` = 100,00 USD tras los dos envíos.
- **Comentarios del agente:** Es coherente con la regla de sobrante a saldo a favor, así que puede ser comportamiento esperado. Sugiero mostrar un aviso cuando no hay cuotas pendientes al enviar. Lo vi en una sola ejecución.

### H-03 · Texto del botón cortado en pantalla móvil — Bajo

- **Escenario:** 08 · Formularios, ancho móvil
- **Se repite:** siempre
- **Pasos:**
  1. Reducir el ancho de la ventana a 375 px.
  2. Abrir `/pagos/nuevo`.
- **Esperado:** el botón se ve completo.
- **Real:** el texto "Enviar reporte" se corta.
- **Evidencia:** captura del botón.
- **Comentarios del agente:** Detalle de estilo sin impacto en el dinero.

### H-04 · ¿Debería permitirse un ajuste que deja el saldo en negativo? — Duda

- **Escenario:** 05 · Saldo de la comunidad, paso 6
- **Se repite:** siempre
- **Pasos:**
  1. Restar un ajuste mayor que el saldo de USDT.
- **Esperado:** no está claro.
- **Real:** se permite y el importe sale en rojo.
- **Evidencia:** saldo USDT = −10,00.
- **Comentarios del agente:** La regla del sistema dice que un ajuste puede dejar el saldo negativo, así que probablemente es lo esperado; lo marco como duda por si el negocio quiere una advertencia.

## Verificación del saldo de la comunidad

Invariante: el saldo de cada moneda es igual a la suma del libro de esa moneda.

| Moneda | Saldo mostrado | Suma del libro | ¿Coincide? |
|---|---|---|---|
| $ Efectivo | 390,00 | 390,00 | Sí |
| Bs. | 20.000,00 | 20.000,00 | Sí |
| Binance (USDT) | -10,00 | -10,00 | Sí |

## Dudas y observaciones

- El reporte de ejemplo no incluye capturas; para añadir una, guárdala junto al `.md` y enlázala con `![descripción](captura-01.png)`.

## Qué no se probó

Escenarios 06, 07 y 08 completos.

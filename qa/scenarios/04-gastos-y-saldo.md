# 04 · Pagar gastos y saldo de la comunidad

**Objetivo:** un gasto solo se paga si hay saldo en la moneda de pago, y el saldo siempre cuadra.
**Pantallas:** `/gastos` (botón "Registrar pago" de cada gasto), `/gastos-pagados`, `/saldo-comunidad`, dashboard.
**Estado inicial:** saldo de la comunidad = **500 USD**, 0 Bs, 0 USDT. Gastos pendientes: Vigilancia 110 USD, Jardinería 8.800 Bs, Servicio en USDT 25.

## Pasos
1. Abre "Registrar pago" de **Vigilancia** (110 USD). **Esperado:** el diálogo muestra "Saldo disponible de la comunidad en $ Efectivo: 500,00" y el botón de confirmar está habilitado. Confirma. **Esperado:** el gasto pasa a pagado, el saldo USD baja a 390 y el libro tiene un movimiento "Gasto pagado" de −110.
2. Abre **Jardinería** (8.800 Bs). **Esperado:** el saldo en Bs es 0, el diálogo muestra el aviso de que no alcanza con el faltante (8.800,00) y la confirmación está deshabilitada.
3. En ese mismo gasto cambia la moneda de pago a `$ Efectivo` (aparece el combo de tasa; elige BCV). **Esperado:** se prellena el monto en dólares (8.800 / 40 = 220); como hay 390 USD, se puede pagar. Confirma. **Esperado:** el saldo USD baja 220 (a 170) y el Bs no cambia.
4. Abre **Servicio en USDT** (25 USDT). **Esperado:** saldo USDT 0, bloqueado.
5. Ve a `/saldo-comunidad` y registra un **saldo inicial** de `100` en USDT; vuelve al gasto USDT. **Esperado:** ahora se puede pagar, y el saldo USDT queda en 75.
6. Revisa dashboard y `/saldo-comunidad`. **Esperado:** USD 170, Bs 0, USDT 75, y los tres coinciden con la suma del libro.

## Intenta romperlo
- Cambia el monto final a `0`, `-5`, `abc`, un número gigante, o más de lo que hay de saldo (**esperado:** el diálogo avisa el faltante y bloquea, sin error técnico).
- Saldo justo: deja el saldo USD exactamente igual al gasto (con un ajuste negativo) y paga. **Esperado:** se paga y el saldo queda en 0,00 (no negativo).
- **Dos pestañas:** abre el diálogo del mismo gasto en dos pestañas y confirma en ambas. **Esperado:** se paga una vez; la otra dice que ya está pagado; el saldo baja una sola vez.
- **Carrera de saldo:** con saldo 100 USD y dos gastos de 80 USD, abre ambos diálogos (los dos permiten confirmar) y confirma uno tras otro rápido. **Esperado:** el segundo se rechaza con el mensaje de saldo insuficiente (disponible, necesario y faltan) y el gasto sigue pendiente.
- Doble clic en "Registrar pago". **Esperado:** un solo pago.
- Tasa personalizada: `0`, `-1`, `abc`, `0,00004`, `99999999`. Tasa BCV/euro cuando no hay tasa vigente (cambia la fecha de pago a hace años): **esperado:** queda "en espera de tasa", ya resta del saldo y no puedes pagarlo otra vez ni borrarlo.
- Intenta borrar un gasto pagado o en espera. **Esperado:** no se puede.
- Cambia la moneda de pago de un gasto de USD a Bs y vuelve a USD; revisa que los montos y el aviso del saldo se recalculen.
- Revisa `/gastos-pagados`: monto, moneda de pago, tasa y equivalente deben coincidir con lo que confirmaste.

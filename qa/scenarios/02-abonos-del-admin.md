# 02 · Abonos registrados por el admin

**Objetivo:** el abono se reparte bien, no pierde ni duplica dinero y el saldo de la comunidad lo refleja.
**Pantalla:** `/pagos/nuevo` ("Abonar a cartera"). Antes de empezar, anota el saldo de cada moneda en `/saldo-comunidad`.

## Pasos
1. **Abono exacto.** Casa `QA-01`: "Ingresar manualmente", moneda `$ Efectivo`, monto `100`. **Esperado:** el resumen de la derecha muestra el Mantenimiento como Pagada; al enviar aparece "Abono registrado correctamente" y el recibo; el saldo USD de la comunidad sube 100 y el libro tiene un movimiento "Abono" de +100.
2. **Sobrante a saldo a favor.** Casa `QA-04` (saldo a favor 30 USD, cuota de 100 USD): abona `80` USD. **Esperado:** el saldo a favor (30) se usa primero (30 + 80 = 110): la cuota se paga y quedan 10 de saldo a favor; la comunidad sube **80** (no 110: los 30 ya se habían contado).
3. **Abono en Bs a una cuota en USD.** Casa `QA-01` (la que quede pendiente) o `QA-04`: abona `4000` Bs con la tasa de 40. **Esperado:** equivale a 100 USD y paga la cuota; el saldo **Bs** sube 4.000 y el de USD no cambia.
4. **Cuota en Bs.** Casa `QA-02`: abona `50000` Bs. **Esperado:** paga la cuota, el saldo Bs sube 50.000.
5. **Depósito sin cuotas.** Casa `QA-06`: abona `25` USD. **Esperado:** todo queda como saldo a favor; la comunidad sube 25.
6. **Monto que no alcanza.** Casa `QA-01` con una cuota de 100: abona `60` USD. **Esperado:** no se paga ninguna cuota a medias; los 60 quedan como saldo a favor; la comunidad sube 60.
7. **Casa al día.** Casa `QA-03`: mira qué ofrece el formulario. **Esperado:** avisa que no hay cuotas pendientes.

## Intenta romperlo
- Monto `0`, `-50`, `abc`, `1e9`, `99999999999999`, `0,004`, `0.004`, `10,005`, `1.000,50` (con puntos y comas de distintas formas), vacío, con espacios. **Esperado:** validación clara, nunca un error técnico, nunca dinero mal contado.
- Fecha de abono en el futuro, de hace años (2020), de mañana, `31/02`. Con una fecha antigua en Bs, **esperado:** queda "en espera de tasa" y no mueve el saldo hasta que llegue la tasa.
- **Doble clic rápido** en "Enviar reporte" y también enviar el mismo formulario desde dos pestañas a la vez. **Esperado:** un solo abono (o, si pasan dos, que el saldo y el libro cuadren con los dos recibos).
- Cambiar la casa a mitad del formulario; cambiar la moneda después de escribir el monto; usar el botón "atrás" y reenviar.
- Referencia o notas con 1.000 caracteres, emojis, `<b>x</b>`, saltos de línea.
- Registra abonos seguidos y después **revisa el invariante**: el saldo de cada moneda debe ser igual a la suma del libro.
- Revisa `/pagos` (historial) y el detalle de un recibo: montos, moneda y cuotas deben coincidir con lo que ingresaste.

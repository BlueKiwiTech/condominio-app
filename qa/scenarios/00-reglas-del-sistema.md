# 00 · Reglas del sistema (qué debe cumplirse siempre)

Estas reglas valen en **todos** los escenarios. Cualquier violación es un hallazgo, aunque aparezca en medio de otra prueba.

## Dinero y monedas
- Las monedas son **USD** (`$ Efectivo`), **Bs** (`Bs.`) y **USDT** (`Binance`). **Nunca se suman entre sí**: cada pantalla muestra un importe por moneda. Las únicas conversiones son: un abono en otra moneda a una cuota (con la tasa BCV del día del abono) y el pago de un gasto con Bs en alguno de los dos lados (con la tasa que elige el admin).
- Los montos usan **punto para miles y coma para decimales** (`1.234,56`) y siempre 2 decimales. Al escribir un monto, el campo lo lee así (`1.000,50` es mil con cincuenta; `1234.5` también vale) y **rechaza con un mensaje** lo que no puede leer sin ambigüedad (`-5`, `1e9`, `1,000.50`, letras): nunca debe cambiar el monto en silencio. Un monto admite como máximo 2 decimales y tiene un tope; fuera de eso se rechaza con un mensaje claro.
- Una **fecha de calendario** se ve como el mismo día en todas las pantallas. Un abono no puede tener fecha futura.

## Abonos (pagos de cuotas)
- Un abono se reparte entre las cuotas **de la más antigua a la más nueva**, y una cuota solo se paga **completa o nada** (no hay pagos parciales de una cuota). Lo que sobra queda como **saldo a favor** de la casa, en la moneda del abono.
- Sin selección, un abono solo alcanza las cuotas **vencidas y las que vencen en los próximos 30 días**. Si el admin marca **cuotas especiales**, el abono va **solo a ellas** y se salta esa ventana de 30 días.
- El saldo a favor existente se usa antes de pedir dinero nuevo.
- Para convertir (por ejemplo Bs a una cuota en USD) hace falta una tasa BCV **de menos de 24 horas** respecto de la fecha del abono. Sin tasa, un abono en Bs no se rechaza: queda **"en espera de tasa"** y se aplica solo cuando llegue.
- Un **reporte de pago del residente** no cambia nada hasta que el admin lo **confirma**. Pendiente, en espera o rechazado no mueve ningún saldo.

## Saldo de la comunidad (`/saldo-comunidad`)
- Es por moneda. **Suma:** saldo inicial, abonos aplicados (el dinero que realmente entró, en su moneda, incluido el sobrante a saldo a favor, contado una sola vez) y ajustes positivos. **Resta:** gastos pagados (también los "en espera de tasa") y ajustes negativos.
- **Invariante que debes comprobar siempre:** el saldo de cada moneda es igual a la suma de los montos de esa moneda en el libro de movimientos. La tarjeta "Saldo de la comunidad" del dashboard y el saldo del diálogo de pagar gastos muestran el mismo valor.
- El libro es solo de agregar: **no se edita ni se borra** ningún movimiento.
- Saldo inicial: una sola vez por moneda, monto mayor que cero. Ajuste: monto distinto de cero y **motivo obligatorio**; puede dejar el saldo negativo.
- Solo el admin ve este saldo. **El residente nunca lo ve.**

## Gastos
- Pagar un gasto solo es posible si el saldo de la comunidad **en la moneda con la que se paga** alcanza. Si no, se bloquea y se muestra cuánto hay, cuánto hace falta y cuánto falta. El diálogo avisa antes de enviar y el servidor lo vuelve a comprobar.
- Un gasto se puede pagar en $ o en Bs (los de USDT siempre en USDT). Si alguna de las dos monedas es Bs hay que elegir una tasa: BCV dólar, BCV euro o personalizada. Una tasa BCV/euro sin valor vigente deja el gasto **"en espera"**; la personalizada se aplica al momento.
- Un gasto pagado o en espera no se puede borrar. No se puede pagar dos veces.

## Acceso
- El admin entra con correo y contraseña. El residente entra con casa y PIN de 4 dígitos y **solo ve los datos de su casa**.
- Un residente no puede abrir pantallas de admin y una persona sin sesión no puede abrir ninguna pantalla interna.

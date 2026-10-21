# 05 · Pantalla "Saldo de la comunidad" (saldo inicial, ajustes y libro)

**Objetivo:** el balance y el libro son correctos, solo se agrega, y las reglas de saldo inicial y ajustes se cumplen.
**Pantalla:** `/saldo-comunidad` (menú "Saldo de la comunidad", grupo Gastos).

## Pasos
1. Abre la pantalla. **Esperado:** tres tarjetas (USD, Bs, USDT) con el saldo, y el libro con al menos el "Saldo inicial" de 500 USD (el sembrado figura como "Sistema"; los que registres tú muestran tu correo). El menú lateral la muestra en la sección **Comunidad**.
2. "Registrar saldo inicial": el combo **no** debe ofrecer `$ Efectivo` (ya tiene uno). Registra `20000` en Bs. **Esperado:** el saldo Bs pasa a 20.000 y el libro suma un "Saldo inicial".
3. Intenta registrar otro saldo inicial en Bs. **Esperado:** no es posible (la moneda ya no se ofrece o se rechaza con mensaje).
4. "Registrar ajuste": `20` USD, "Restar del saldo", motivo "Comisión bancaria". **Esperado:** el saldo USD baja 20 y el libro muestra el ajuste con el motivo y tu usuario.
5. Repite sin motivo. **Esperado:** mensaje "El motivo es obligatorio" y no cambia nada.
6. Ajuste que deja el saldo negativo (resta más de lo que hay). **Esperado:** se permite y el importe sale en rojo.
7. Registra 26 ajustes pequeños (por ejemplo `1` USDT con motivos "Lote 1" … "Lote 26"). **Esperado:** el libro muestra 25 por página, del más reciente al más antiguo, con "Página 1 de 2" y botones Anterior / Siguiente que funcionan.
8. Recorre todos los movimientos de una moneda, súmalos con su signo y compara con la tarjeta. **Esperado:** coinciden (invariante).

## Intenta romperlo
- Monto `0`, `-5` (en saldo inicial), `abc`, vacío, `0,004`, `1e12`, `99999999999999`: **esperado:** mensaje de validación claro.
- Motivo de 1 carácter, de 300 y de 301 caracteres, solo espacios, emojis, `<script>alert(1)</script>`: **esperado:** el de 301 se rechaza; el texto se muestra como texto, nunca se ejecuta.
- Doble clic en "Registrar ajuste" y envío desde dos pestañas a la vez. **Esperado:** si se registran dos, el libro muestra dos movimientos y el saldo cambió dos veces exactamente.
- Abre `?page=999`, `?page=0`, `?page=-1`, `?page=abc` en la dirección. **Esperado:** vuelve a una página válida o a la primera, sin error.
- Busca cualquier botón para editar o borrar un movimiento. **Esperado:** no existe.
- Como residente, abre `/saldo-comunidad`. **Esperado:** sin acceso.
- Compara la tarjeta del dashboard, la de esta pantalla y el saldo del diálogo de pagar un gasto: **los tres deben mostrar lo mismo.**

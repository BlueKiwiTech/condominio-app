# 03 · Elegir cuotas especiales al abonar

**Objetivo:** con cuotas especiales marcadas, el abono va solo a ellas, saltándose la ventana de 30 días.
**Casa de prueba:** `QA-01` (Mantenimiento vencido de 100 USD, "Portón (10 d)" de 100 USD que vence en 10 días y "Portón (45 d)" de 100 USD que vence en 45).

## Pasos
1. En `/pagos/nuevo` elige `QA-01`. **Esperado:** aparece la tarjeta "Abonar a cuotas especiales (opcional)" con las dos especiales, con su vencimiento y saldo; **no** aparece el Mantenimiento (es recurrente).
2. Marca solo "Portón (45 d)" y abona `100` USD. **Esperado:** el aviso dice que el abono se aplicará únicamente a las marcadas; el resumen muestra solo esa cuota; al enviar, **Portón (45 d)** queda pagada, el Mantenimiento vencido sigue pendiente y no hay saldo a favor.
3. En una casa nueva o tras reiniciar (`bash qa/start.sh`): marca **las dos** especiales y abona `150` USD. **Esperado:** se paga la más antigua (Portón 10 d); la otra queda pendiente (no se paga a medias); sobran 50 como saldo a favor; el Mantenimiento no se toca.
4. Sin marcar nada, abona `100` USD. **Esperado:** se paga el Mantenimiento vencido y las especiales no se tocan (comportamiento de siempre).
5. Marca una especial y paga en Bs (`4000` Bs con tasa 40). **Esperado:** se convierte y paga la especial.
6. Marca una especial y cambia de casa. **Esperado:** la selección se vacía.
7. `QA-03` y `QA-02` no tienen especiales: **esperado:** la tarjeta no aparece.

## Intenta romperlo
- Marca y desmarca varias veces; marca todas y abona `0`; marca una y abona menos de lo que cuesta (**esperado:** sin pagos parciales, todo a saldo a favor).
- Marca una especial, abre otra pestaña y paga esa misma especial allí; vuelve a la primera y envía. **Esperado:** un mensaje claro (selección inválida o ya pagada), sin error técnico y sin cobrar dos veces.
- Marca una especial con una fecha de abono en el futuro o muy antigua en Bs (sin tasa): **esperado:** queda en espera de tasa y, al llegar la tasa, se aplica **solo a la especial elegida**.
- Revisa que `/saldo-comunidad` suba exactamente lo que entró (incluido el sobrante) y que el invariante cuadre.

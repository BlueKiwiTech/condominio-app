# 07 · Tasas de cambio y pagos "en espera de tasa"

**Objetivo:** sin tasa vigente, los pagos en Bs (y los gastos con tasa BCV/euro) no se rechazan: esperan y se aplican solos al llegar la tasa, sin mover el saldo antes de tiempo.
**Pantallas:** `/pagos/nuevo`, `/pagos-reportados`, `/gastos`, `/reporte/tasa-de-cambio`, `/saldo-comunidad`.

## Pasos
1. Anota el saldo Bs de la comunidad. En `/pagos/nuevo`, casa `QA-01`, moneda `Bs.`, monto `4000`, y pon la **fecha de abono** en una fecha lejana en el pasado (por ejemplo hace 30 días), donde no hay tasa. **Esperado:** no es un error: aparece el aviso de que quedó en espera y te lleva a `/pagos-reportados`.
2. En `/pagos-reportados` mira el reporte. **Esperado:** tiene la insignia "En espera de tasa", no tiene botón "Confirmar" pero sí "Rechazar", y la cuota de `QA-01` sigue pendiente. El saldo Bs de la comunidad **no cambió**.
3. En `/gastos`, paga **Jardinería** (8.800 Bs) con tasa BCV y una fecha de pago lejana en el pasado. **Esperado:** el diálogo avisa que quedará en espera de tasa; al confirmar, el gasto queda "en espera", ya resta del saldo, y no se puede borrar ni pagar otra vez. (Necesita saldo Bs: registra antes un saldo inicial en Bs.)
4. Abre `/reporte/tasa-de-cambio` y registra a mano una tasa BCV con la fecha de esos pagos (o cercana, dentro de 24 horas). **Esperado:** al guardarla, el pago del paso 1 se aplica solo (queda confirmado con recibo, se paga la cuota, el saldo Bs sube) y el gasto del paso 3 pasa a pagado con su tasa.
5. Verifica el invariante del saldo en las tres monedas.

## Intenta romperlo
- Tasa en `0`, negativa, con letras, con muchísimos decimales, para una fecha futura o muy lejana. **Esperado:** validación clara.
- Rechaza un pago en espera antes de que llegue la tasa. **Esperado:** queda rechazado y la tasa que llegue después no lo aplica.
- Dos pagos en espera de la misma casa y llega la tasa: **esperado:** ambos se aplican una vez, de más antiguo a más nuevo, sin duplicados.
- Registra una tasa que no cubre la fecha del pago (más de 24 horas de diferencia). **Esperado:** el pago sigue en espera.
- Gasto en espera con tasa personalizada: **esperado:** nunca queda en espera (se aplica al momento).
- Un pago en USD o un gasto en USD pagado en USD **no** deben quedar nunca en espera.

# 06 · Reportes de pago del residente

**Objetivo:** el residente reporta, el admin confirma o rechaza, y el dinero solo cuenta cuando se confirma.
**Casa de prueba:** `QA-05` (ya tiene un reporte pendiente de 100 USD, referencia `REF-QA-05`) y `QA-02`.

## Pasos
1. Como residente `QA-05` (PIN `1234`) revisa tu estado de cuenta. **Esperado:** se ve el Mantenimiento pendiente y el reporte que enviaste como pendiente de revisión.
2. Como residente `QA-02`, reporta un pago de `50000` Bs con una referencia. (La captura de pantalla es opcional.) **Esperado:** el reporte queda "pendiente"; tu deuda **no** cambia todavía.
3. Como admin, anota el saldo de la comunidad y abre `/pagos-reportados`. **Esperado:** ves los dos reportes pendientes con casa, monto, moneda, fecha y referencia. El saldo de la comunidad **no cambió** por haber reportado.
4. **Rechaza** el reporte de `QA-02`: pide un motivo, escríbelo y confirma. **Esperado:** el reporte queda rechazado; el saldo no cambia; el residente ve el motivo en su portal.
5. **Confirma** el reporte de `QA-05`. **Esperado:** se paga el Mantenimiento de `QA-05`, el saldo USD de la comunidad sube 100, el libro tiene un "Abono" con enlace al recibo, y el residente ve la cuota pagada.
6. Reporta de nuevo como `QA-02` y confirma ese. **Esperado:** el saldo Bs sube lo que se pagó realmente.

## Intenta romperlo
- Como residente: monto `0`, negativo, texto, enorme, fecha futura, referencia de 1.000 caracteres, archivo que no es imagen o de más de 5 MB como captura. **Esperado:** validación clara.
- Doble clic en "Enviar reporte" y envío desde dos pestañas. **Esperado:** no se duplican reportes o, si se duplican, no se pueden confirmar dos veces el mismo dinero.
- Como admin, confirma el mismo reporte en dos pestañas. **Esperado:** se aplica una sola vez.
- Rechazar sin motivo. **Esperado:** pide el motivo.
- Un reporte rechazado: busca si todavía se puede confirmar. **Esperado:** no.
- Revisa que ningún residente vea los reportes de otra casa ni el saldo de la comunidad.

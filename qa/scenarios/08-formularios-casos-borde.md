# 08 · Casos borde en los demás formularios

**Objetivo:** que ningún formulario acepte basura ni se rompa.
**Pantallas:** `/houses` (casas y vecinos), `/cuotas` (crear cuotas), `/gastos/new` y `/gastos/plantillas` (conceptos de gasto).

## Pasos
1. Crea una casa nueva con datos válidos y un PIN de 4 dígitos. **Esperado:** aparece en la lista y el residente puede entrar con ese PIN.
2. Crea una cuota recurrente y una especial (sola y dividida en varias partes) para esa casa. **Esperado:** se generan las cuotas correctas, sin duplicados si repites la acción.
3. Crea un concepto de gasto fijo y uno variable. **Esperado:** se generan los gastos del periodo.
4. Edita y desactiva un concepto de gasto y una plantilla de cuota. **Esperado:** las cuotas o gastos pendientes dejan de mostrarse y lo pagado se conserva.

## Intenta romperlo
- **Casas:** número de casa repetido, vacío, solo espacios, muy largo, con emojis y caracteres raros; nombre o teléfono o correo inválidos (`a@`, `@x.com`); PIN de 3 o 5 dígitos, con letras, `0000`, `1234`; editar el PIN y comprobar que el anterior ya no sirve.
- **Cuotas:** monto `0`, negativo, con 3 decimales, enorme; fecha de inicio imposible; número de partes `0`, `1`, `200`; divisible con montos que no suman el total; nombre de 500 caracteres.
- **Gastos:** montos y fechas absurdas, proveedor vacío o enorme, categorías duplicadas, plantilla fija con periodicidad rara; crear la misma plantilla dos veces seguidas.
- Envía cada formulario con **todos los campos vacíos** y luego con un solo campo lleno. **Esperado:** mensajes por campo, no errores genéricos.
- Doble clic en crear y envío desde dos pestañas: **esperado:** sin duplicados.
- Texto con `<img src=x onerror=alert(1)>` o `'; drop table x; --` en cualquier campo de texto: **esperado:** se guarda y se muestra como texto plano, nunca se ejecuta.
- Cambia el idioma de la interfaz (español/inglés) a mitad de un formulario: **esperado:** no se pierde el estado ni aparecen textos sin traducir ("undefined", claves tipo `gastos.errors.x`).
- Pantalla pequeña (ancho de móvil): **esperado:** nada se sale de la pantalla ni queda inutilizable.

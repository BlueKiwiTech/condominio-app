# 01 · Acceso y permisos

**Objetivo:** comprobar que solo entra quien debe y que cada rol ve solo lo suyo.

## Pasos
1. Sin sesión, abre `/dashboard`, `/pagos/nuevo`, `/gastos`, `/saldo-comunidad` y `/houses`. **Esperado:** te lleva al login, nunca muestra datos.
2. Entra como admin con la contraseña correcta. **Esperado:** llegas al dashboard.
3. Cierra sesión y entra como residente de la casa `QA-01` con PIN `1234`. **Esperado:** llegas a `/mi-comunidad`; el menú es el del residente.
4. Como residente, revisa `/mi-comunidad`, `/mi-hogar` y `/mis-pagos`. **Esperado:** solo ves cuotas y pagos de `QA-01`.
5. Como residente, escribe a mano las direcciones de admin (`/dashboard`, `/saldo-comunidad`, `/pagos/nuevo`, `/gastos`). **Esperado:** no se muestran; te devuelve al login o a tu portal.
6. Como admin, entra otra vez y confirma que ya no ves nada del residente.

## Intenta romperlo
- Contraseña incorrecta, correo con mayúsculas, con espacios al inicio o al final, correo vacío, contraseña vacía, texto enorme (500 caracteres), caracteres como `'`, `"`, `<script>`, `--`. **Esperado:** mensaje de error claro, sin error técnico.
- PIN incorrecto 3 o 4 veces seguidas, PIN de 3 o 5 dígitos, PIN con letras, PIN vacío, casa inexistente. **Esperado:** mensajes claros; si hay bloqueo temporal, debe explicarse. (Solo unos pocos intentos: no hagas fuerza bruta.)
- Entra como residente de `QA-01` y cambia a mano un identificador en la dirección de una pantalla (por ejemplo el id de un recibo de otro lote) para ver si aparece información de otra casa. **Esperado:** nunca datos de otra casa.
- Con dos pestañas: cierra sesión en una y usa un botón de la otra (por ejemplo registrar un abono). **Esperado:** pide iniciar sesión; no registra nada.
- Botón "atrás" del navegador después de cerrar sesión. **Esperado:** no muestra datos sensibles.
- Sesión de residente y de admin en el mismo navegador al mismo tiempo: observa si se mezclan.

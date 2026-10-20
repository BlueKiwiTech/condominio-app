# Spec Delta

## Purpose
Saldo de la comunidad por moneda guardado como balance y libro de movimientos de solo agregar: suma lo recibido por abonos, resta lo pagado en gastos y admite saldo inicial y ajustes manuales del admin.

## ADDED Requirements

### Requirement: Stored community balance per currency
La comunidad SHALL tener un balance guardado por moneda (`USD`, `Bs`, `USDT`), que SHALL cambiar solo al registrar un movimiento y SHALL NOT sumarse ni convertirse entre monedas. Una moneda sin movimientos SHALL tener saldo cero. El saldo puede ser negativo.

#### Scenario: Monedas separadas
- **WHEN** hay movimientos por 500 USD y por 88.000 Bs
- **THEN** el balance muestra 500 USD y 88.000 Bs como importes separados

#### Scenario: Moneda sin movimientos
- **WHEN** nunca hubo movimientos en USDT
- **THEN** el saldo en USDT es cero

### Requirement: Append-only movement ledger
Cada cambio del balance SHALL registrarse como un movimiento con tipo (`opening`, `payment_in`, `expense_out` o `adjustment`), moneda, monto con signo, referencia al pago o gasto cuando exista, autor, nota y fecha. Un movimiento SHALL NOT editarse ni borrarse, y SHALL existir como máximo uno por tipo y referencia, de modo que repetir la misma operación no lo duplique.

#### Scenario: Movimiento sin edición
- **WHEN** el admin consulta el libro
- **THEN** no existe ninguna acción para editar o borrar un movimiento

#### Scenario: Operación repetida
- **WHEN** se intenta registrar dos veces el movimiento del mismo pago o gasto
- **THEN** el libro conserva un solo movimiento y el balance cambia una sola vez

### Requirement: Applied payments add to the balance
Todo abono aplicado (registrado por el admin, reporte de residente confirmado o pago liberado desde espera) SHALL registrar un movimiento `payment_in` por el dinero recibido, en la moneda con que entró, referenciando su lote de pagos. Aplicar saldo a favor ya existente, o el barrido de crédito, SHALL NOT sumar de nuevo. El movimiento y las filas de `condo_payments` SHALL guardarse juntos o no guardarse.

#### Scenario: Abono en la moneda de la cuota
- **WHEN** el admin registra 100 USD contra una cuota de 100 USD
- **THEN** el saldo en USD sube 100

#### Scenario: Abono en otra moneda
- **WHEN** una casa paga 88.000 Bs contra una cuota de 100 USD
- **THEN** el saldo en Bs sube 88.000 y el saldo en USD no cambia

#### Scenario: Sobrante a saldo a favor
- **WHEN** una casa abona 130 USD a una cuota de 100 USD y 30 quedan como saldo a favor
- **THEN** el saldo en USD sube 130 en un solo movimiento

#### Scenario: Consumo de saldo a favor
- **WHEN** el saldo a favor de 30 USD se aplica después a otra cuota, o lo barre una cuota nueva
- **THEN** el saldo de la comunidad no cambia

#### Scenario: Pago liberado desde espera
- **WHEN** llega la tasa y un pago `on_hold` del admin se aplica
- **THEN** el saldo sube en ese momento y no antes

#### Scenario: Reporte del residente sin aprobar
- **WHEN** un reporte del residente está `pending` o `on_hold`, o el admin lo rechaza
- **THEN** el saldo no cambia, y solo sube cuando el admin lo confirma

### Requirement: Paid expenses subtract from the balance
Pagar un gasto SHALL registrar un movimiento `expense_out` por el monto que sale de caja, en la moneda de pago (`paid_currency` y `paid_amount` si difiere de la del gasto; si no, la del gasto), referenciando el gasto, tanto si queda `paid` como `on_hold`. Liberar un gasto en espera SHALL NOT restar de nuevo.

#### Scenario: Gasto en la misma moneda
- **WHEN** se paga un gasto de 110 USD en USD con saldo suficiente
- **THEN** el saldo en USD baja 110

#### Scenario: Gasto pagado en otra moneda
- **WHEN** se paga un gasto de 110 USD con 96.900 Bs
- **THEN** el saldo en Bs baja 96.900 y el saldo en USD no cambia

#### Scenario: Gasto en espera de tasa
- **WHEN** el gasto queda `on_hold` y luego llega la tasa
- **THEN** el saldo bajó al pagarlo y no cambia al liberarlo

### Requirement: Insufficient balance blocks an expense payment atomically
Pagar un gasto SHALL comprobar el saldo de la moneda de pago y actualizar el gasto, restar el movimiento y mover el balance en una sola operación atómica. Si el saldo no alcanza, SHALL rechazarse sin escribir nada e indicar saldo disponible, monto necesario y faltante. Dos pagos simultáneos SHALL NOT poder gastar el mismo saldo.

#### Scenario: Saldo insuficiente
- **WHEN** el saldo en USD es 80 y se intenta pagar un gasto de 110 USD en USD
- **THEN** se devuelve el error con disponible 80, necesario 110 y faltante 30, y el gasto sigue `pending`

#### Scenario: Pagos simultáneos
- **WHEN** el saldo en USD es 100 y dos gastos de 80 USD se pagan casi al mismo tiempo
- **THEN** uno se paga y el otro se rechaza por saldo insuficiente, y el saldo nunca queda negativo por esa vía

#### Scenario: Gasto ya pagado
- **WHEN** el gasto ya no está `pending` al ejecutar la operación
- **THEN** se rechaza como ya pagado y no se registra ningún movimiento

### Requirement: Opening balance per currency
El admin SHALL poder registrar un saldo inicial por moneda, una sola vez por moneda, con monto mayor que cero, como movimiento `opening` con su autor. Registrarlo SHALL sumar al balance sin cambiar los movimientos existentes y SHALL NOT repetirse para la misma moneda.

#### Scenario: Saldo inicial nuevo
- **WHEN** el admin registra un saldo inicial de 1.000 USD y no existía uno en USD
- **THEN** el saldo en USD sube 1.000 y aparece un movimiento `opening` en el libro

#### Scenario: Saldo inicial repetido
- **WHEN** el admin intenta registrar otro saldo inicial en una moneda que ya tiene uno
- **THEN** se rechaza y el balance no cambia

#### Scenario: Monto inválido
- **WHEN** el monto es cero, negativo o no numérico
- **THEN** se rechaza con un mensaje de validación

### Requirement: Manual adjustments with a reason
El admin SHALL poder registrar un ajuste positivo o negativo por moneda, con monto distinto de cero y un motivo obligatorio, como movimiento `adjustment` con su autor. Un ajuste SHALL poder dejar el saldo negativo.

#### Scenario: Ajuste con motivo
- **WHEN** el admin registra un ajuste de -50 USD con el motivo "Gasto pagado fuera del sistema"
- **THEN** el saldo en USD baja 50 y el libro muestra el motivo y el autor

#### Scenario: Ajuste sin motivo
- **WHEN** el admin intenta registrar un ajuste sin motivo
- **THEN** se rechaza con un mensaje de validación y el balance no cambia

#### Scenario: Ajuste en cero
- **WHEN** el monto del ajuste es cero
- **THEN** se rechaza con un mensaje de validación

### Requirement: Community balance screen for admins
Una pantalla del admin SHALL mostrar el saldo por moneda y el libro de movimientos paginado, del más reciente al más antiguo, con tipo, moneda, monto, referencia, nota, autor y fecha, y SHALL ofrecer los formularios de saldo inicial y de ajuste. El balance y el libro SHALL ser visibles solo para los admins de la comunidad y SHALL NOT mostrarse al residente.

#### Scenario: Libro paginado
- **WHEN** el libro tiene más movimientos que una página
- **THEN** el admin recorre las páginas sin que se trunque el listado

#### Scenario: Acceso del residente
- **WHEN** un residente intenta abrir la pantalla o leer el balance
- **THEN** no tiene acceso

#### Scenario: Otra comunidad
- **WHEN** un admin consulta balance o libro
- **THEN** solo ve los de su propia comunidad

### Requirement: Balance writes are restricted and attributed
El balance y el libro SHALL modificarse solo mediante las operaciones de la capacidad, ejecutables únicamente por un admin de la comunidad o por el servicio de liberación de pagos en espera, y SHALL NOT poder escribirse directamente en las tablas ni invocarse sin sesión de admin. Cada movimiento SHALL atribuirse al usuario que ejecuta la operación, nunca a un valor enviado por el cliente, y un lote de pagos SHALL aceptar solo filas de la casa y de cuotas de esa casa.

#### Scenario: Sin sesión de admin
- **WHEN** alguien sin sesión, o un usuario que no es admin, intenta registrar un movimiento o pagar un gasto
- **THEN** la operación se rechaza y el balance no cambia

#### Scenario: Escritura directa
- **WHEN** un admin intenta insertar, editar o borrar movimientos o balances directamente
- **THEN** se rechaza, porque solo se escriben mediante las operaciones

#### Scenario: Autor falsificado
- **WHEN** una petición de abono envía como autor a otro usuario
- **THEN** el movimiento queda atribuido al usuario que la ejecutó

#### Scenario: Filas de otra casa
- **WHEN** un lote de pagos incluye una fila de otra casa o de una cuota ajena
- **THEN** se rechaza completo y no se guarda nada

### Requirement: Balance activation preserves the current balance
Al activar el libro, el balance de cada moneda SHALL arrancar en el valor que producía el cálculo derivado anterior (recibido por abonos y créditos de casas, menos gastos `paid` y `on_hold`), registrado como un movimiento `adjustment` de migración, de modo que el saldo no cambie al desplegar.

#### Scenario: Saldo continuo
- **WHEN** antes de activar el libro el saldo derivado era 390 USD y 88.000 Bs
- **THEN** después de activarlo el balance es 390 USD y 88.000 Bs, con un movimiento de migración por moneda

#### Scenario: Sin historial
- **WHEN** no había cobros ni gastos antes de activar el libro
- **THEN** no se crea ningún movimiento y todos los saldos son cero

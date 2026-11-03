# MultiCaja y Corte X — diseño

Fecha: 2026-11-03 · Estado: borrador para revisión del dueño (sin código todavía)

## 1. Objetivo

Que una tienda pueda tener **varias cajas cobrando al mismo tiempo**, cada una con su computadora, cajón, impresora térmica y escáner, y con **turnos de distintos cajeros** en cada una. Cada caja lleva su propia sesión, fondo y corte. Se agrega el **Corte X**: un cuadre de efectivo sin cerrar la caja, para pasar la caja de un cajero a otro y saber que a quien la entrega no le faltó dinero.

Ejemplo de referencia: 2 turnos × 2 cajeros = 2 cajas abiertas a la vez y 4 sesiones por día, cada una independiente.

Fuera de alcance: varias sucursales (ya existe aparte), horarios de turno definidos por el sistema (los turnos son "de palabra"), inventario por caja.

## 2. Planes

Se agrega `registers` a `PLAN_LIMITS` en `backend/services/plans.catalog.js`:

| Plan | Cajas |
|---|---|
| Básico | 1 (MultiCaja bloqueada: «Pasa a Crecimiento») |
| Crecimiento | 2 |
| Pro | 4 |
| Perpetua | 1 (MultiCaja muestra «Contáctanos») |

El límite se valida en el servidor, no solo en pantalla, con el mismo patrón de `plan-limits.service.js` (`PLAN_LIMIT`).

## 3. Ajustes (solo dueño)

En Ajustes, categoría **Tu tienda**:

- **MultiCaja** (nueva opción): interruptor de activar, cuántas cajas (hasta el límite del plan) y el nombre de cada una.
- **Terminal de cobro** (existente): se agrega el interruptor **Terminal compartida**. Al activarlo sale un aviso: «No se podrán enviar cobros simultáneos: si una caja está cobrando, las demás esperarán». Con el interruptor apagado, cada caja usa su propia terminal vinculada.
- Ambas son configuraciones de administración: las ve y cambia solo el dueño. El servidor valida el rol en cada ruta.

## 4. Caja como entidad

- Nueva colección `registers`: `{ id, tenantId, number, name, terminalId|null, active }`.
- `cashSession` gana `registerId`. Hoy solo se busca por tienda (`GetOpenCashSession(tenantId)`, [cash.controller.js:75](../../../backend/controllers/cash.controller.js)); pasa a buscarse por `(tenantId, registerId)`.
- **Una sesión abierta por caja**, no por tienda. Abrir una caja ya abierta se rechaza con el nombre de quien la tiene.
- Los llamadores de la sesión abierta (`orders.controller`, `credit.service`, `returns.service`, `settings.controller`, `customers.router`, `credit.db`) reciben el `registerId` de la computadora que hace la petición. Ventas, abonos y devoluciones en efectivo se atribuyen a la sesión de **esa** caja.
- **Cada computadora recuerda su caja** (se elige una vez; se guarda en el navegador y el servidor la valida contra la lista de cajas activas).
- Si una PC se daña, el dueño puede **liberar o cerrar** esa caja desde otro equipo.
- Compartido por toda la tienda: inventario, catálogo, clientes y fiado. Por caja: fondo, cajón, impresora, corte.
- **Compatibilidad:** las tiendas actuales quedan con una caja «Caja 1»; las sesiones existentes sin `registerId` se tratan como de Caja 1, sin migración manual.
- **Si el plan baja** (por ejemplo de 4 a 2 cajas), las cajas sobrantes son las de número más alto. Las que tienen una sesión abierta **quedan bloqueadas para vender de inmediato** y piden hacer su corte: la sesión no se cierra sola porque hay que contar el efectivo. Al terminar el corte, la caja se desactiva. Las que no tenían sesión abierta se desactivan al momento. Las ventas siguen normales en las cajas que sí entran en el plan.

## 5. Terminal de cobro

- Hoy hay una terminal por tienda (`registerTerminal(tenantId, terminalId)` en `point.router.js`). Se permite vincular una terminal por caja.
- El candado `terminal_busy` de `assertTerminalFree()` pasa a ser **por terminal** y no por tienda. Con terminal propia, las cajas no se estorban; con la compartida, la segunda caja ve «La terminal está cobrando en otra caja, espera».
- Los cobros no registrados y el aviso de cobros huérfanos se muestran en la caja correspondiente.

## 6. Turnos y límites de tiempo

- Los horarios de turno no existen en el sistema: cada cajero abre y cierra cuando le toca.
- Se mantienen **por sesión de caja** el aviso de 12 h y el tope de 15 h (`cashShift.js`).
- El Corte X **no reinicia ni extiende** las 15 horas.

## 7. Corte X

Opción independiente en Ajustes, visible para cajeros y dueño. El dueño también cuenta como posible cajero: puede entregar, recibir y confirmar una caja igual que cualquier usuario.

1. Quien entrega cuenta el efectivo del cajón. El sistema muestra lo esperado desde el último punto de partida: fondo (o lo contado en el último Corte X) + ventas en efectivo + abonos en efectivo − devoluciones en efectivo, y la diferencia.
2. Elige **de la lista** quién recibe la caja y confirma.
3. Se guarda el Corte X con estado **pendiente de confirmar**: caja, quién entrega, quién recibe, hora, esperado, contado, diferencia.
4. Quien recibe **inicia sesión con su propio usuario** en esa computadora. Al entrar le aparece la notificación: «Recibes la Caja N con $X en efectivo» y debe **confirmar**. Desde ahí las ventas salen a su nombre.
5. Si confirma, el Corte X queda **confirmado**. Si no coincide, puede marcar «No coincide» y capturar lo que cuenta; queda como **en disputa** y se avisa al dueño.
6. Lo contado se vuelve el nuevo punto de partida del siguiente tramo, así un faltante o sobrante se queda con quien lo tuvo y no se arrastra.
7. La caja **no se cierra**: las ventas continúan.
8. El dueño ve los Cortes X en sus estadísticas, con filtros por caja y por cajero, estado (pendiente, confirmado, en disputa) y los faltantes marcados.
9. El **corte final** de la caja suma los tramos y muestra el desglose por cajero y por Corte X.

Datos nuevos: colección `cashCuts` (`{ id, tenantId, registerId, sessionId, fromUser, toUser, countedCash, expectedCash, difference, status, confirmedAt, confirmedCash, createdAt }`).

## 8. Errores y casos límite

- Abrir una caja abierta en otro equipo: error con el nombre de quien la tiene.
- Pendiente sin confirmar: lo ve el receptor al entrar y el dueño en sus estadísticas; la caja puede seguir vendiendo.
- Corte X sin sesión abierta: no se permite.
- Sin conexión: el Corte X requiere servidor (como el corte final de hoy); no se encola.
- Un usuario no puede entregarse la caja a sí mismo.
- Si ya existía una sola caja y MultiCaja está apagada, todo funciona como hoy.

## 9. Pruebas

- Backend (`node:test`): límites por plan; abrir dos cajas a la vez y rechazar una ya abierta; ventas y abonos al corte de la caja correcta; Corte X (cálculo del tramo, pendiente → confirmado, disputa, punto de partida del siguiente tramo); `terminal_busy` por terminal; compatibilidad de sesiones sin `registerId`; permisos de dueño.
- Frontend (vitest): estado de Ajustes por plan, aviso de terminal compartida, notificación de confirmación al iniciar sesión.
- Verificación en pantalla con dos navegadores simulando dos cajas.

## 10. Orden de construcción sugerido

1. Plan `registers` + colección `registers` + sesión por caja (backend), con compatibilidad.
2. Ajustes de MultiCaja y selección de caja por computadora.
3. Terminal por caja y candado por terminal + interruptor de terminal compartida.
4. Corte X (guardado, confirmación al iniciar sesión, estadísticas del dueño).
5. Corte final con desglose por tramo.

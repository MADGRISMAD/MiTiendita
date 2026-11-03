# MultiCaja y Corte X Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Varias cajas cobrando a la vez en una tienda, cada una con su sesión, corte y terminal, más el Corte X (cuadre sin cerrar la caja, con entrega y confirmación entre cajeros).

**Architecture:** La caja se identifica por un número (1–4). Cada computadora manda su número en el encabezado `X-Register`; un middleware lo valida contra el plan y las cajas activas y deja `req.registerId`. Las sesiones de caja, ventas, abonos y devoluciones se resuelven por `(tenantId, registerId)`. El Corte X es una colección nueva (`cash_cuts`) con su servicio, que calcula el tramo y maneja el estado pendiente → confirmado/en disputa.

**Tech Stack:** Node/Express + MongoDB (backend, pruebas `node:test` con base en memoria como `test/helpers/money-harness.js`), Vue 3 + Vite + vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-11-03-multicaja-design.md`

## Global Constraints

- Planes: Básico 1 caja, Crecimiento 2, Pro 4, Perpetua 1. En Perpetua MultiCaja muestra «Contáctanos». El límite se valida en el servidor.
- Roles: `admin` (dueño) y `cashier`. MultiCaja y Terminal compartida: solo `admin` (servidor y pantalla). Corte X: `admin` y `cashier`; el dueño cuenta como cajero.
- Decisión de modelo: `cashSession.registerId` es el **número** de la caja (1–4). Sesiones sin `registerId` = caja 1 (compatibilidad, sin migración).
- Una sesión abierta por caja. Aviso de 12 h y tope de 15 h siguen por sesión (`frontend/src/cashShift.js`); el Corte X no los reinicia.
- Si el plan baja: las cajas con número mayor al límite no venden (`register_over_plan`, 403), pueden hacer su corte y luego dejan de ofrecerse.
- Aviso al activar Terminal compartida, texto exacto: «No se podrán enviar cobros simultáneos: si una caja está cobrando, las demás esperarán».
- Un usuario no puede entregarse la caja a sí mismo. Corte X requiere servidor (no se encola sin conexión).
- Textos en español, mismo estilo del proyecto. Sin commits por mi parte: los hace el dueño; nada se sube a `main`.

## Review Focus

- Dos computadoras abren la misma caja al mismo tiempo → solo una gana (la otra recibe 409 con el nombre de quien la tiene). Test en Task 3.
- Una PC recuerda una caja que el dueño ya desactivó o quedó fuera del plan → el servidor responde `register_unknown` y la pantalla vuelve a pedir la caja. Test en Task 3 y Task 10.
- Corte X con 0 ventas en el tramo o con efectivo contado en 0 → se guarda y la diferencia es −fondo. Test en Task 7.
- Elegir como receptor a sí mismo, a un usuario de otra tienda o inexistente → rechazado. Test en Task 7.
- Venta sincronizada tarde (modo sin conexión) cuando la caja ya cerró → se comporta como hoy (sin sesión, sin `cashSessionId`), no se pega a otra caja. Test en Task 3.

---

## Etapa A — Cajas y sesiones por caja

### Task 1: Límite de cajas por plan

**Files:**
- Modify: `backend/services/plans.catalog.js` (`PLAN_LIMITS`, exports)
- Modify: `backend/services/plan-limits.service.js`
- Test: `backend/test/registers.test.js` (nuevo)

**Interfaces:**
- Produces: `registerLimitOf(planId: string): number` (plans.catalog) → 1/2/4/1, plan desconocido = 1. `assertRegisterCount(planId: string, count: number): void` (plan-limits) lanza el error `PLAN_LIMIT` con `limit: 'registers'`.

- [ ] **Step 1: Escribir pruebas que fallen** — `registerLimitOf('basic')===1`, `('growth')===2`, `('pro')===4`, `('perpetual')===1`, `('x')===1`; `assertRegisterCount('growth', 3)` lanza con `err.payload.code==='PLAN_LIMIT'` y `err.payload.max===2`; `assertRegisterCount('pro', 4)` no lanza.
- [ ] **Step 2: Correr** `node --test backend/test/registers.test.js` → FALLA (funciones no definidas).
- [ ] **Step 3: Implementar** `registers` en `PLAN_LIMITS` (basic 1, growth 2, pro 4, perpetual 1), `registerLimitOf`, y `assertRegisterCount` reutilizando `limitError` con el mensaje «El plan X incluye N caja(s). Pasa a Y para usar más.» (agregar `registers` a `messages`).
- [ ] **Step 4: Correr** la prueba → PASA. Correr `node --test backend/test/tax.test.js` para confirmar que el catálogo sigue cargando.

### Task 2: Colección de cajas y servicio de configuración

**Files:**
- Create: `backend/database/registers.db.js` (patrón de `credit.db.js`)
- Create: `backend/services/registers.service.js`
- Test: `backend/test/registers.test.js`

**Interfaces:**
- Consumes: `registerLimitOf`, `assertRegisterCount` (Task 1).
- Produces:
  - db: `ListRegisters(tenantId): Register[]`, `ReplaceRegisters(tenantId, rows: Register[]): void`. `Register = { number: number, name: string, terminalId: string|null, terminalLabel: string|null, active: boolean }`.
  - service (recibe `store` inyectable como en `credit.service.js`): `listRegisters(store, tenantId, plan): Register[]` — siempre incluye caja 1; filtra `active && number <= registerLimitOf(plan)`. `saveRegisters(store, tenantId, plan, { count: number, names: string[] }): Register[]` — valida `1 ≤ count ≤ límite`, nombres de 1 a 30 caracteres (default «Caja N»), conserva `terminalId` existente. `isOverPlan(register, plan): boolean`.

- [ ] **Step 1: Pruebas que fallen** — tienda sin filas → `listRegisters` devuelve solo «Caja 1»; `saveRegisters(...{count:2})` en plan `basic` lanza `PLAN_LIMIT`; en `growth` crea 2 con nombres por defecto; volver a `count:1` marca la caja 2 `active:false` sin borrar su `terminalId`; con plan `basic` después de bajar de plan, `listRegisters` oculta la caja 2 aunque siga `active`; nombre vacío usa «Caja N».
- [ ] **Step 2: Correr** → FALLA.
- [ ] **Step 3: Implementar** db (colección `registers`, índice único `{tenantId, number}`) y servicio según Interfaces.
- [ ] **Step 4: Correr** → PASA.

### Task 3: Middleware de caja y sesión por caja

**Files:**
- Create: `backend/middleware/register.middleware.js`
- Modify: `backend/database/mongodb.js` (`GetOpenCashSession`, nueva `ListOpenCashSessions`, `CreateCashSession` con índice único parcial)
- Modify: `backend/models/cashSession.model.js` (`normalizeCashSession(body, tenantId, openedBy, registerId)`)
- Modify: `backend/controllers/cash.controller.js`, `backend/controllers/orders.controller.js` (líneas 167, 495, 582), `backend/routers/customers.router.js` (línea 104), `backend/routers/cash.router.js`, `backend/routers/orders.router.js`
- Modify: `backend/test/helpers/money-harness.js` (el fake de sesiones filtra por `registerId`; caja 1 si falta)
- Test: `backend/test/multicaja-sessions.test.js` (nuevo, con el arnés)

**Interfaces:**
- Consumes: `listRegisters` (Task 2).
- Produces: `attachRegister(req, res, next)` — lee `X-Register` (sin encabezado = 1) y `X-Device` (id aleatorio del navegador, queda en `req.deviceId`); si el número no está en `listRegisters(req.tenant.plan)` responde 409 `{code:'register_unknown'}`; si no, `req.registerId = number`. **Candado por navegador:** al abrir una caja la sesión guarda `deviceId`. En las rutas que escriben (abrir, cerrar, vender, anular, devolver, abonos, cobrar con terminal, Corte X), si la sesión abierta de esa caja tiene `deviceId` distinto del `X-Device` recibido, se responde 409 `{code:'register_in_use', openedBy}`. Las lecturas (`GET /cash/session`, `GET /registers`) no se bloquean. Sesiones sin `deviceId` (anteriores a MultiCaja) no se bloquean. Un navegador nuevo o en incógnito tiene otro `X-Device`, así que no puede usar una caja ya abierta; el dueño la libera con `POST /registers/:number/release` (Task 4). `db.GetOpenCashSession(tenantId, registerId = 1): Session|null` (caja 1 también encuentra sesiones sin `registerId`). `db.ListOpenCashSessions(tenantId): Session[]`.

- [ ] **Step 1: Pruebas que fallen** (arnés) — **candado por navegador:** con la caja 1 abierta por `X-Device: A`, una venta, un cierre y un intento de abrir con `X-Device: B` devuelven 409 `register_in_use` con `openedBy`; con `X-Device: A` funcionan; `GET /cash/session` con `B` sí responde; una sesión sin `deviceId` no se bloquea; dos cajas abren a la vez y cada venta cae en el corte de su caja; abrir la caja 1 ya abierta devuelve 409 con `openedBy`; **dos aperturas simultáneas de la misma caja (`Promise.all`) → una 201 y otra 409**; `X-Register: 9` → 409 `register_unknown`; sin encabezado funciona como caja 1 y encuentra una sesión vieja sin `registerId`; venta en caja sin sesión no toma la sesión de otra caja (`cashSessionId` nulo, igual que hoy); abono y devolución en efectivo suman al corte de la caja que los hizo.
- [ ] **Step 2: Correr** `node --test backend/test/multicaja-sessions.test.js` → FALLA.
- [ ] **Step 3: Implementar** el middleware y propagar `req.registerId` a los llamadores listados; el índice único parcial `{tenantId, registerId}` con `status:'open'` va en la sección de índices de `mongodb.js`. `open` guarda `registerId` y responde 409 con `openedBy` si ya existe.
- [ ] **Step 4: Correr** la prueba nueva y `money-flows`, `credit-cash`, `returns`, `sale-audit` → todo PASA.

### Task 4: Rutas de cajas (lista, configuración, liberar)

**Files:**
- Create: `backend/routers/registers.router.js` y `backend/controllers/registers.controller.js`
- Modify: `backend/app.js` (montar `/registers`)
- Test: `backend/test/registers.test.js`

**Interfaces:**
- Consumes: `listRegisters`, `saveRegisters` (Task 2), `ListOpenCashSessions` (Task 3).
- Produces: `GET /registers` (admin, cashier) → `{ plan: string, limit: number, registers: (Register & { openBy: string|null, sessionId: string|null })[] }`. `PUT /registers` (solo admin) body `{ count, names }` → mismo formato. `POST /registers/:number/release` (solo admin) cierra la sesión de esa caja sin corte de efectivo (`status:'closed'`, `closedBy` = admin, `notes:'Liberada por el dueño'`) y lo anota con `CreateActivityLog`.

- [ ] **Step 1: Pruebas que fallen** — cajero recibe 403 en `PUT` y en `release`; admin en `basic` con `count:2` recibe 403 `PLAN_LIMIT`; `GET` marca `openBy` de la caja abierta; `release` de una caja abierta la deja cerrada y se puede volver a abrir.
- [ ] **Step 2: Correr** → FALLA. **Step 3: Implementar. Step 4: Correr** → PASA.

### Task 5: Cajas fuera del plan: bloquear ventas, permitir el corte

**Files:**
- Modify: `backend/middleware/register.middleware.js`, `backend/routers/orders.router.js`, `backend/routers/customers.router.js` (abonos), `backend/routers/point.router.js`
- Test: `backend/test/multicaja-sessions.test.js`

**Interfaces:**
- Consumes: `isOverPlan` (Task 2).
- Produces: `blockOverPlan(req, res, next)` — si `req.registerId > registerLimitOf(plan)` responde 403 `{code:'register_over_plan', message:'Tu plan ya no incluye esta caja. Haz su corte para cerrarla.'}`. `attachRegister` acepta `{ allowOverPlan: true }` y lo usan las rutas de corte (`/cash/session`, `/cash/session/close`).

- [ ] **Step 1: Pruebas que fallen** — con plan bajado de `pro` a `basic`, la caja 3 abierta: crear venta → 403 `register_over_plan`; cobrar con terminal → 403; `close` → 200; después del corte `GET /registers` ya no la lista; la caja 1 sigue vendiendo.
- [ ] **Step 2: Correr** → FALLA. **Step 3: Implementar. Step 4: Correr** → PASA.

## Etapa B — Terminal por caja

### Task 6: Terminal por caja, interruptor compartida y candado por terminal

**Files:**
- Modify: `backend/services/mercadopago.point.service.js` (`registerTerminal`, `preflight`), `backend/services/point.charges.service.js` (`status`, `startCharge`, `assertTerminalFree`), `backend/database/point.db.js` (`ListPointChargesSince` con filtro opcional de terminal), `backend/routers/point.router.js`
- Modify: `backend/services/registers.service.js` (`setRegisterTerminal`)
- Test: `backend/test/point.test.js`

**Interfaces:**
- Consumes: `req.registerId`, `listRegisters`.
- Produces: `resolveTerminal(tenant, register): string|null` — si `tenant.point.sharedTerminal` es verdadero devuelve `tenant.point.terminalId`; si no, `register.terminalId || tenant.point.terminalId` (la caja 1 sigue usando la terminal de siempre). `POST /point/terminal` acepta `{ terminalId, registerNumber? }` (admin). `PUT /point/shared` (admin) body `{ shared: boolean }`. Los cobros guardan `terminalId` y `registerId`. `assertTerminalFree(tenantId, clientSaleId, terminalId)` solo considera pendientes de **esa** terminal. `status(tenantId, registerId)` y `startCharge({ tenantId, clientSaleId, amount, registerId })`.

- [ ] **Step 1: Pruebas que fallen** (en `point.test.js`, mismo estilo) — con terminales propias, un cobro pendiente en la caja 1 **no** bloquea un cobro nuevo en la caja 2; con `shared: true`, el cobro nuevo desde la caja 2 lanza `terminal_busy` mientras la caja 1 tiene uno pendiente; el cobro se envía a la `terminal_id` de su caja; caja sin terminal propia usa la de la tienda; un cajero recibe 403 en `PUT /point/shared`; los cobros huérfanos (`unconsumed`) siguen apareciendo.
- [ ] **Step 2: Correr** `timeout 120 node --test backend/test/point.test.js` → FALLA. **Step 3: Implementar. Step 4: Correr** → PASA (las 25 pruebas existentes incluidas).

## Etapa C — Corte X

### Task 7: Servicio del Corte X

**Files:**
- Create: `backend/services/cash-summary.js` (mueve `summarizeOrders` desde `cash.controller.js` sin cambiar su comportamiento; el controlador lo importa)
- Create: `backend/database/cash-cuts.db.js`, `backend/services/cash-cuts.service.js`
- Test: `backend/test/cash-cuts.test.js` (nuevo)

**Interfaces:**
- Produces (service, con `store` inyectable):
  - `expectedSince(store, { tenantId, session }): Promise<{ baseline: number, since: Date, cash: number, abonosCash: number, refunds: number, expected: number }>` — punto de partida = `countedCash` del último corte X de la sesión (o `openingFloat`); suma efectivo de ventas y abonos creados después del último corte, resta `session.cashRefunds − último.refundsAtCut`.
  - `createCut(store, { tenantId, session, fromUser, toUser, countedCash }): Promise<Cut>` → estado `pending`. `Cut = { id, tenantId, registerId, sessionId, fromUser, toUser, countedCash, expectedCash, difference, refundsAtCut, status: 'pending'|'confirmed'|'disputed', confirmedCash: number|null, confirmedAt: Date|null, createdAt: Date }`.
  - `confirmCut(store, { tenantId, cutId, user, confirmedCash? }): Promise<Cut>` — solo `toUser`; sin `confirmedCash` o igual a lo contado → `confirmed`; distinto → `disputed`.
  - `pendingFor(store, tenantId, username): Promise<Cut[]>`; `listCuts(store, tenantId, { from?, to?, registerId?, user?, status? }): Promise<Cut[]>`.
  - `segmentsOf(orders, cuts): { user: string, cash: number, card: number, total: number, count: number }[]` — ventas agrupadas por `order.user`.

- [ ] **Step 1: Pruebas que fallen** — tramo 1: fondo 500 + ventas en efectivo 300 → `expected` 800, contado 790 → `difference` −10; el tramo 2 arranca en 790 (lo contado); **0 ventas y contado 0 → diferencia −fondo**; `toUser === fromUser` lanza 400; receptor inexistente o de otra tienda lanza 400; solo el receptor puede confirmar (otro usuario → 403); confirmar con otra cifra deja `disputed` y conserva `confirmedCash`; los reembolsos en efectivo posteriores al corte se restan solo en el tramo siguiente; `summarizeOrders` conserva todas las pruebas de `money-flows` y `credit-cash`.
- [ ] **Step 2: Correr** → FALLA. **Step 3: Implementar. Step 4: Correr** las nuevas más `money-flows`, `credit-cash` → PASAN.

### Task 8: Rutas del Corte X y desglose del corte final

**Files:**
- Create: `backend/routers/cash-cuts.router.js` (montar bajo `/cash/cuts` en `backend/routers/cash.router.js`)
- Modify: `backend/controllers/cash.controller.js` (`close` y `getById` devuelven `segments`)
- Modify: `backend/services/sale-audit.service.js` (entradas de bitácora `cashCutEntry`, `cashCutConfirmEntry`)
- Test: `backend/test/cash-cuts.test.js`

**Interfaces:**
- Consumes: servicio de Task 7, `req.registerId`.
- Produces: `GET /cash/cuts/expected` (admin, cashier) → `expectedSince`; `GET /cash/cuts/team` (admin, cashier) → `{ username, name }[]` de la tienda (sin quien consulta); `POST /cash/cuts` body `{ toUser, countedCash }` → 201 `Cut`; `GET /cash/cuts/pending` → `Cut[]` del usuario autenticado; `POST /cash/cuts/:id/confirm` body `{ confirmedCash? }` → `Cut`; `GET /cash/cuts?from&to&registerId&user&status` (solo admin) → `Cut[]`. Cierre y detalle de sesión incluyen `segments` y `cuts`.

- [ ] **Step 1: Pruebas que fallen** (arnés) — flujo completo: crear corte, el receptor lo ve en `pending`, confirma, desaparece de `pending`; el cajero recibe 403 en `GET /cash/cuts`; crear corte sin sesión abierta devuelve 400 `cash_closed`; el cierre devuelve `segments` con una fila por cajero; la bitácora registra el corte y la confirmación.
- [ ] **Step 2: Correr** → FALLA. **Step 3: Implementar. Step 4: Correr** → PASA. Correr todo `backend/test` con `timeout 600` (excepto `ai-images.test.js`, que ya se cuelga por Mongo) → sin fallas nuevas.

## Etapa D — Pantallas

### Task 9: Cliente API y memoria de la caja por computadora

**Files:**
- Modify: `frontend/src/apiService.ts` (interceptor de petición que agrega `X-Register`; métodos nuevos)
- Create: `frontend/src/registerStore.js`
- Test: `frontend/src/__tests__/registerStore.test.js`

**Interfaces:**
- Produces: `registerStore`: `current(): number` (lee `localStorage` clave `mt_register`, default 1, con `try/catch`), `set(n: number): void`, `clear(): void`, `deviceId(): string` (id aleatorio persistido en `mt_device`; si `localStorage` falla, uno por carga de página). El interceptor envía `X-Register` y `X-Device` en cada petición. apiService: `getRegisters()`, `saveRegisters(count: number, names: string[])`, `releaseRegister(n: number)`, `setPointShared(shared: boolean)`, `registerTerminal(terminalId: string, registerNumber?: number)`, `cashCutExpected()`, `cashCutTeam()`, `createCashCut(toUser: string, countedCash: number)`, `pendingCashCuts()`, `confirmCashCut(id: string, confirmedCash?: number)`, `listCashCuts(params)`.

- [ ] **Step 1: Pruebas que fallen** — `current()` sin dato = 1; `set(2)` persiste; `localStorage` que lanza no rompe (devuelve 1); valores inválidos (0, 9, texto) = 1.
- [ ] **Step 2: Correr** `npm run test -- registerStore` (en `frontend`) → FALLA. **Step 3: Implementar. Step 4: Correr** → PASA.

### Task 10: Ajustes → MultiCaja y Terminal compartida (solo dueño)

**Files:**
- Modify: `frontend/src/views/SettingsView.vue` (`SECTIONS`, `NAV` «Tu tienda», nueva sección `multicaja`, interruptor en la sección `terminal`)
- Create: `frontend/src/components/MultiCajaPanel.vue`
- Modify: `frontend/src/dialog.js` uso existente para el aviso de terminal compartida (sin crear diálogo nuevo)

**Interfaces:**
- Consumes: `getRegisters`, `saveRegisters`, `releaseRegister`, `setPointShared`, `registerTerminal` (Task 9); `registerStore`.
- Produces: sección «MultiCaja» (icono `store`, desc «Varias cajas a la vez») que solo ve el dueño; Básico: bloqueada con «Pasa a Crecimiento»; Perpetua: «Contáctanos»; selector de cantidad (1 hasta el límite) con nombre editable por caja, terminal por caja y botón «Liberar» en cajas abiertas. En «Terminal de cobro»: interruptor «Terminal compartida» que al activarse muestra el aviso con el texto exacto de Global Constraints antes de guardar.

- [ ] **Step 1:** Implementar el panel y las secciones; ocultar con `v-if="isAdmin"` (el servidor ya valida).
- [ ] **Step 2: Verificar en pantalla** con el dev server (`npm run dev` en `frontend`, Browser pane): plan Básico bloqueado, Crecimiento hasta 2, Pro hasta 4, cajero no ve la sección, el aviso sale al activar compartida y no al desactivarla. `npm run test` y `npm run build` sin errores.

### Task 11: Elegir caja en cada computadora y avisos de caja bloqueada

**Files:**
- Modify: `frontend/src/views/MenuComponent.vue` (alrededor de `cashSession`, líneas 2571–2650), `frontend/src/views/OrdersView.vue` (líneas 884–918), `frontend/src/views/DashboardView.vue` (línea 1288)
- Create: `frontend/src/components/RegisterPickerDialog.vue`
- Modify: `frontend/src/apiService.ts` (el interceptor de respuesta atiende `register_unknown` y `register_over_plan`)

**Interfaces:**
- Consumes: `registerStore`, `getRegisters`.
- Produces: si el plan permite más de una caja y la PC no tiene caja elegida, o el servidor responde `register_unknown`, aparece `RegisterPickerDialog` (lista con el estado y quién la tiene abierta; una caja abierta en otro navegador aparece deshabilitada con «Abierta por X en otro equipo»; un 409 `register_in_use` en cualquier petición devuelve al selector con ese aviso); la elección se guarda con `registerStore.set`. Con `register_over_plan`, la pantalla de venta muestra el aviso «Tu plan ya no incluye esta caja. Haz su corte para cerrarla.» y solo permite el corte. El encabezado de caja muestra el nombre de la caja.

- [ ] **Step 1:** Implementar el selector y el manejo de errores. **Step 2: Verificar en pantalla** con dos pestañas simuladas (cambiar `mt_register` desde `javascript_tool`): dos cajas abiertas a la vez con cortes separados; abrir una caja ocupada muestra quién la tiene; desactivar una caja en otra pestaña vuelve a pedir la elección. `npm run test` y `npm run build`.

### Task 12: Corte X y confirmación al iniciar sesión

**Files:**
- Create: `frontend/src/components/CutXDialog.vue`, `frontend/src/components/CutConfirmDialog.vue`, `frontend/src/cutX.js` (cálculo de la diferencia y texto, función pura)
- Modify: `frontend/src/views/SettingsView.vue` (opción independiente «Corte X» en «Esta app», visible para `admin` y `cashier`)
- Modify: `frontend/src/main.ts` o el shell de la app donde se inicializa la sesión del usuario, para revisar pendientes al entrar
- Test: `frontend/src/__tests__/cutX.test.js`

**Interfaces:**
- Produces: `cutDifference(counted: number, expected: number): number` (a centavos) y `cutLabel(diff: number): 'cuadra'|'sobra'|'falta'`. `CutXDialog`: muestra lo esperado (`cashCutExpected`), pide lo contado, lista de receptores (`cashCutTeam`, el dueño incluido) y envía `createCashCut`. `CutConfirmDialog`: al iniciar sesión, si `pendingCashCuts()` trae uno, muestra «Recibes la Caja N con $X en efectivo» con «Confirmar» y «No coincide» (pide la cifra y envía `confirmCashCut(id, cifra)`); usa el servicio de diálogos existente (`dialog.js`).

- [ ] **Step 1: Pruebas que fallen** — `cutDifference(790, 800) === -10`, `cutLabel(-10)==='falta'`, `(0,0)==='cuadra'`, redondeo a centavos (`0.1+0.2` vs `0.3` da 0).
- [ ] **Step 2: Correr** → FALLA. **Step 3: Implementar** helper, diálogos y la revisión de pendientes al entrar (se repite al volver a la pestaña, sin bloquear la venta).
- [ ] **Step 4: Verificar en pantalla** el flujo completo con dos usuarios (cajero A entrega, entra cajero B y confirma; otra vez con «No coincide»). `npm run test` y `npm run build`.

### Task 13: Estadísticas del dueño y corte final por tramo

**Files:**
- Modify: `frontend/src/views/DashboardView.vue` (tarjeta «Cortes X» solo para el dueño, con filtros por caja, cajero y estado)
- Modify: `frontend/src/views/PrintCashCloseView.vue` y `frontend/src/cashCloseData.js` (desglose `segments` y lista de cortes X en el corte final)
- Test: `frontend/src/__tests__/cashCloseUsd.test.js` (agregar un caso con `segments`)

**Interfaces:**
- Consumes: `listCashCuts`, `segments` y `cuts` de `getCashSessionById` (Task 8).
- Produces: tarjeta con tabla de Cortes X (caja, entrega, recibe, hora, esperado, contado, diferencia, estado) con faltantes y disputas marcados; el corte final impreso muestra una sección «Por cajero» y los cortes X de la sesión.

- [ ] **Step 1: Prueba que falle** — datos de corte con dos `segments` generan las filas esperadas en `cashCloseData` (nombres y totales).
- [ ] **Step 2: Correr** → FALLA. **Step 3: Implementar. Step 4: Correr** → PASA; verificar en pantalla la tarjeta y el ticket del corte final.

### Task 14: Verificación final

- [ ] Correr todo el backend: `timeout 600 node --test backend/test/*.test.js` excluyendo `ai-images.test.js` → todas pasan.
- [ ] Frontend: `npm run test` y `npm run build` en `frontend` → sin errores.
- [ ] Recorrido en pantalla con dos computadoras simuladas: abrir 2 cajas, vender en ambas, cobrar con terminal propia y con compartida (aviso y bloqueo), Corte X con confirmación, bajar de plan en un tenant de prueba y comprobar el bloqueo de la caja sobrante, corte final con desglose.
- [ ] Agregar una nota de sesión en `.claude/vault/MiTiendita/Sesiones/` (plantilla `Sesion.md`), una decisión en `Decisiones/` (caja identificada por número) y enlazarlas desde `MiTiendita.md`.

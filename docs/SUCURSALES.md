# Sucursales y reporte consolidado

Un dueño puede tener varias sucursales bajo una misma organización, entrar a cada una sin volver a iniciar sesión y ver sus ventas juntas. **El modelo de aislamiento no cambia**: la unidad sigue siendo la tienda (`tenantId`) y cada consulta sigue filtrando por él.

## Modelo

- `organizations` (`name`, `ownerUsername`, `matrixTenantId`). Una tienda sin organización funciona exactamente igual que antes.
- Una **sucursal es una tienda independiente** (`tenants` con `isBranch: true`, `organizationId`, `matrixTenantId`): inventario, caja, clientes, productos y equipo son propios. Al crearla hereda del negocio matriz el giro, impuestos, colores y la configuración de inventario; la dirección y los datos fiscales son propios. Recibe el catálogo maestro si su giro lo usa.
- La **matriz** es la tienda donde se fundó la organización. El **dueño** es su administrador activo más antiguo (no una cuenta técnica de sucursal). Un segundo administrador de la matriz no es dueño y no puede crear sucursales ni entrar a ellas.
- La organización se crea sola al abrir la primera sucursal (`POST /org/branches`), siempre que el plan lo permita.

## Cómo se entra a una sucursal

Cada sucursal tiene **una cuenta técnica de administrador, ligada al dueño** (`users.linkedOwner`): sin correo, con una contraseña aleatoria que nadie conoce, y **no ocupa un lugar del plan** ni aparece en Empleados. No se puede iniciar sesión con ella (`LoginUsuario` la rechaza); la única entrada es `POST /org/switch`.

`POST /org/switch { branchId }` verifica **en esa misma petición y en la base** que (1) quien pide es el dueño activo de la organización, (2) la sucursal pertenece a esa organización y (3) no está de baja. Solo entonces abre una sesión nueva como la cuenta de esa sucursal (o como el propio dueño si el destino es la matriz). Cualquier otro caso: 403 `NOT_ORG_OWNER`, 404 o 409.

El token de la cuenta técnica lleva además `owner` y `otv` (la versión de sesión del dueño). En cada petición `requireAuth` compara `otv` con la versión actual del dueño:

- si el dueño cambia su contraseña o su rol, se desactiva o deja de ser administrador, **las sesiones de sus sucursales caen en el acto** (y `revokeAll` revoca también sus refresh tokens);
- un token de cuenta normal que traiga `owner` u `otv`, o uno de sucursal sin ellos, se rechaza.

## Plan y suscripción

- **Una sola suscripción: la de la matriz.** Se resuelve al leer (`overlayMatrix` en `database/mongodb.js`): plan, estado, periodo y suspensión de una sucursal salen siempre de la matriz, así que lo que escriba la plataforma, Mercado Pago o un pago manual en la matriz se refleja solo.
- Sucursales por plan (cuenta la matriz): Básico 1, Crecimiento 1, **Pro 5**, Perpetua 1 (`PLAN_LIMITS.branches`). Al llegar al tope, crear o reactivar responde 409 `BRANCH_LIMIT`.
- Los lugares de usuarios y el tope de productos se cuentan **por sucursal**, con los límites del plan de la matriz.
- Pagar, sincronizar o cancelar desde una sucursal responde 409 `BILLED_BY_MATRIX`; Facturación avisa que se paga desde la matriz.
- Las sucursales **no cuentan como clientes aparte** en los libros de la plataforma (ingresos, clientes) ni en la promoción de lanzamiento: sus ingresos son los de la matriz.

## Baja lógica

`POST /org/branches/:id/suspend` marca `branchSuspendedAt`. La sucursal se bloquea igual que una tienda sin suscripción, **no se borra ningún dato** y libera un lugar del plan. No se puede dar de baja la matriz ni la sucursal en la que se está. `reactivate` la devuelve (sujeta al límite del plan).

## Reporte consolidado (solo dueño)

`GET /org/reports/summary?from&to` y `/org/reports/summary.csv`. Por sucursal y en total: ventas, tickets, ticket promedio, devoluciones, fiado del periodo y saldo por cobrar. Más una serie diaria. Las consultas usan los ids de la organización que el **servidor** lee de la base; el cliente nunca manda ids. Un día `AAAA-MM-DD` se toma en la zona horaria de la matriz. Rango máximo: 2 años.

## Rutas

| Ruta | Quién |
|---|---|
| `GET /org` | administrador (dueño: sucursales y límites; resto: `isOwner: false`) |
| `PUT /org` | dueño |
| `POST /org/branches`, `/branches/:id/suspend`, `/branches/:id/reactivate` | dueño |
| `POST /org/switch` | dueño (re-verificado en la petición) |
| `GET /org/reports/summary[.csv]` | dueño |

## Auditoría

`org_created`, `branch_created`, `branch_suspended`, `branch_reactivated` (en la matriz) y `branch_switch` (en la sucursal a la que se entra, con el nombre del dueño) quedan en la bitácora de actividad de cada tienda.

## Pruebas

`backend/test/org.test.js` (creación, límites por plan, permisos, cambio, baja, reporte que no incluye tiendas ajenas, deshacer si falla) y `backend/test/org-session.test.js` (token de sucursal válido, tokens fabricados, caída inmediata al cambiar la contraseña o el rol del dueño).

## Lo que NO incluye (todavía)

- Traspasos de mercancía entre sucursales.
- Catálogo y precios compartidos entre sucursales (cada una tiene el suyo).
- Inventario consolidado por producto.
- Compras centralizadas.
- Cada sucursal conecta su propia terminal de Mercado Pago.
- Limitación conocida: cambiar el plan o suspender una sucursal desde el panel de la plataforma no tiene efecto (se resuelve desde la matriz).

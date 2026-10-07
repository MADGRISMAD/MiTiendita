# Mi Tiendita — Abarrotes

POS para **tiendas de abarrotes** y comercios de barrio. Multi-tenant, caja, catálogo e impresión de tickets.

Stack: Vue.js (frontend), Express.js (backend) y MongoDB.

## Correr en local
```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:8081  

Copia `backend/.env.example` → `backend/.env`.

## Flujo de la tienda
1. **Vender** (`/pos`) — buscador/escáner + categorías → ticket → *Cobrar* (ver abajo)
2. **Caja** (`/orders`) — abrir turno, cobrar, imprimir ticket, corte
3. **Productos** (`/products`) — categorías y artículos (solo admin)
4. **Más** — resumen, empleados, facturación SaaS, configuración

Rutas antiguas de restaurante (`/main`, `/kitchen`, `/waitlist`) redirigen al POS.

## Pantalla de venta
Pensada para abarrotes, farmacia y ferretería. A la izquierda el buscador y el catálogo (mosaicos por categoría con existencias); a la derecha el ticket con totales y **Cobrar**. En el celular el ticket se abre desde la barra inferior.

- **Buscar**: por nombre, código o descripción, sin acentos y con varias palabras (`para 500` encuentra *Paracetamol 500 mg*). ↑ ↓ eligen y Enter agrega.
- **Cantidad**: `3*` antes del código agrega 3 piezas; **F3** (o tocar la cantidad) acepta decimales para kilos o metros; `+` / `−` suman o quitan una pieza.
- **A granel** (kg, g, litros): al dar de alta el producto elige *¿Cómo se vende?* → «Por kilo» y pon el precio por kilo (ej. Tomate a $28.00/kg). Si buscas algo que no existe, «Registrar a granel (por kilo)» lo da de alta así. La línea y el ticket dicen «0.750 kg × $28.00/kg».
  - **Con báscula conectada** (Configuración → Báscula; Chrome o Edge en PC, báscula por USB o puerto serie): eliges el producto, la pantalla avisa «Pon el tomate en la báscula», muestra el peso en vivo y, cuando el peso se queda quieto **2 segundos**, pita y lo agrega solo. Lo que ya estaba encima de la báscula al elegir el producto no se cobra hasta que lo cambien o lo retiren.
  - **Sin báscula**: se escribe el peso **o** el importe en pesos (calcula el peso).
  - Las etiquetas de báscula (EAN-13 que empieza con 20–29) se leen solas: configura en *Ventas e IVA* si traen peso o importe y usa la clave de la báscula como código del producto.
- **Artículo varios** (**Ins**): cobra algo sin código o que aún no está en el catálogo; no toca el inventario.
- **En espera** (**F6**): aparta el ticket para atender a otro cliente y retómalo después. Se guarda en ese equipo.
- **Cobrar** (**F12**): efectivo con billetes sugeridos y cambio, tarjeta, transferencia (con folio SPEI opcional), mixto u otro. Enter o F12 confirman.
- Otros atajos: **F2** quitar renglón, **F4** consultar precio, **F9** descuento, **Esc** cerrar o limpiar la búsqueda.

### Sin internet
La caja sigue cobrando sin conexión: las ventas se guardan en el dispositivo y se suben solas al volver la red, sin duplicarse. Las que el servidor rechace quedan en Caja → «Ventas de este dispositivo sin subir». Cómo funciona y cómo probarlo: [docs/modo-sin-internet.md](docs/modo-sin-internet.md).

### Impresora térmica
En **Configuración → Impresora** cada caja elige cómo sale el ticket (se guarda en ese dispositivo):

| Modo | Para qué | Navegador |
|---|---|---|
| Navegador (actual) | Cualquier impresora, con el diálogo de imprimir | Todos |
| Térmica USB | ESC/POS por WebUSB, sin diálogo | Chrome/Edge en PC; Chrome Android con cable OTG |
| Térmica USB (puerto COM) | Impresoras que Windows instala como puerto COM (Web Serial) | Chrome/Edge en PC |
| Térmica Bluetooth | Impresoras Bluetooth LE (Web Bluetooth) | Chrome en Android y PC |

- **Elegir impresora** pide el permiso del navegador una vez; después el ticket sale solo al cobrar, con los mismos datos que el ticket en pantalla (incluido el QR para facturar). **Imprimir prueba** confirma acentos, ancho (58 u 80 mm) y QR.
- **Abrir el cajón al cobrar en efectivo** manda el pulso ESC/POS al cajón conectado a la impresora.
- Si la impresora no responde (8 s), Vender muestra el error con **Reintentar** e **Imprimir con el navegador**; la venta ya quedó registrada.
- **Windows + USB:** el driver de impresora de Windows no deja que Chrome use el puerto. Si «Térmica USB» no la encuentra o no tiene permiso, usa el modo «puerto COM» (si la impresora trae driver de puerto virtual) o cambia el driver a WinUSB con [Zadig](https://zadig.akeo.ie/).
- **Bluetooth clásico (SPP):** las impresoras que solo tienen Bluetooth clásico no funcionan con Web Bluetooth; usa una con Bluetooth LE (BLE) o el modo Navegador.
- Comandos ESC/POS en `frontend/src/escpos.js`; conexión en `frontend/src/thermalPrinter.js`.

### Báscula
En **Configuración → Báscula** se conecta la báscula de la caja (Web Serial: Chrome/Edge en PC). Se elige cómo manda el peso (continuo, o pedirlo con «P», «W» o ENQ), la velocidad del puerto (9600 casi siempre) y en qué unidad viene si no la dice. Ahí mismo se ve el peso en vivo para probar. Lectura en `frontend/src/scale.js`; la regla de los 2 segundos en `frontend/src/bulk.js` (`createStableWeigh`).
- Si la impresora (modo puerto COM) y la báscula usan el mismo adaptador USB-serie (mismo fabricante y modelo), el navegador no las distingue: conecta una por USB directo o usa otro adaptador.

Modelos probados (ir llenando al probar en tienda; formato: modelo · conexión · sistema y navegador · resultado):

| Modelo | Conexión | Sistema / navegador | Resultado |
|---|---|---|---|
| _pendiente_ | USB ESC/POS genérica 80 mm | Windows · Chrome | _por probar_ |
| _pendiente_ | Bluetooth 80 mm | Android · Chrome | _por probar_ |

## Catálogo maestro (abarrotes)
**Productos → Catálogo maestro**: 181 productos de abarrotes, frescos y conveniencia (Tijuana), listos para agregar a la tienda. El dueño marca lo que vende y le pone **su precio**; el catálogo no trae precios. Cada producto se copia al catálogo de la tienda (nombre, presentación, código, unidad de venta), así que después se edita como cualquier otro.

- Lo usan las tiendas de giro **abarrotes**, **conveniencia** y **comercio** (`other`; ahí caen las carnicerías, que no tienen giro propio). Ferretería, farmacia, restaurante, café, bar y hotel no lo ven, y el servidor responde 403.
- Sin elegir categoría, cada producto va a la de su proveedor (Sabritas, Bimbo, Coca-Cola…), que se crea si no existe. Lo que la tienda ya tiene se omite, y se respeta el tope de productos del plan.
- Lo fresco por kilo (16 productos con clave PLU) se agrega «por kilo» y con la clave de báscula (`3001`, no `PLU-3001`).
- Los códigos de barras son de **referencia**: solo 1 de 161 pasa la validación EAN-13. Hay que escanear el empaque real al editar cada producto.
- Los datos están en `backend/data/catalogo-maestro.json`; para actualizarlos se edita ese archivo y se publica. La lista de giros está en `backend/services/master-catalog.service.js` y en `frontend/src/masterCatalog.js` (una prueba comprueba que coincidan).

## Configuración inicial
Tras registrarte, el wizard pide nombre de tienda, tipo (abarrotes / conveniencia / farmacia / ferretería) y logo. Puedes cargar 8 productos de ejemplo para cobrar el mismo día. Términos: `/terminos` · Privacidad: `/privacidad`.

## Billing (suscripción Mi Tiendita)
SaaS **100% nube** (sin instalar). Prueba **3 días**. **Básico** $349 · **Crecimiento** $750 · **Pro** $1,350 /mes (anual: 10 meses: $3,490 · $7,500 · $13,500). Incluyen **Inventario Mágico** y **Precio Mágico** (50 / 150 / 500 usos al mes). **Promoción de lanzamiento (clientes nuevos, aparte de los 3 días):** los primeros **3 cobros mensuales a 1/3 del precio** ($116 · $250 · $450) y después precio normal; solo para tiendas creadas después de activarla y solo en plan mensual. Al terminar el 3er cobro se sube el monto de la suscripción en Mercado Pago (`PUT /preapproval`); si ese aviso no llega, se sube solo unos días después de la fecha del 3er cobro (`backend/services/promo.service.js`). **La prueba siempre se respeta:** si contratas durante los 3 días, la suscripción se crea con `free_trial` por los días que quedan y el primer cobro (ya con la promoción) es al terminar la prueba. En `/billing` se paga, se ve el historial y se cancela la renovación (sigues activo hasta el fin del periodo).

Límites: Básico 2 usuarios / 250 productos · Crecimiento 6 / 1,500 · Pro 20 / ilimitados.

## Panel interno
Hay dos perfiles. El seed crea el **admin**:

```bash
cd backend && npm run seed:platform-admin
```

- **Admin** — `platform` / `Platform123!` → `/platform`. Números, licencias (incluida **Perpetua**), gastos y **Equipo**.
- **Soporte** — lo crea un admin en `/platform/equipo`. Solo ve clientes y responde correo.

## Seguridad de las cuentas
- **Sesión**: al entrar se entrega un access token de 15 min y un refresh token en cookie `HttpOnly` (`mt_rt`, 30 días, rota en cada uso). El front lo renueva solo cuando el access vence. Si alguien reusa un refresh ya rotado, se cierran todas las sesiones de esa persona. Cambiar o restablecer la contraseña cierra las demás sesiones al instante.
- **Contraseñas**: mínimo 10 caracteres (una frase sirve), no de las más filtradas ni secuencias ni el propio correo (`backend/utils/password-policy.js` = `frontend/src/passwordPolicy.js`). Las cuentas existentes siguen entrando; la regla aplica al crear o cambiar contraseña.
- **Equipo**: una tienda solo tiene `admin` (dueño) y `cashier`; los roles de restaurante (recepción, vendedor, almacén) pasaron a cajero y ya no se pueden pedir por la API. En *Empleados → Acceso a la app* el dueño ve quién entra (con su último acceso) y puede **desactivar**, **reactivar** o **cambiar el rol** de cada cuenta. Cada cambio cierra las sesiones de esa cuenta al instante (aunque tenga un token vigente), cuenta en el plan (desactivar libera su lugar; reactivar respeta el límite) y queda en la bitácora (`activity_log`). Blindajes: no se puede cambiar o desactivar la propia cuenta, ni cuentas de otra tienda o de la plataforma, y la tienda **nunca se queda sin dueño activo** (ni aunque dos dueños se quiten el acceso al mismo tiempo: el cambio se deshace con un 409). Código en `backend/services/team.service.js`.
- Se retiraron de la API las rutas de restaurante (`/mesas`, `/tables`, lista de espera) y `GET /usuarios/find`, que devolvía la cuenta completa (con hash de contraseña) de cualquier correo, también de otras tiendas. «Personal y turnos» (`/waiters`) sigue.
- **Bloqueo**: 5 intentos fallidos (contraseña o código) bloquean la cuenta 15 min.
- **Verificación en dos pasos (TOTP)**: opcional en *Configuración → Mi cuenta*; obligatoria para `platform_admin` y `platform_support` (al entrar se les pide activarla con un QR). Da 8 códigos de respaldo de un solo uso. El secreto se guarda cifrado (`MFA_ENCRYPTION_KEY` o `SECRET_KEY`).
- **Límites de peticiones** por IP, guardados en MongoDB (`rate_limits`, con TTL) para que valgan entre instancias/serverless: global, login, registro, recuperar contraseña, 2FA, refresh y rutas públicas (factura, invitaciones).
- **Cabeceras de seguridad** (equivalentes a helmet) en todas las respuestas de la API.

## Terminal de cobro Mercado Pago (Point)

Cada tienda conecta **su propia** cuenta de Mercado Pago y elige su terminal en *Configuración → Terminal de cobro*. Al cobrar con tarjeta, el monto aparece solo en la terminal y la venta se registra únicamente si el pago sale aprobado.

**Configuración del servidor** (una vez, ver `backend/.env.example`):

1. En [Tus integraciones](https://www.mercadopago.com.mx/developers/panel/app) crea una aplicación y copia `MP_CLIENT_ID` y `MP_CLIENT_SECRET`.
2. Redirect URL de la app = `MP_OAUTH_REDIRECT` = `{API_PUBLIC_URL}/point/oauth/callback`.
3. Webhooks (modo productivo): una sola URL, `{API_PUBLIC_URL}/point/webhook`, con los eventos *Order (Mercado Pago)* y *Planes y suscripciones* (incluye los pagos recurrentes); los avisos de suscripciones se atienden en facturación. La clave secreta va en `MP_WEBHOOK_SECRET`.
4. Genera `OAUTH_STATE_SECRET` y `TOKEN_ENC_KEY` (32 bytes en hex): `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   Los tokens de cada tienda se guardan cifrados (AES-256-GCM); si cambias `TOKEN_ENC_KEY` hay que reconectar las cuentas.

**Garantías:** el cobro se crea en la terminal antes de registrar la venta; la venta lo "consume" una sola vez, solo si está aprobado, es de la misma tienda y por el mismo monto. Si el monto aprobado no coincide, queda en revisión y no se usa. Si la terminal o la cuenta se desconectan, se avisa antes de cobrar y se puede cobrar manual.

## Vendedores (referidos)

Personas que venden Mi Tiendita a tiendas (por ejemplo, en otro estado) y ganan comisión por **cada cobro** de las tiendas que traen. Se manejan en *Admin → Vendedores* (solo el admin de la plataforma).

- **Alta:** el admin crea al vendedor y se le genera su número de referencia, con formato `MT-XXXXXX`.
- **Cómo llegan las tiendas:** escriben el código en el registro (o entran con el enlace `/register?ref=MT-XXXXXX`, que lo llena solo). El admin también puede asignar o quitar el vendedor desde la ficha del cliente.
- **Comisión por cobro:** empieza en **10%** y sube con las *ventas cerradas* (tiendas referidas que ya pagaron al menos una vez):

  | Ventas cerradas | Comisión |
  |---|---|
  | 0–4 | 10% |
  | 5–9 | 12% |
  | 10–19 | 14% |
  | 20–34 | 16% |
  | 35–49 | 18% |
  | 50 o más | 20% (máximo) |

  La tasa de cada cobro se guarda al generarse: subir de nivel no cambia lo ya ganado. La escalera está en `backend/services/referral.tiers.js`.
- **Qué cobros cuentan:** la activación de la suscripción, cada cobro recurrente de Mercado Pago y los cobros que el admin registra a mano (efectivo, transferencia, licencia perpetua). Un mismo cobro nunca paga dos veces.
- **Pagos al vendedor:** en la pestaña *Cobros* el admin ve lo pendiente, liquida todo junto (queda el historial) o anula un cobro pendiente (por ejemplo, un reembolso).
- **Mercado Pago:** en los Webhooks de tu aplicación activa también el evento **Pagos recurrentes (`subscription_authorized_payment`)**, además de las suscripciones; sin él solo se comisiona la activación y no las renovaciones.

## Portal de socios (/socio)

Tres áreas separadas, cada una con sus propios roles:

| Área | Roles | Ve |
|---|---|---|
| **Tienda** | `admin` (dueño), `cashier` | Solo su tienda |
| **Socio** (vendedor/proveedor de Mi Tiendita) | `partner_admin` (dueño del socio), `partner_staff` (asesor) | Solo las tiendas que llegaron con su código |
| **Plataforma** | `platform_admin`, `platform_support` | Todo |

- **Acceso:** el admin de la plataforma, en *Vendedores → Accesos*, crea la primera cuenta del socio (normalmente *Dueño*). Ese dueño agrega a sus asesores desde *Equipo*. Toda cuenta de socio activa la verificación en dos pasos la primera vez que entra.
- **Dueño del socio:** inicio con su código y enlace para registrar tiendas, tiendas que piden atención (pago atrasado, prueba por vencer, sin entrar), todas sus tiendas, comisiones y pagos recibidos, reparte las tiendas entre su equipo y lo administra (alta, perfil, desactivar; nunca se queda sin dueño).
- **Asesor:** ve y atiende las tiendas (datos del dueño, plan, uso, historia) y anota el seguimiento; no ve dinero ni cambia al equipo.
- **Aislamiento:** un socio nunca ve tiendas de otro socio, y las cuentas de socio no pueden entrar a la caja ni al panel de la plataforma (se valida en el servidor, no solo en la pantalla).

## SEO

- **Fuente única:** `frontend/src/seo/site.mjs` (títulos, descripciones, precios, páginas por giro, datos estructurados).
- **HTML pre-generado al compilar** (`frontend/seo-plugin.mjs`): cada página pública sale con su `<title>`, descripción, canónica, Open Graph/Twitter (`/og.png`), `hreflang es-MX`, JSON-LD (Organization, SoftwareApplication con precios, WebSite, FAQPage, BreadcrumbList) y su contenido en texto, así buscadores y vistas previas de WhatsApp/Facebook no dependen de JavaScript.
- **Páginas por giro:** `/punto-de-venta-para-abarrotes`, `-para-farmacia`, `-para-ferreteria`, `-para-papeleria`, `/punto-de-venta-con-bascula`, `/punto-de-venta-sin-internet`.
- **`sitemap.xml` y `robots.txt`** se generan en cada build; el panel, la caja y las cuentas llevan `noindex` y están bloqueados en robots.
- Al agregar una página pública: súmala en `site.mjs` y su regla en `vercel.json` (el build falla si falta).

## Precios

Los precios están **escritos en el código**, no en variables de entorno (las `MP_PLAN_*_PRICE` ya no se usan; si quedaron en Vercel se ignoran). Para cambiarlos edita `backend/services/plans.catalog.js` y `frontend/src/seo/site.mjs` (`PRICES`); una prueba falla si no coinciden. La landing, Facturación, el simulador de proveedores y el SEO se actualizan solos.

## Docker
```bash
docker compose up --build -d
```

## Notificación del deploy a producción

Cada push a `main` ejecuta `.github/workflows/deploy.yml` y despliega a Vercel. Cuando el job de deploy termina (éxito, fallo o cancelación) un segundo job envía un correo HTML del sistema interno **minegocio** (verde bosque) con el resultado. Si armar o enviar el correo falla, el estado del workflow sigue siendo el del deploy. Hasta que existan `MAIL_USERNAME` y `MAIL_PASSWORD`, el envío se omite y el log deja una advertencia; el deploy no cambia de resultado.

Vista previa local:

```bash
node backend/scripts/render-deploy-mail.js --preview
```

Esos secretos tienen que estar en **GitHub** (no en Vercel): entorno **production** o secretos del repositorio en Actions. El job de correo usa `environment: production`, así que lee los secretos de ese entorno.

El mensaje incluye resultado, mensaje del commit, SHA corto, autor, quién hizo push, rama, fecha y hora en `America/Tijuana`, enlace al commit, enlace a la ejecución de Actions y la URL de producción https://www.mitiendita.software/.

Destinatarios por defecto:

- mayra.bamaca09@gmail.com
- madgrismad@gmail.com
- luispantoja1102@gmail.com

Secretos en **Settings → Environments → production → Environment secrets** (o en **Settings → Secrets and variables → Actions** si los quieres a nivel de repositorio):

- `MAIL_USERNAME` (obligatorio) — dirección de Gmail que envía, por ejemplo `mitiendita@gmail.com`.
- `MAIL_PASSWORD` (obligatorio) — contraseña de aplicación de esa cuenta. No uses la contraseña normal ni la subas al repositorio.
- `MAIL_TO` (opcional) — destinatarios separados por comas. Si no existe, se usan los tres correos de arriba.

Para crear la contraseña de aplicación hace falta la verificación en 2 pasos en la cuenta de Google:

1. Activa la verificación en 2 pasos: https://myaccount.google.com/signinoptions/two-step-verification
2. Abre las contraseñas de aplicación: https://myaccount.google.com/apppasswords (la página solo aparece con la verificación en 2 pasos activa).
3. Crea una contraseña para la app **Correo** (puedes nombrarla «GitHub Actions»).
4. Copia los 16 caracteres, sin espacios, y pégalos en el secreto `MAIL_PASSWORD`.
5. En `MAIL_USERNAME` pon la misma dirección de Gmail.

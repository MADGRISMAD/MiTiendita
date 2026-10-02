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
- **A granel** (kg, g, litros): al dar de alta el producto elige su *Unidad de venta*. Al agregarlo se abre un teclado para capturar el peso **o** el importe en pesos (calcula el peso); la línea y el ticket dicen «0.750 kg × $180.00/kg». Las etiquetas de báscula (EAN-13 que empieza con 20–29) se leen solas: configura en *Ventas e IVA* si traen peso o importe y usa la clave de la báscula como código del producto.
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

Modelos probados (ir llenando al probar en tienda; formato: modelo · conexión · sistema y navegador · resultado):

| Modelo | Conexión | Sistema / navegador | Resultado |
|---|---|---|---|
| _pendiente_ | USB ESC/POS genérica 80 mm | Windows · Chrome | _por probar_ |
| _pendiente_ | Bluetooth 80 mm | Android · Chrome | _por probar_ |

## Configuración inicial
Tras registrarte, el wizard pide nombre de tienda, tipo (abarrotes / conveniencia / farmacia / ferretería) y logo. Puedes cargar 8 productos de ejemplo para cobrar el mismo día. Términos: `/terminos` · Privacidad: `/privacidad`.

## Billing (suscripción Mi Tiendita)
SaaS **100% nube** (sin instalar). Prueba **14 días**. **Básico** $349 · **Crecimiento** $599 · **Pro** $899 /mes. Incluyen **Inventario Mágico** y **Precio Mágico** (50 / 150 / 500 usos al mes). En `/billing` se paga, se ve el historial y se cancela la renovación (sigues activo hasta el fin del periodo).

Límites: Básico 2 usuarios / 250 productos · Crecimiento 6 / 1,500 · Pro 20 / ilimitados.

## Panel interno
Hay dos perfiles. El seed crea el **admin**:

```bash
cd backend && npm run seed:platform-admin
```

- **Admin** — `platform` / `Platform123!` → `/platform`. Números, licencias (incluida **Perpetua**), gastos y **Equipo**.
- **Soporte** — lo crea un admin en `/platform/equipo`. Solo ve clientes y responde correo.

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

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
1. **Vender** (`/pos`) — categorías + productos → ticket → *Registrar venta*
2. **Caja** (`/orders`) — abrir turno, cobrar, imprimir ticket, corte
3. **Productos** (`/products`) — categorías y artículos (solo admin)
4. **Más** — resumen, empleados, facturación SaaS, configuración

Rutas antiguas de restaurante (`/main`, `/kitchen`, `/waitlist`) redirigen al POS.

## Configuración inicial
Tras registrarte, el wizard pide nombre de tienda, tipo (abarrotes / conveniencia / farmacia) y logo. Puedes cargar 8 productos de ejemplo para cobrar el mismo día. Términos: `/terminos` · Privacidad: `/privacidad`.

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

Cada push a `main` ejecuta `.github/workflows/deploy.yml` y despliega a Vercel. Cuando el job de deploy termina (éxito, fallo o cancelación) un segundo job envía un correo con el resultado. Si armar o enviar el correo falla, el estado del workflow sigue siendo el del deploy. Hasta que existan `MAIL_USERNAME` y `MAIL_PASSWORD`, el envío se omite y el log deja una advertencia; el deploy no cambia de resultado.

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

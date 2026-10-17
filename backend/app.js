require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const server = require('http').createServer(app);

app.set('trust proxy', 1);
app.disable('x-powered-by');
require('./utils/env-check').assertEnv();
const errorReport = require('./services/error-report.service');
errorReport.init();
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  errorReport.captureError(reason instanceof Error ? reason : new Error(String(reason)), { where: 'unhandledRejection' });
});
const { securityHeaders } = require('./middleware/security.middleware');
const { limits } = require('./services/rate-limit.service');
app.use(securityHeaders);
// Escritorio: este mismo servidor entrega la interfaz (frontend/dist) en 127.0.0.1, con su propia CSP
if (process.env.FRONTEND_DIST) {
  const path = require('path');
  const dist = path.resolve(process.env.FRONTEND_DIST);
  const uiCsp = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; script-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
  const ui = express.static(dist, { index: false, maxAge: '1h', setHeaders: (res) => res.setHeader('Content-Security-Policy', uiCsp) });
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path === '/api' || req.path.startsWith('/api/') || req.path.startsWith('/health')) return next();
    return ui(req, res, () => {
      // Rutas de la app (historial del navegador): siempre index.html
      if (path.extname(req.path)) return next();
      res.setHeader('Content-Security-Policy', uiCsp);
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(path.join(dist, 'index.html'));
    });
  });
}
app.use((req, _res, next) => {
  if (req.url === '/api') req.url = '/';
  else if (req.url.startsWith('/api/')) req.url = req.url.slice(4) || '/';
  next();
});
// CORS antes de leer el cuerpo: así hasta un JSON mal formado responde con cabeceras CORS
let corsoptions = require('./configurations/cors.configuration');
app.use(cors(corsoptions));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use(compression());

// Salud (antes de conectar a la base y del límite global: un monitor externo no debe gastar cuota)
app.use('/health', require('./routers/health.router')());

const { ensureConnection } = require('./database/mongodb');
app.use(async (_req, _res, next) => {
  try { await ensureConnection(); } catch (err) {
    console.error('[db] reconnect failed:', err.message);
  }
  next();
});

// Límite global por IP (después de conectar: el conteo vive en la base)
app.use(limits.global());

app.use('/desktop', require('./routers/desktop.router'));
app.use('/usuarios', require('./routers/usuarios.router'));
app.use('/menus', require('./routers/menus.router'));
app.use('/foods', require('./routers/foods.router'));
app.use('/waiters', require('./routers/meseros.router'));
app.use('/settings', require('./routers/settings.router'));
app.use('/orders', require('./routers/orders.router'));
app.use('/customers', require('./routers/customers.router'));
app.use('/inventory', require('./routers/inventory.router'));
app.use('/invites', require('./routers/invites.router'));
app.use('/cash', require('./routers/cash.router'));
app.use('/client-errors', require('./routers/client-errors.router'));
app.use('/print-jobs', require('./routers/print-jobs.router'));

// Último recurso: un error que ningún controlador atrapó. Responde 500 sin detalles y lo reporta.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = Number(err?.status || err?.statusCode);
  if (status >= 400 && status < 500) return res.status(status).send(status === 413 ? 'Solicitud demasiado grande' : 'Solicitud inválida');
  console.error('[error]', err);
  errorReport.captureError(err, errorReport.fromReq(req));
  if (res.headersSent) return undefined;
  return res.status(500).send('Error interno');
});

if (!process.env.VERCEL) {
  // Escritorio: HOST=127.0.0.1 para que solo esta computadora pueda entrar al servidor
  const host = process.env.HOST || undefined;
  server.listen(process.env.PORT, host, () => {
    console.log(`Server listening on ${host || '*'}:${process.env.PORT}`);
  });

  // Catálogo maestro: las tiendas que ya existían lo reciben al arrancar (una sola vez cada una).
  const masterCatalog = require('./services/master-catalog.service');
  ensureConnection()
    .then(() => masterCatalog.backfill(require('./database/mongodb')))
    .then((n) => n && console.log(`[catálogo maestro] cargado en ${n} tienda(s)`))
    .catch((err) => console.warn('[catálogo maestro] no se pudo cargar:', err.message));
}

module.exports = app;
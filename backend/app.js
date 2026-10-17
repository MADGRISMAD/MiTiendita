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
  server.listen(process.env.PORT, () => {
    console.log(`Server listening on port ${process.env.PORT}`);
  });

  // Catálogo maestro: las tiendas que ya existían lo reciben al arrancar (una sola vez cada una).
  const masterCatalog = require('./services/master-catalog.service');
  ensureConnection()
    .then(() => masterCatalog.backfill(require('./database/mongodb')))
    .then((n) => n && console.log(`[catálogo maestro] cargado en ${n} tienda(s)`))
    .catch((err) => console.warn('[catálogo maestro] no se pudo cargar:', err.message));
}

module.exports = app;
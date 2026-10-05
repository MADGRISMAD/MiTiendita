require('dotenv').config();
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const server = require('http').createServer(app);

app.set('trust proxy', 1);
app.disable('x-powered-by');
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
app.use('/invoices', require('./routers/invoices.router'));
app.use('/invites', require('./routers/invites.router'));
app.use('/cash', require('./routers/cash.router'));
app.use('/billing', require('./routers/billing.router'));
app.use('/ai', require('./routers/ai.router'));
app.use('/platform', require('./routers/platform.router'));
app.use('/partner', require('./routers/partner.router'));
app.use('/point', require('./routers/point.router'));

const { verifyMailConfig } = require('./utils/mail.utils');
verifyMailConfig().catch(() => {});

if (!process.env.VERCEL) {
  server.listen(process.env.PORT, () => {
    console.log(`Server listening on port ${process.env.PORT}`);
  });
}

module.exports = app;
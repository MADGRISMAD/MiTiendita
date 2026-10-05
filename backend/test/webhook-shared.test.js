process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
process.env.NODE_ENV = 'test';
delete process.env.MP_WEBHOOK_SECRET;
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const stub = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
const calls = [];
stub('../controllers/billing.controller', {
  webhook: (req, res) => {
    calls.push('billing');
    res.sendStatus(200);
  },
});
stub('../services/point.charges.service', { onWebhook: async (id) => calls.push(`point:${id}`) });
stub('../services/mercadopago.point.service', { verifyWebhookSignature: () => true });
stub('../middleware/auth.middleware', { requireAuth: (r, s, n) => n(), requireActiveSubscription: (r, s, n) => n(), requireRoles: () => (r, s, n) => n() });
const router = require('../routers/point.router');

test('una sola URL de webhook: suscripciones van a facturación y Order a la terminal', async () => {
  const app = express();
  app.use(express.json());
  app.use('/point', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}/point/webhook`;
  const post = (body) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ type: 'subscription_authorized_payment', data: { id: '1' } })).status, 200);
  assert.equal((await post({ type: 'subscription_preapproval', data: { id: '2' } })).status, 200);
  assert.equal((await post({ type: 'order', data: { id: 'ORD9' } })).status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(calls, ['billing', 'billing', 'point:ORD9']);
  server.close();
});

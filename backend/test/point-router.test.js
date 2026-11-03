/**
 * Rutas de /point con la caja: una caja por encima del plan no cobra, y solo el dueño toca la terminal compartida.
 * Los servicios de Point y la base van simulados; el router y el middleware de caja son los reales.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const stub = (file, exports) => {
  const full = path.join(__dirname, '..', file);
  require.cache[full] = { id: full, filename: full, loaded: true, exports, children: [], paths: [] };
};

const calls = { startCharge: [], status: [], shared: [], unconsumed: [], cancel: [] };
let sessions = [];
stub('database/mongodb.js', {
  async GetOpenCashSession(_t, registerId = 1) { return sessions.find((s) => (s.registerId ?? 1) === registerId) || null; },
  async GetOrderByClientSaleId() { return null; },
});
stub('database/registers.db.js', {
  async ListRegisters() { return [{ number: 1, name: 'Caja 1', terminalId: null, terminalLabel: null, active: true }]; },
});
stub('middleware/auth.middleware.js', {
  requireAuth: (_q, _s, next) => next(),
  requireActiveSubscription: (_q, _s, next) => next(),
  requireRoles: (...allowed) => (req, res, next) => (allowed.includes(req.user.role) ? next() : res.status(403).send('Sin permiso para esta acción')),
});
stub('services/point.charges.service.js', {
  async startCharge(args) { calls.startCharge.push(args); return { id: 'c1', status: 'pending' }; },
  async unconsumed(_t, opts) { calls.unconsumed.push(opts.registerId); return []; },
  async cancelCharge(_t, id, opts) { calls.cancel.push([id, opts.registerId]); return { status: 'failed', mpStatus: 'canceled' }; },
  async status(tenantId, registerId) { calls.status.push(registerId); return { ok: true }; },
});
stub('services/mercadopago.point.service.js', {
  async setSharedTerminal(tenantId, shared) { calls.shared.push(shared); return { shared }; },
});

const router = require('../routers/point.router');

async function start() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { username: 'u', role: req.get('x-role') || 'cashier' };
    req.tenantId = 'tenant1';
    req.tenant = { plan: 'basic' };
    next();
  });
  app.use('/point', router);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const call = (method, url, body, headers = {}) =>
    new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        { port: server.address().port, method, path: url, headers: { 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}), ...headers } },
        (res) => {
          let text = '';
          res.on('data', (c) => (text += c));
          res.on('end', () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(text); } catch { return text; } })() }));
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  return { call, stop: () => new Promise((r) => server.close(r)) };
}

test('caja por encima del plan con sesión abierta: POST /point/charges responde 403 register_over_plan y no cobra', async () => {
  sessions = [{ registerId: 2, status: 'open', deviceId: 'B' }];
  const w = await start();
  try {
    const r = await w.call('POST', '/point/charges', { clientSaleId: 's1', amount: 10 }, { 'x-register': '2', 'x-device': 'B' });
    assert.equal(r.status, 403);
    assert.equal(r.body.code, 'register_over_plan');
    assert.equal(calls.startCharge.length, 0);
    // la caja 1 sí cobra y el router le pasa su número
    const ok = await w.call('POST', '/point/charges', { clientSaleId: 's2', amount: 10 }, { 'x-register': '1', 'x-device': 'A' });
    assert.equal(ok.status, 201);
    assert.equal(calls.startCharge[0].registerId, 1);
    // leer el estado de una caja fuera del plan no se bloquea
    const st = await w.call('GET', '/point/status', null, { 'x-register': '2' });
    assert.equal(st.status, 200);
    assert.equal(calls.status.pop(), 2);
  } finally { await w.stop(); }
});

test('PUT /point/shared: el cajero recibe 403 y el dueño lo guarda', async () => {
  const w = await start();
  try {
    assert.equal((await w.call('PUT', '/point/shared', { shared: true }, { 'x-role': 'cashier' })).status, 403);
    assert.equal(calls.shared.length, 0);
    const r = await w.call('PUT', '/point/shared', { shared: true }, { 'x-role': 'admin' });
    assert.equal(r.status, 200);
    assert.deepEqual(calls.shared, [true]);
  } finally { await w.stop(); }
});

test('GET /point/unconsumed y POST cancel pasan la caja del encabezado al servicio', async () => {
  sessions = [];
  const w = await start();
  try {
    assert.equal((await w.call('GET', '/point/unconsumed', null, { 'x-register': '1', 'x-device': 'A' })).status, 200);
    assert.equal((await w.call('POST', '/point/charges/c9/cancel', null, { 'x-register': '1', 'x-device': 'A' })).status, 200);
    assert.deepEqual(calls.unconsumed.at(-1), 1);
    assert.deepEqual(calls.cancel.at(-1), ['c9', 1]);
  } finally { await w.stop(); }
});

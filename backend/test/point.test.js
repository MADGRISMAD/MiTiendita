process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
process.env.TOKEN_ENC_KEY = 'ab'.repeat(32);
process.env.OAUTH_STATE_SECRET = 'estado-de-prueba';
process.env.MP_CLIENT_ID = '123';
process.env.MP_CLIENT_SECRET = 'secreto';
process.env.MP_OAUTH_REDIRECT = 'http://localhost:8081/point/oauth/callback';
process.env.MP_WEBHOOK_SECRET = 'whsec';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

/** Base en memoria que sustituye a database/point.db.js */
const store = { tenants: { t1: { id: 't1', point: null }, t2: { id: 't2', point: null } }, charges: [] };
const dbPath = require.resolve('../database/point.db');
const out = (c) => (c ? { ...c } : null);
const fakeDb = {
  async GetTenantById(id) {
    return out(store.tenants[id]);
  },
  async UpdateTenant(id, patch) {
    const t = store.tenants[id];
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'point') t.point = v;
      else if (k.startsWith('point.')) {
        t.point = t.point || {};
        t.point[k.slice(6)] = v;
      } else t[k] = v;
    }
  },
  async ClearTenantPoint(id) {
    delete store.tenants[id].point;
  },
  async CreatePointCharge(doc) {
    const c = { ...doc, tenantId: String(doc.tenantId), id: `c${store.charges.length + 1}` };
    store.charges.push(c);
    return out(c);
  },
  async GetPointCharge(id, tenantId) {
    return out(store.charges.find((c) => c.id === id && c.tenantId === String(tenantId)));
  },
  async GetPointChargeBySale(sale, tenantId) {
    return out([...store.charges].reverse().find((c) => c.clientSaleId === sale && c.tenantId === String(tenantId)));
  },
  async GetPointChargeByMpOrderId(id) {
    return out(store.charges.find((c) => c.mpOrderId === id));
  },
  async UpdatePointCharge(id, patch, tenantId) {
    const c = store.charges.find((x) => x.id === id && x.tenantId === String(tenantId));
    return c ? out(Object.assign(c, patch)) : null;
  },
  async ClaimPointCharge(id, tenantId, sale) {
    const c = store.charges.find((x) => x.id === id && x.tenantId === String(tenantId) && !x.consumedBy);
    return c ? out(Object.assign(c, { consumedBy: sale })) : null;
  },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

const svc = require('../services/mercadopago.point.service');
const charges = require('../services/point.charges.service');

/** fetch simulado de Mercado Pago */
const mp = { orders: {}, terminals: [{ id: 'PAX_A910__SN1', operating_mode: 'PDV' }], calls: [], oauthFails: false, nextOrder: 'ORD1' };
global.fetch = async (url, opts = {}) => {
  const u = String(url).replace('https://api.mercadopago.com', '');
  const body = opts.body ? JSON.parse(opts.body) : null;
  mp.calls.push({ method: opts.method || 'GET', url: u, body, headers: opts.headers });
  const reply = (status, data) => ({ ok: status < 400, status, json: async () => data });
  if (u === '/oauth/token') {
    if (mp.oauthFails) return reply(400, { message: 'invalid_grant' });
    return reply(200, { access_token: 'APP_USR-abc', refresh_token: 'TG-def', user_id: 777, expires_in: 15552000 });
  }
  if (u.startsWith('/terminals/v1/list')) return reply(200, { data: { terminals: mp.terminals } });
  if (u === '/terminals/v1/setup') return reply(200, {});
  if (u === '/v1/orders' && opts.method === 'POST') {
    mp.orders[mp.nextOrder] = { id: mp.nextOrder, status: 'created', transactions: { payments: [{ amount: body.transactions.payments[0].amount }] } };
    return reply(201, mp.orders[mp.nextOrder]);
  }
  const m = /^\/v1\/orders\/([^/]+)(\/cancel)?$/.exec(u);
  if (m) {
    const order = mp.orders[m[1]];
    if (!order) return reply(404, { message: 'not found' });
    if (m[2]) {
      if (order.status === 'processed') return reply(409, { message: 'already paid' });
      order.status = 'canceled';
    }
    return reply(200, order);
  }
  return reply(404, { message: `sin mock ${u}` });
};

function connect(tenantId = 't1') {
  return svc.handleOAuthCallback({ code: 'xyz', state: new URL(svc.buildAuthUrl(tenantId)).searchParams.get('state') });
}
async function ready(tenantId = 't1') {
  await connect(tenantId);
  await svc.registerTerminal(tenantId, 'PAX_A910__SN1');
}

test('conectar: el state firma la tienda y los tokens se guardan cifrados', async () => {
  await connect('t1');
  const p = store.tenants.t1.point;
  assert.equal(p.status, 'connected');
  assert.equal(p.mpUserId, '777');
  assert.ok(!p.accessToken.includes('APP_USR'), 'el token no debe guardarse en claro');
  assert.equal(svc.decrypt(p.accessToken), 'APP_USR-abc');
  assert.equal(svc.decrypt(p.refreshToken), 'TG-def');
});

test('state alterado o caducado se rechaza', async () => {
  const state = new URL(svc.buildAuthUrl('t1')).searchParams.get('state');
  const [tenant, nonce, sig] = state.split('.');
  assert.throws(() => svc.parseState(`t2.${nonce}.${sig}`), /state inválido/);
  assert.throws(() => svc.parseState(`${tenant}.${nonce}.${'0'.repeat(sig.length)}`), /state inválido/);
  const old = (Date.now() - 20 * 60 * 1000).toString(36) + 'a1b2c3d4e5f6';
  const oldSig = crypto.createHmac('sha256', process.env.OAUTH_STATE_SECRET).update(`t1.${old}`).digest('hex');
  assert.throws(() => svc.parseState(`t1.${old}.${oldSig}`), /caducó/);
  assert.equal(svc.parseState(state), 't1');
});

test('registrar terminal: solo una que pertenezca a la cuenta; la deja en modo PDV', async () => {
  await connect('t1');
  await assert.rejects(svc.registerTerminal('t1', 'OTRA'), (e) => e.status === 404);
  mp.terminals = [{ id: 'PAX_A910__SN1', operating_mode: 'STANDALONE' }];
  await svc.registerTerminal('t1', 'PAX_A910__SN1');
  const setup = mp.calls.filter((c) => c.url === '/terminals/v1/setup').pop();
  assert.equal(setup.body.terminals[0].operating_mode, 'PDV');
  assert.equal(store.tenants.t1.point.status, 'ready');
  mp.terminals = [{ id: 'PAX_A910__SN1', operating_mode: 'PDV' }];
});

test('status: sin conectar, conectada sin terminal, lista, y terminal que desaparece', async () => {
  store.tenants.t2.point = null;
  assert.equal((await charges.status('t2')).code, 'not_connected');
  await connect('t2');
  assert.equal((await charges.status('t2')).code, 'no_terminal');
  await ready('t1');
  const ok = await charges.status('t1');
  assert.equal(ok.ok, true);
  mp.terminals = [];
  const gone = await charges.status('t1');
  assert.equal(gone.ok, false);
  assert.equal(gone.code, 'terminal_missing');
  mp.terminals = [{ id: 'PAX_A910__SN1', operating_mode: 'PDV' }];
});

test('cobro: se crea en la terminal, es idempotente y al pagarse queda listo para una sola venta', async () => {
  store.charges.length = 0;
  await ready('t1');
  mp.nextOrder = 'ORD-A';
  const a = await charges.startCharge({ tenantId: 't1', clientSaleId: 'sale-0001', amount: 125.5 });
  assert.equal(a.status, 'pending');
  const post = mp.calls.filter((c) => c.url === '/v1/orders' && c.method === 'POST').pop();
  assert.equal(post.body.transactions.payments[0].amount, '125.50');
  assert.equal(post.body.config.point.terminal_id, 'PAX_A910__SN1');
  assert.ok(post.headers['X-Idempotency-Key']);

  const again = await charges.startCharge({ tenantId: 't1', clientSaleId: 'sale-0001', amount: 125.5 });
  assert.equal(again.id, a.id, 'mismo cobro pendiente: no se duplica');

  await assert.rejects(charges.consumeCharge('t1', a.id, { clientSaleId: 'sale-0001', total: 125.5 }), (e) => e.code === 'charge_not_paid');

  mp.orders['ORD-A'].status = 'processed';
  mp.orders['ORD-A'].transactions.payments[0].paid_amount = '125.50';
  const synced = await charges.syncCharge('t1', a.id);
  assert.equal(synced.status, 'paid');

  await assert.rejects(charges.consumeCharge('t1', a.id, { clientSaleId: 'sale-0001', total: 99 }), (e) => e.code === 'amount_mismatch');
  await charges.consumeCharge('t1', a.id, { clientSaleId: 'sale-0001', total: 125.5 });
  // reintento de la MISMA venta (venta offline reenviada): vale
  await charges.consumeCharge('t1', a.id, { clientSaleId: 'sale-0001', total: 125.5 });
  // otra venta con el mismo cobro: no
  await assert.rejects(charges.consumeCharge('t1', a.id, { clientSaleId: 'sale-0002', total: 125.5 }), (e) => e.code === 'charge_used');
  // otra tienda no puede usar el cobro
  await assert.rejects(charges.consumeCharge('t2', a.id, { clientSaleId: 'sale-0003', total: 125.5 }), (e) => e.code === 'charge_not_found');
});

test('cobro rechazado o cancelado queda fallido; si pagó justo al cancelar, queda pagado', async () => {
  await ready('t1');
  mp.nextOrder = 'ORD-B';
  const b = await charges.startCharge({ tenantId: 't1', clientSaleId: 'sale-0010', amount: 50 });
  const cancelled = await charges.cancelCharge('t1', b.id);
  assert.equal(cancelled.status, 'failed');

  mp.nextOrder = 'ORD-C';
  const c = await charges.startCharge({ tenantId: 't1', clientSaleId: 'sale-0011', amount: 80 });
  mp.orders['ORD-C'].status = 'processed';
  mp.orders['ORD-C'].transactions.payments[0].paid_amount = '80.00';
  const raced = await charges.cancelCharge('t1', c.id);
  assert.equal(raced.status, 'paid');
});

test('si MP aprueba un monto distinto, el cobro queda en revisión y no se puede usar', async () => {
  await ready('t1');
  mp.nextOrder = 'ORD-D';
  const d = await charges.startCharge({ tenantId: 't1', clientSaleId: 'sale-0020', amount: 100 });
  mp.orders['ORD-D'].status = 'processed';
  mp.orders['ORD-D'].transactions.payments[0].paid_amount = '10.00';
  assert.equal((await charges.syncCharge('t1', d.id)).status, 'review');
  await assert.rejects(charges.consumeCharge('t1', d.id, { clientSaleId: 'sale-0020', total: 100 }), (e) => e.code === 'charge_not_paid');
});

test('sin cuenta o sin terminal no se puede iniciar un cobro', async () => {
  store.tenants.t2.point = null;
  await assert.rejects(charges.startCharge({ tenantId: 't2', clientSaleId: 'sale-0030', amount: 10 }), (e) => e.code === 'not_connected');
  await assert.rejects(charges.startCharge({ tenantId: 't1', clientSaleId: 'sale-0031', amount: 0 }), (e) => e.status === 400);
});

test('token revocado: marca la tienda como desconectada y pide reconectar', async () => {
  await ready('t1');
  store.tenants.t1.point.tokenExpiresAt = new Date(Date.now() + 1000); // por vencer → intenta renovar
  mp.oauthFails = true;
  await assert.rejects(svc.listTerminals('t1'), (e) => e.code === 'token_revoked');
  mp.oauthFails = false;
  assert.equal(store.tenants.t1.point.status, 'disconnected');
});

test('webhook: firma válida pasa, alterada no', () => {
  const id = 'ORD-A';
  const ts = '1700000000';
  const sig = crypto.createHmac('sha256', 'whsec').update(`id:${id.toLowerCase()};request-id:req-1;ts:${ts};`).digest('hex');
  const req = (v1) => ({ headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' }, query: { 'data.id': id }, body: {} });
  assert.equal(svc.verifyWebhookSignature(req(sig)), true);
  assert.equal(svc.verifyWebhookSignature(req('0'.repeat(64))), false);
  assert.equal(svc.verifyWebhookSignature({ headers: {}, query: {}, body: {} }), false);
});

test('desvincular borra la conexión', async () => {
  await ready('t1');
  await charges.disconnect('t1');
  assert.equal(store.tenants.t1.point, undefined);
});

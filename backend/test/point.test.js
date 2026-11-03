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
  async ListPointChargesSince(tenantId, since) {
    return store.charges
      .filter((c) => c.tenantId === String(tenantId) && ['pending', 'paid', 'review'].includes(c.status) && new Date(c.createdAt) >= since)
      .map(out);
  },
  async ReleasePointCharge(id, tenantId, sale) {
    const c = store.charges.find((x) => x.id === id && x.tenantId === String(tenantId) && x.consumedBy === sale);
    if (c) c.consumedBy = null;
  },
  async FindPaidSaleIds(_tenantId, ids) {
    return ids.filter((i) => (store.sales || []).includes(i));
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
  const rf = /^\/v1\/orders\/([^/]+)\/refund$/.exec(u);
  if (rf) {
    if (mp.refundFails) return reply(400, { message: 'insufficient funds' });
    if (mp.orders[rf[1]]) mp.orders[rf[1]].status = 'refunded';
    return reply(200, mp.orders[rf[1]] || {});
  }
  const m = /^\/v1\/orders\/([^/]+)(\/cancel)?$/.exec(u);
  if (m) {
    const order = mp.orders[m[1]];
    if (!order) return reply(404, { message: 'not found' });
    if (m[2]) {
      if (order.status === 'processed') return reply(409, { message: 'already paid' });
      if (order.status === 'at_terminal') return reply(409, { message: 'cannot_cancel_order: la terminal ya muestra el cobro' });
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
  // otra venta con el mismo cobro: no (mientras la primera venta exista)
  store.sales = ['sale-0001'];
  await assert.rejects(charges.consumeCharge('t1', a.id, { clientSaleId: 'sale-0002', total: 125.5 }), (e) => e.code === 'charge_used');
  store.sales = [];
  // otra tienda no puede usar el cobro
  await assert.rejects(charges.consumeCharge('t2', a.id, { clientSaleId: 'sale-0003', total: 125.5 }), (e) => e.code === 'charge_not_found');
});

test('devolver: reembolsa en MP una sola vez y si MP rechaza no queda marcado', async () => {
  store.charges.length = 0;
  await ready('t1');
  mp.nextOrder = 'ORD-R';
  const a = await charges.startCharge({ tenantId: 't1', clientSaleId: 'sale-r1', amount: 8 });
  mp.orders['ORD-R'].status = 'processed';
  mp.orders['ORD-R'].transactions.payments[0].paid_amount = '8.00';
  await charges.syncCharge('t1', a.id);

  mp.refundFails = true;
  await assert.rejects(charges.refundCharge('t1', a.id), (e) => /Mercado Pago no pudo devolver/.test(e.message));
  assert.equal(store.charges.find((c) => c.id === a.id).refundedAt, undefined);

  mp.refundFails = false;
  await charges.refundCharge('t1', a.id);
  await charges.refundCharge('t1', a.id);
  assert.equal(mp.calls.filter((c) => c.url === '/v1/orders/ORD-R/refund' && c.method === 'POST').length, 2, 'uno rechazado + uno aceptado; el tercero no llama');
  assert.ok(store.charges.find((c) => c.id === a.id).refundedAt);
  await assert.rejects(charges.refundCharge('t2', a.id), (e) => e.code === 'charge_not_found');
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


const ago = (ms) => new Date(Date.now() - ms);
const addCharge = (extra) => {
  const c = { id: `c${store.charges.length + 1}`, tenantId: 't1', clientSaleId: `S${store.charges.length + 1}`, amount: 50, status: 'pending', consumedBy: null, createdAt: new Date(), ...extra };
  store.charges.push(c);
  return c;
};

test('terminal ocupada: un cobro anterior que la terminal ya muestra bloquea el siguiente y dice qué hacer', async () => {
  store.charges.length = 0;
  mp.orders = {};
  await ready('t1');
  addCharge({ mpOrderId: 'ATT1', clientSaleId: 'VIEJA', amount: 120.5, createdAt: ago(4 * 60000) });
  mp.orders.ATT1 = { id: 'ATT1', status: 'at_terminal', transactions: { payments: [{ amount: '120.50' }] } };
  await assert.rejects(
    charges.startCharge({ tenantId: 't1', clientSaleId: 'NUEVA', amount: 80 }),
    (e) => e.code === 'terminal_busy' && /120\.50/.test(e.message) && /Servicios|Ajustes/.test(e.message)
  );
  assert.equal(store.charges.find((c) => c.clientSaleId === 'NUEVA'), undefined, 'no se manda un cobro nuevo mientras la terminal siga ocupada');
});

test('terminal ocupada: un cobro anterior que aún no llega a la pantalla se cancela solo y el nuevo sí sale', async () => {
  store.charges.length = 0;
  mp.orders = {};
  mp.nextOrder = 'ORD_NEW';
  await ready('t1');
  addCharge({ mpOrderId: 'CRE1', clientSaleId: 'VIEJA', createdAt: ago(2 * 60000) });
  mp.orders.CRE1 = { id: 'CRE1', status: 'created', transactions: { payments: [{ amount: '50.00' }] } };
  const started = await charges.startCharge({ tenantId: 't1', clientSaleId: 'NUEVA', amount: 80 });
  assert.equal(started.status, 'pending');
  assert.equal(store.charges.find((c) => c.clientSaleId === 'VIEJA').status, 'failed');
});

test('«action_required» de Mercado Pago queda en revisión (no se da por pagado ni por fallido)', async () => {
  store.charges.length = 0;
  mp.orders = {};
  await ready('t1');
  const c = addCharge({ mpOrderId: 'ACT1', amount: 70 });
  mp.orders.ACT1 = { id: 'ACT1', status: 'action_required', transactions: { payments: [{ amount: '70.00' }] } };
  const r = await charges.syncCharge('t1', c.id);
  assert.equal(r.status, 'review');
  assert.equal(r.reviewReason, 'action_required');
});

test('cobros aprobados sin venta: nunca usados, usados en una venta que ya no existe, y los que sí tienen venta no salen', async () => {
  store.charges.length = 0;
  store.sales = ['VENTA_OK'];
  const old = ago(60 * 60000);
  addCharge({ clientSaleId: 'A', status: 'paid', amount: 10, paidAt: old, mpOrderId: 'o1' });
  addCharge({ clientSaleId: 'B', status: 'paid', amount: 20, paidAt: old, consumedBy: 'VENTA_PERDIDA', mpOrderId: 'o2' });
  addCharge({ clientSaleId: 'C', status: 'paid', amount: 30, paidAt: old, consumedBy: 'VENTA_OK', mpOrderId: 'o3' });
  addCharge({ clientSaleId: 'D', status: 'paid', amount: 40, paidAt: old, refundedAt: new Date(), mpOrderId: 'o4' });
  addCharge({ clientSaleId: 'E', status: 'paid', amount: 50, paidAt: new Date(), mpOrderId: 'o5' }); // recién aprobado: todavía se está registrando
  addCharge({ clientSaleId: 'F', status: 'review', amount: 60, paidAt: old, reviewReason: 'amount', mpOrderId: 'o6' });
  const list = await charges.unconsumed('t1');
  assert.deepEqual(list.map((c) => [c.amount, c.reason]).sort((a, b) => a[0] - b[0]), [[10, 'no_sale'], [20, 'lost_sale'], [60, 'review']]);
  store.sales = [];
});

test('si la venta no se guarda, el cobro se libera y el reintento con la misma venta lo reutiliza (no cobra dos veces)', async () => {
  store.charges.length = 0;
  mp.orders = {};
  await ready('t1');
  const c = addCharge({ clientSaleId: 'VENTA1', status: 'paid', amount: 90, mpOrderId: 'o9' });
  await charges.consumeCharge('t1', c.id, { clientSaleId: 'VENTA1', total: 90 });
  assert.equal(store.charges[0].consumedBy, 'VENTA1');
  await charges.releaseCharge('t1', c.id, 'VENTA1');
  assert.equal(store.charges[0].consumedBy, null);
  const posts = () => mp.calls.filter((x) => x.url === '/v1/orders' && x.method === 'POST').length;
  const before = posts();
  const again = await charges.startCharge({ tenantId: 't1', clientSaleId: 'VENTA1', amount: 90 });
  assert.deepEqual(again, { id: c.id, status: 'paid' });
  assert.equal(posts(), before, 'no se creó otra orden en la terminal');
});

test('un cobro usado por una venta que ya no existe se puede usar en una venta nueva; si la venta existe, sigue bloqueado', async () => {
  store.charges.length = 0;
  store.sales = ['VENTA_REAL'];
  const huerfano = addCharge({ clientSaleId: 'X1', status: 'paid', amount: 70, consumedBy: 'VENTA_BORRADA', mpOrderId: 'oa' });
  const claimed = await charges.consumeCharge('t1', huerfano.id, { clientSaleId: 'VENTA_NUEVA', total: 70 });
  assert.equal(claimed.consumedBy, 'VENTA_NUEVA');
  const usado = addCharge({ clientSaleId: 'X2', status: 'paid', amount: 70, consumedBy: 'VENTA_REAL', mpOrderId: 'ob' });
  await assert.rejects(charges.consumeCharge('t1', usado.id, { clientSaleId: 'OTRA', total: 70 }), (e) => e.code === 'charge_used');
  store.sales = [];
});

test('pago aprobado en la transacción con la orden aún en «at_terminal»: solo cuenta si el monto es exacto y se sostiene en una segunda revisión', async () => {
  store.charges.length = 0;
  mp.orders = {};
  await ready('t1');
  const c = addCharge({ mpOrderId: 'APR1', amount: 85 });
  mp.orders.APR1 = { id: 'APR1', status: 'at_terminal', transactions: { payments: [{ amount: '85.00', paid_amount: '85.00', status: 'approved' }] } };
  // primera vez: se anota, todavía no se da por pagado
  assert.equal((await charges.syncCharge('t1', c.id)).status, 'pending');
  assert.ok(store.charges[0].approvedSeenAt);
  // muy pronto después: sigue pendiente
  assert.equal((await charges.syncCharge('t1', c.id)).status, 'pending');
  // pasados unos segundos y todavía aprobado: pagado
  store.charges[0].approvedSeenAt = ago(10_000);
  assert.equal((await charges.syncCharge('t1', c.id)).status, 'paid');
});

test('pago «aprobado» que no se sostiene, de otro monto o con la orden fallida no se da por pagado', async () => {
  store.charges.length = 0;
  mp.orders = {};
  await ready('t1');
  // se cae antes de la segunda revisión
  const a = addCharge({ mpOrderId: 'APR2', amount: 40 });
  mp.orders.APR2 = { id: 'APR2', status: 'at_terminal', transactions: { payments: [{ amount: '40.00', paid_amount: '40.00', status: 'approved' }] } };
  await charges.syncCharge('t1', a.id);
  mp.orders.APR2.transactions.payments[0].status = 'created';
  store.charges[0].approvedSeenAt = ago(10_000);
  assert.equal((await charges.syncCharge('t1', a.id)).status, 'pending');
  assert.equal(store.charges[0].approvedSeenAt, null, 'el «aprobado» descartado no se arrastra');
  // monto distinto: nunca por esta vía
  const b = addCharge({ mpOrderId: 'APR3', amount: 40 });
  mp.orders.APR3 = { id: 'APR3', status: 'at_terminal', transactions: { payments: [{ amount: '55.00', paid_amount: '55.00', status: 'approved' }] } };
  store.charges[1].approvedSeenAt = ago(10_000);
  assert.equal((await charges.syncCharge('t1', b.id)).status, 'pending');
  // la orden terminó fallida aunque el pago diga aprobado: manda la orden
  const d = addCharge({ mpOrderId: 'APR4', amount: 40 });
  mp.orders.APR4 = { id: 'APR4', status: 'failed', transactions: { payments: [{ amount: '40.00', paid_amount: '40.00', status: 'approved' }] } };
  assert.equal((await charges.syncCharge('t1', d.id)).status, 'failed');
});

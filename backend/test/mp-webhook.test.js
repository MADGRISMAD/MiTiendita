const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { verifyMpSignature, signedDataId } = require('../utils/mp-signature');

const SECRET = 'clave-de-prueba';
const sign = (manifest, secret = SECRET) => crypto.createHmac('sha256', secret).update(manifest).digest('hex');

function signed({ id = '123456', requestId = 'req-1', tsSec = Math.floor(Date.now() / 1000), secret = SECRET } = {}) {
  const v1 = sign(`id:${id};request-id:${requestId};ts:${tsSec};`, secret);
  return {
    headers: { 'x-signature': `ts=${tsSec},v1=${v1}`, 'x-request-id': requestId },
    query: { 'data.id': id, type: 'subscription_preapproval' },
    body: { type: 'subscription_preapproval', data: { id } },
  };
}

test('firma válida', () => {
  assert.deepEqual(verifyMpSignature({ ...signed(), secret: SECRET }), { ok: true });
});

test('firma con otra clave, sin firma, incompleta o vieja: se rechaza', () => {
  assert.equal(verifyMpSignature({ ...signed({ secret: 'otra' }), secret: SECRET }).ok, false);
  const noSig = signed();
  delete noSig.headers['x-signature'];
  assert.equal(verifyMpSignature({ ...noSig, secret: SECRET }).reason, 'sin x-signature');
  assert.equal(verifyMpSignature({ ...signed(), headers: { 'x-signature': 'ts=1' }, secret: SECRET }).ok, false);
  const old = signed({ tsSec: Math.floor(Date.now() / 1000) - 6 * 60 });
  assert.match(verifyMpSignature({ ...old, secret: SECRET }).reason, /ventana/);
  // Cambiar el id firmado invalida la firma
  const tampered = signed();
  tampered.query['data.id'] = '999';
  assert.equal(verifyMpSignature({ ...tampered, secret: SECRET }).ok, false);
});

test('sin clave configurada no se acepta nada', () => {
  assert.equal(verifyMpSignature({ ...signed(), secret: '' }).ok, false);
});

test('id alfanumérico se firma en minúsculas', () => {
  assert.equal(signedDataId({ 'data.id': 'ABC123' }), 'abc123');
  assert.equal(signedDataId({}, { data: { id: 42 } }), '42');
});

// —— El webhook completo, con base de datos y Mercado Pago simulados ——
function loadController() {
  const root = path.join(__dirname, '..');
  const tenant = { id: 't1', plan: 'basic', billingStatus: 'suspended', mpPreapprovalId: '123456' };
  const calls = { updates: [], events: [] };
  const dbStub = {
    GetTenantByMpPreapprovalId: async () => tenant,
    GetTenantById: async () => tenant,
    UpdateTenant: async (id, patch) => {
      calls.updates.push(patch);
      return { ...tenant, ...patch };
    },
    CreateBillingEvent: async (e) => {
      calls.events.push(e);
      return e;
    },
  };
  const mpStub = {
    getPreapproval: async (id) => ({ id, status: 'authorized', external_reference: 't1:basic:month' }),
    mapMpStatusToBilling: (s) => (s === 'authorized' ? 'active' : null),
    planPrice: () => 349,
    hasMpConfig: () => true,
  };
  const stub = (rel, exports) => {
    const file = require.resolve(path.join(root, rel));
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
  };
  stub('database/mongodb.js', dbStub);
  stub('services/mercadopago.service.js', mpStub);
  stub('services/plan-limits.service.js', {});
  stub('utils/mail.utils.js', { safeSend: async () => {}, sendPaymentConfirmedEmail: async () => {}, sendSubscriptionCancelledEmail: async () => {} });
  delete require.cache[require.resolve(path.join(root, 'controllers/billing.controller.js'))];
  return { controller: require('../controllers/billing.controller'), calls };
}

function fakeRes() {
  return {
    code: 0,
    status(c) {
      this.code = c;
      return this;
    },
    json() {
      return this;
    },
  };
}

test('un POST sin firma o con firma falsa no activa ninguna tienda', async () => {
  process.env.MP_WEBHOOK_SECRET = SECRET;
  const { controller, calls } = loadController();
  const bad = signed({ secret: 'atacante' });
  const res = fakeRes();
  await controller.webhook({ headers: bad.headers, query: bad.query, body: bad.body }, res);
  assert.equal(res.code, 401);

  const none = signed();
  const res2 = fakeRes();
  await controller.webhook({ headers: {}, query: none.query, body: none.body }, res2);
  assert.equal(res2.code, 401);

  assert.equal(calls.updates.length, 0, 'billingStatus no cambia');
  assert.equal(calls.events.filter((e) => e.type === 'webhook_rejected').length, 2, 'queda en la bitácora');
});

test('con firma válida sí se aplica', async () => {
  process.env.MP_WEBHOOK_SECRET = SECRET;
  const { controller, calls } = loadController();
  const ok = signed();
  const res = fakeRes();
  await controller.webhook({ headers: ok.headers, query: ok.query, body: ok.body }, res);
  assert.equal(res.code, 200);
  assert.ok(calls.updates.length >= 1);
});

test('en producción sin clave se rechaza todo', async () => {
  delete process.env.MP_WEBHOOK_SECRET;
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { controller, calls } = loadController();
    const ok = signed();
    const res = fakeRes();
    await controller.webhook({ headers: ok.headers, query: ok.query, body: ok.body }, res);
    assert.equal(res.code, 401);
    assert.equal(calls.updates.length, 0);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('en producción el modo de prueba de Mercado Pago está apagado', async () => {
  const prev = process.env.NODE_ENV;
  const prevToken = process.env.MP_ACCESS_TOKEN;
  const file = require.resolve('../services/mercadopago.service');
  delete require.cache[file];
  const mp = require('../services/mercadopago.service');
  try {
    process.env.NODE_ENV = 'production';
    process.env.MP_ACCESS_TOKEN = 'APP_USR-x';
    await assert.rejects(mp.getPreapproval('mock_t1_basic'), { status: 503 });
    delete process.env.MP_ACCESS_TOKEN;
    await assert.rejects(mp.createPreapproval({ plan: 'basic', tenantId: 't1', payerEmail: 'a@b.mx' }), { status: 503 });
    process.env.NODE_ENV = 'development';
    assert.equal((await mp.getPreapproval('mock_t1_basic')).status, 'authorized');
  } finally {
    process.env.NODE_ENV = prev;
    if (prevToken === undefined) delete process.env.MP_ACCESS_TOKEN;
    else process.env.MP_ACCESS_TOKEN = prevToken;
    delete require.cache[file];
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stub = (rel, exports) => {
  const file = require.resolve(path.join(root, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

process.env.SIGNUP_VERIFY = 'off'; // la verificación del correo se prueba en email-verification.test.js

function load({ referrer = null } = {}) {
  const sent = { notices: [], tenants: [], users: [] };
  stub('database/mongodb.js', {
    async CreateTenant(doc) { const t = { id: 'tenant9', ...doc }; sent.tenants.push(t); return t; },
    async CreateBillingEvent() {},
    async CreateSettings() {},
  });
  stub('services/usuario.service.js', {
    async FindUserByUsername(u) { return sent.users.find((x) => x.username === u) || null; },
    async FindUserByEmail() { return null; },
    async CreateUser(u) { sent.users.push(u); },
  });
  stub('services/session.service.js', { async startSession() { return { token: 'tok' }; } });
  class ReferralError extends Error {}
  stub('services/referral.service.js', { ReferralError, async resolveForSignup() { return referrer; }, referralFields: () => ({}) });
  stub('utils/mail.utils.js', {
    safeSend: async (fn) => fn(),
    sendWelcomeEmail: async () => {},
    sendPasswordResetEmail: async () => {},
    sendSignupNoticeEmail: async (n) => { sent.notices.push(n); },
    hasSmtpConfig: () => true,
  });
  delete require.cache[require.resolve(path.join(root, 'controllers/user.controller.js'))];
  return { controller: require('../controllers/user.controller'), sent };
}

const body = (extra = {}) => ({ name: 'Ana', lastName: 'Ruiz', email: 'ana@tienda.mx', username: 'ana.ruiz', password: 'Una-clave-larga-123', cellphone: '6641234567', businessName: 'Abarrotes <Ana>', ...extra });
const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, append() {}, setHeader() {}, cookie() {} });

test('al registrarse llega un aviso al equipo con el plan que pidió y los datos de la tienda', async () => {
  const { controller, sent } = load();
  const r = res();
  await controller.CreateUser({ body: body({ requestedPlan: 'growth' }), headers: {}, protocol: 'https', get: () => 'mitiendita.test', ip: '1.1.1.1' }, r);
  assert.equal(r.code, 201);
  assert.equal(sent.notices.length, 1);
  const n = sent.notices[0];
  assert.equal(n.requestedPlan, 'Crecimiento');
  assert.equal(n.replyTo, 'ana@tienda.mx');
  assert.match(n.adminUrl, /\/platform\/clientes\/tenant9$/);
  const rows = Object.fromEntries(n.rows.map((x) => [x.label, x.value]));
  assert.equal(rows.Tienda, 'Abarrotes <Ana>');
  assert.match(rows['Plan activado'], /Básico/);
  // el plan pedido se guarda en la tienda y no se cuela a la cuenta de usuario
  assert.equal(sent.tenants[0].requestedPlan, 'growth');
  assert.equal(sent.tenants[0].plan, 'basic');
  assert.equal('requestedPlan' in sent.users[0], false);
});

test('sin plan elegido ("Probar gratis") también avisa, y un plan inventado se rechaza', async () => {
  const { controller, sent } = load();
  const ok = res();
  await controller.CreateUser({ body: body(), headers: {}, protocol: 'https', get: () => 'x', ip: '1.1.1.1' }, ok);
  assert.equal(ok.code, 201);
  assert.equal(sent.notices[0].requestedPlan, '');
  assert.equal('requestedPlan' in sent.tenants[0], false);
  const bad = res();
  await controller.CreateUser({ body: body({ username: 'otro', email: 'o@t.mx', requestedPlan: 'platino' }), headers: {}, protocol: 'https', get: () => 'x', ip: '1.1.1.1' }, bad);
  assert.equal(bad.code, 400);
  assert.equal(sent.notices.length, 1);
});

test('los destinatarios salen de SIGNUP_NOTICE_TO/CC (o DEMO_TO/DEMO_CC) y la copia no repite al destinatario', () => {
  delete require.cache[require.resolve(path.join(root, 'utils/mail.utils.js'))];
  const mail = require('../utils/mail.utils');
  const keep = { ...process.env };
  try {
    for (const k of ['SIGNUP_NOTICE_TO', 'SIGNUP_NOTICE_CC', 'DEMO_TO', 'DEMO_CC', 'SUPPORT_EMAIL', 'SMTP_USER']) delete process.env[k];
    assert.deepEqual(mail.teamRecipients(), { to: '', cc: [] });
    process.env.SMTP_USER = 'envio@mt.mx';
    assert.equal(mail.teamRecipients().to, 'envio@mt.mx');
    process.env.DEMO_TO = 'info@mt.mx';
    process.env.DEMO_CC = 'uno@mt.mx, info@mt.mx; dos@mt.mx';
    assert.deepEqual(mail.teamRecipients(), { to: 'info@mt.mx', cc: ['uno@mt.mx', 'dos@mt.mx'] });
    process.env.SIGNUP_NOTICE_TO = 'aviso@mt.mx';
    assert.equal(mail.teamRecipients().to, 'aviso@mt.mx');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

test('con la verificación activa, sin código del correo no se crea ni la tienda ni la cuenta', async () => {
  delete process.env.SIGNUP_VERIFY;
  try {
    const { controller, sent } = load();
    const r = res();
    await controller.CreateUser({ body: body(), headers: {}, protocol: 'https', get: () => 'mitiendita.test', ip: '1.1.1.1' }, r);
    assert.equal(r.code, 400);
    assert.match(r.body, /código/i);
    assert.equal(sent.tenants.length + sent.users.length, 0);
  } finally {
    process.env.SIGNUP_VERIFY = 'off';
  }
});

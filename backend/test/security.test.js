process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const totp = require('../utils/totp');
const secretBox = require('../utils/secret-box');
const { rateLimit, memoryStore } = require('../services/rate-limit.service');
const { securityHeaders } = require('../middleware/security.middleware');
const backendPolicy = require('../utils/password-policy');

// —— TOTP (vectores del RFC 6238 con SHA-1, recortados a 6 dígitos) ——
test('TOTP coincide con el RFC 6238', () => {
  const secret = totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp.codeAt(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totp.codeAt(secret, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totp.codeAt(secret, Math.floor(1234567890 / 30)), '005924');
  assert.equal(totp.codeAt(secret, Math.floor(2000000000 / 30)), '279037');
});

test('TOTP acepta ±30 s y no deja reusar el mismo código', () => {
  const secret = totp.generateSecret();
  const now = Date.now();
  const step = totp.stepAt(now);
  const code = totp.codeAt(secret, step);
  assert.equal(totp.verifyTotp(secret, code, { now }), step);
  assert.equal(totp.verifyTotp(secret, totp.codeAt(secret, step - 1), { now }), step - 1);
  assert.equal(totp.verifyTotp(secret, totp.codeAt(secret, step - 3), { now }), null);
  assert.equal(totp.verifyTotp(secret, code, { now, lastStep: step }), null, 'ya usado');
  assert.equal(totp.verifyTotp(secret, 'abcdef', { now }), null);
  assert.match(totp.otpauthUrl({ secret, account: 'a@b.mx' }), /^otpauth:\/\/totp\/Mi%20Tiendita%3Aa%40b\.mx\?secret=/);
});

test('códigos de respaldo: 8, distintos, hash sin guiones ni mayúsculas', () => {
  const codes = totp.generateRecoveryCodes();
  assert.equal(new Set(codes).size, 8);
  assert.match(codes[0], /^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  assert.equal(totp.hashRecoveryCode(codes[0]), totp.hashRecoveryCode(codes[0].toLowerCase().replace('-', '')));
});

test('el secreto de 2FA se guarda cifrado y no se puede alterar', () => {
  const sealed = secretBox.seal('JBSWY3DPEHPK3PXP');
  assert.ok(!sealed.includes('JBSWY3DPEHPK3PXP'));
  assert.equal(secretBox.open(sealed), 'JBSWY3DPEHPK3PXP');
  const parts = sealed.split('.');
  parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('AA') ? 'BB' : 'AA');
  assert.equal(secretBox.open(parts.join('.')), null);
});

// —— Contraseñas ——
let frontPolicy;
test.before(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/passwordPolicy.js'), 'utf8');
  frontPolicy = await import(`data:text/javascript,${encodeURIComponent(src)}`);
});

test('contraseñas: mínimo 10, no de las filtradas, no secuencias ni tu correo', () => {
  const cases = [
    ['corta123', false],
    ['contraseña123', false],
    ['Password123', false],
    ['1234567890', false],
    ['qwertyuiop', false],
    ['aaaaaaaaaaaa', false],
    ['lupita.perez', false, { email: 'lupita.perez@gmail.com' }],
    ['mi tienda abre a las 7', true],
    ['Tlapaleria#Centro2026', true],
  ];
  for (const [pw, ok, about] of cases) {
    const back = backendPolicy.passwordProblem(pw, about);
    const front = frontPolicy.passwordProblem(pw, about);
    assert.equal(back === '', ok, `${pw}: ${back}`);
    assert.equal(front, back, `frontend = backend para ${pw}`);
  }
});

// —— Límite de peticiones ——
function fakeRes() {
  return {
    code: 200,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.code = c;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
  };
}

test('límite por IP: deja pasar hasta el máximo y luego responde 429', async () => {
  const mw = rateLimit({ name: 't', windowMs: 60000, max: 3, store: memoryStore() });
  const results = [];
  for (let i = 0; i < 5; i++) {
    const res = fakeRes();
    let passed = false;
    await mw({ ip: '1.2.3.4', headers: {} }, res, () => (passed = true));
    results.push(passed ? 200 : res.code);
  }
  assert.deepEqual(results, [200, 200, 200, 429, 429]);
  const other = fakeRes();
  let passed = false;
  await mw({ ip: '5.6.7.8', headers: {} }, other, () => (passed = true));
  assert.ok(passed, 'otra IP tiene su propio conteo');
});

test('si el almacén falla, el límite no tumba la app', async () => {
  const broken = { hit: async () => { throw new Error('db caída'); } };
  const mw = rateLimit({ name: 'x', windowMs: 60000, max: 2, store: broken });
  let passed = false;
  await mw({ ip: '9.9.9.9', headers: {} }, fakeRes(), () => (passed = true));
  assert.ok(passed);
});

test('cabeceras de seguridad', () => {
  const res = fakeRes();
  securityHeaders({ secure: true }, res, () => {});
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.headers['X-Frame-Options'], 'DENY');
  assert.match(res.headers['Strict-Transport-Security'], /max-age=31536000/);
  assert.match(res.headers['Content-Security-Policy'], /frame-ancestors 'none'/);
});

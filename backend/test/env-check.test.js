const test = require('node:test');
const assert = require('node:assert/strict');
const { checkEnv, assertEnv, isWeakSecret } = require('../utils/env-check');

const STRONG = 'a'.repeat(40);
const silent = { warn() {}, error() {} };

test('clave débil: corta o de ejemplo', () => {
  assert.equal(isWeakSecret('change-me-in-production'), true);
  assert.equal(isWeakSecret('corta'), true);
  assert.equal(isWeakSecret(STRONG), false);
});

test('falta SECRET_KEY o DATABASE_URI: error; clave débil: solo aviso', () => {
  assert.equal(checkEnv({}).errors.length, 2);
  const r = checkEnv({ SECRET_KEY: 'cambia-esta-clave', DATABASE_URI: 'mongodb://x' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(checkEnv({ SECRET_KEY: STRONG, DATABASE_URI: 'mongodb://x' }), { errors: [], warnings: [] });
});

test('con la terminal Mercado Pago configurada avisa si faltan las llaves de cifrado (sin tumbar la API)', () => {
  const base = { SECRET_KEY: STRONG, DATABASE_URI: 'mongodb://x', MP_CLIENT_ID: '123' };
  assert.deepEqual([checkEnv(base).errors.length, checkEnv(base).warnings.length], [0, 2]);
  assert.equal(checkEnv({ ...base, TOKEN_ENC_KEY: 'k', OAUTH_STATE_SECRET: 's' }).warnings.length, 0);
});

test('assertEnv: fuera de producción no hace nada; en producción aborta si falta y avisa si es débil', () => {
  assert.doesNotThrow(() => assertEnv({}, silent));
  assert.throws(() => assertEnv({ NODE_ENV: 'production' }, silent), /incompleta/);
  assert.doesNotThrow(() => assertEnv({ NODE_ENV: 'production', SECRET_KEY: 'corta', DATABASE_URI: 'x' }, silent));
  assert.throws(() => assertEnv({ NODE_ENV: 'production', SECRET_KEY: 'corta', DATABASE_URI: 'x', REQUIRE_STRONG_SECRETS: '1' }, silent), /incompleta/);
});

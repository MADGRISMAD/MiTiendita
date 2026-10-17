const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const core = require('../services/desktop-license.core');

const mac = (info) => ({ uuid: 'A1B2C3D4-0000-1111-2222-333344445555', serial: 'C02XK1ABCDEF', macs: ['3c:22:fb:12:34:56'], hostname: 'Caja-1', model: 'MacBookPro18,3', os: 'macOS', ...info });

test('códigos: formato, normalización (O→0, I/L→1) y rechazo de inválidos', () => {
  const code = core.generateCode();
  assert.match(code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
  const n = core.normalizeCode(code.toLowerCase().replace(/-/g, ' '));
  assert.equal(n, code.replace(/-/g, ''));
  assert.equal(core.normalizeCode('OOOO-IIII-LLLL-0000-1111'), '00001111111100001111');
  assert.equal(core.normalizeCode('ABC'), null);
  assert.equal(core.normalizeCode('UUUU-UUUU-UUUU-UUUU-UUUU'), null, 'U no es Crockford');
  assert.notEqual(core.generateCode(), core.generateCode());
});

test('huella: tolera cambiar la tarjeta de red, rechaza otra computadora y valores genéricos', () => {
  const base = core.fingerprintFrom(mac());
  assert.ok(core.fingerprintUsable(base));
  assert.ok(core.deviceMatches(base, core.fingerprintFrom(mac({ hostname: 'otro-nombre', os: 'macOS 16' }))));
  assert.ok(core.deviceMatches(base, core.fingerprintFrom(mac({ macs: ['3c:22:fb:12:34:56', '10:20:30:40:50:60'] }))));
  assert.ok(core.deviceMatches(base, core.fingerprintFrom(mac({ macs: ['10:20:30:40:50:60'] }))), 'otra MAC pero mismo UUID y serie');
  assert.ok(!core.deviceMatches(base, core.fingerprintFrom(mac({ uuid: 'FFFFFFFF-1111-2222-3333-444455556666', serial: 'OTRASERIE123' }))), 'otro equipo con la misma MAC');
  assert.ok(!core.deviceMatches(base, core.fingerprintFrom(mac({ uuid: 'FFFFFFFF-1111-2222-3333-444455556666', macs: ['10:20:30:40:50:60'] }))), 'solo coincide la serie');
  const generic = core.fingerprintFrom({ uuid: '00000000-0000-0000-0000-000000000000', serial: 'To be filled by O.E.M.', macs: ['02:00:00:00:00:01'] });
  assert.ok(!core.fingerprintUsable(generic), 'UUID cero, serie genérica y MAC virtual no cuentan');
  assert.deepEqual(core.publicDevice(mac()).macs, ['3c:22:fb:12:34:56']);
  assert.equal(core.publicDevice(mac()).uuid, undefined, 'el UUID no viaja en claro');
});

test('firma: válida, adulterada y con otra clave', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pub = publicKey.export({ type: 'spki', format: 'pem' });
  const payload = { v: 1, product: core.PRODUCT, licenseId: 'x', fingerprint: core.fingerprintFrom(mac()) };
  const env = core.signEnvelope(payload, priv);
  assert.equal(core.verifyEnvelope(env, pub).licenseId, 'x');
  const tampered = { ...env, payload: Buffer.from(JSON.stringify({ ...payload, licenseId: 'y' })).toString('base64url') };
  assert.equal(core.verifyEnvelope(tampered, pub), null);
  const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
  assert.equal(core.verifyEnvelope(env, other), null);
  assert.equal(core.verifyEnvelope({}, pub), null);
});


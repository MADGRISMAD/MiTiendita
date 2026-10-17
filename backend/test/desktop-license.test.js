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

// ── Servicio contra un MongoDB real temporal (se salta si no hay mongod) ──
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const hasMongod = spawnSync('mongod', ['--version']).status === 0;
// La conexión de Mongo deja temporizadores vivos: al terminar todas las pruebas se cierra el proceso
test.after(() => setTimeout(() => process.exit(0), 200));

test('servicio: activar, reintento idéntico, otra computadora, carrera, liberar y revocar', { skip: !hasMongod && 'sin mongod' }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lic-'));
  const port = 27000 + Math.floor(Math.random() * 900);
  const proc = spawn('mongod', ['--dbpath', dir, '--port', String(port), '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore' });
  t.after(() => proc.kill('SIGTERM'));
  process.env.DATABASE_URI = `mongodb://127.0.0.1:${port}`;
  process.env.DATABASE_NAME = 'mt_licencias_test';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  process.env.DESKTOP_LICENSE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const pub = publicKey.export({ type: 'spki', format: 'pem' });
  const db = require('../database/mongodb');
  for (let i = 0; i < 60; i++) {
    try {
      await db.ensureConnection();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const svc = require('../services/desktop-license.service');

  const { code, license } = await svc.create({ ownerName: 'Ana', email: 'Ana@Tienda.mx', businessName: 'Abarrotes Ana' }, 'admin');
  assert.equal(license.status, 'issued');
  const body = { code, email: 'ana@tienda.mx', ownerName: 'Ana', businessName: 'Abarrotes Ana', device: mac(), appVersion: '1.0.0' };

  await assert.rejects(() => svc.activate({ ...body, email: 'otro@x.mx' }), (e) => e.code === 'LICENSE_UNAVAILABLE', 'correo distinto');
  await assert.rejects(() => svc.activate({ ...body, code: core.generateCode() }), (e) => e.code === 'LICENSE_UNAVAILABLE', 'código que no existe');

  const first = await svc.activate(body, { ip: '1.2.3.4' });
  const lic = core.verifyEnvelope(first.envelope, pub);
  assert.equal(lic.licenseId, license.id);
  assert.ok(core.deviceMatches(lic.fingerprint, core.fingerprintFrom(mac())));

  const again = await svc.activate({ ...body, device: mac({ macs: ['10:20:30:40:50:60'] }) });
  assert.deepEqual(again.envelope, first.envelope, 'misma computadora: la misma licencia');
  await assert.rejects(() => svc.activate({ ...body, device: mac({ uuid: 'FFFFFFFF-1111-2222-3333-444455556666', serial: 'OTRASERIE123' }) }), (e) => e.code === 'LICENSE_DEVICE_MISMATCH');

  const d = await svc.detail(license.id);
  assert.equal(d.status, 'active');
  assert.equal(d.activation.device.hostname, 'Caja-1');
  assert.deepEqual(d.activation.device.macs, ['3c:22:fb:12:34:56']);
  assert.ok(d.attempts.some((a) => a.result === 'other_device'));

  // Carrera: dos computadoras distintas activan el mismo código a la vez → solo una gana
  const race = await svc.create({ email: '' }, 'admin');
  const pcA = { code: race.code, device: mac({ uuid: 'AAAAAAAA-1111-2222-3333-444455556666', serial: 'SERIEAAAA', macs: ['aa:bb:cc:00:00:01'] }) };
  const pcB = { code: race.code, device: mac({ uuid: 'BBBBBBBB-1111-2222-3333-444455556666', serial: 'SERIEBBBB', macs: ['aa:bb:cc:00:00:02'] }) };
  const results = await Promise.allSettled([svc.activate(pcA), svc.activate(pcB)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'LICENSE_DEVICE_MISMATCH');

  // Liberar: el código viejo deja de servir y el nuevo activa otra computadora
  const rel = await svc.release(license.id, 'Cambió de computadora', 'admin');
  assert.notEqual(rel.code, code);
  await assert.rejects(() => svc.activate(body), (e) => e.code === 'LICENSE_UNAVAILABLE');
  const moved = await svc.activate({ ...body, code: rel.code, device: mac({ uuid: 'CCCCCCCC-1111-2222-3333-444455556666', serial: 'NUEVA12345' }) });
  assert.equal(core.verifyEnvelope(moved.envelope, pub).generation, 2);
  assert.equal((await svc.detail(license.id)).history.length, 1);
  assert.equal((await svc.detail(license.id)).history[0].envelope, undefined);

  await svc.revoke(license.id, 'Fraude', 'admin');
  await assert.rejects(() => svc.activate({ ...body, code: rel.code }), (e) => e.code === 'LICENSE_UNAVAILABLE');
  assert.equal((await svc.list({ status: 'revoked' })).length, 1);
  assert.equal((await svc.list({ q: 'abarrotes ana' })).length, 1);
});

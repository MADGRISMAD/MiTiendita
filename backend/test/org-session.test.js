process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');

/* ───── Base simulada: usuarios y sesiones ───── */
const users = [
  { _id: 'u1', username: 'lupita', role: 'admin', tenantId: 'matriz', tokenVersion: 0 },
  { _id: 'u2', username: 'sucursal-1', role: 'admin', tenantId: 'centro', tokenVersion: 0, linkedOwner: 'lupita' },
  { _id: 'u3', username: 'normal', role: 'admin', tenantId: 'otra', tokenVersion: 0 },
];
const sessionsDb = [];
const byName = (n) => users.find((u) => u.username === n) || null;
const dbStub = {
  async FindUserByUsername(n) { return byName(n); },
  async FindUserById(id) { return users.find((u) => String(u._id) === String(id)) || null; },
  async CreateSession(s) { sessionsDb.push({ ...s }); },
  async RevokeUserSessions(userId, reason) { sessionsDb.filter((s) => s.userId === String(userId)).forEach((s) => { s.revokedAt = new Date(); s.revokedReason = reason; }); },
  async BumpUserTokenVersion(id) { const u = users.find((x) => String(x._id) === String(id)); u.tokenVersion += 1; return u; },
};
require.cache[require.resolve('../database/mongodb')] = { id: 'm', filename: 'm', loaded: true, exports: dbStub };
require.cache[require.resolve('../database/org.db')] = {
  id: 'o', filename: 'o', loaded: true,
  exports: { async listLinkedUsers(owner) { return users.filter((u) => u.linkedOwner === owner); } },
};

const sessions = require('../services/session.service');
const { requireAuth } = require('../middleware/auth.middleware');

const reqOf = (token) => ({ headers: { authorization: `Bearer ${token}`, 'user-agent': 'test' }, ip: '1.1.1.1', cookies: {} });
const resStub = () => ({ code: 200, body: null, headers: [], status(c) { this.code = c; return this; }, send(b) { this.body = b; return this; }, json(b) { this.body = b; return this; }, append(k, v) { this.headers.push([k, v]); } });
async function auth(token) {
  const req = reqOf(token);
  const res = resStub();
  let passed = false;
  await requireAuth(req, res, () => { passed = true; });
  return { passed, res, req };
}
async function tokenFor(username) {
  sessions.forgetUser(username);
  const out = await sessions.startSession(reqOf(''), resStub(), byName(username));
  return out.token;
}

test('la cuenta técnica de una sucursal entra mientras su dueño sea administrador activo', async () => {
  const token = await tokenFor('sucursal-1');
  const r = await auth(token);
  assert.equal(r.passed, true);
  assert.equal(r.req.tenantId, 'centro', 'trabaja dentro de la sucursal, nunca en otra tienda');
  assert.equal(r.req.user.linkedOwner, 'lupita');
  assert.equal(r.req.user.role, 'admin');
});

test('una cuenta normal funciona igual que siempre', async () => {
  const token = await tokenFor('normal');
  const r = await auth(token);
  assert.equal(r.passed, true);
  assert.equal(r.req.user.linkedOwner, null);
});

test('si el dueño cambia su contraseña (revokeAll), las sesiones de sus sucursales caen en el acto', async () => {
  const token = await tokenFor('sucursal-1');
  assert.equal((await auth(token)).passed, true);
  await sessions.revokeAll(byName('lupita'), 'password_change');
  const r = await auth(token);
  assert.equal(r.passed, false);
  assert.equal(r.res.code, 401);
  // y no se puede renovar: su refresh quedó revocado
  const linkedRefresh = sessionsDb.filter((s) => s.userId === 'u2');
  assert.ok(linkedRefresh.length && linkedRefresh.every((s) => s.revokedAt), 'las sesiones de la cuenta técnica quedaron revocadas');
});

test('si el dueño se desactiva o deja de ser administrador, la sucursal deja de abrirse', async () => {
  users[0].tokenVersion = 0;
  let token = await tokenFor('sucursal-1');
  users[0].disabled = true;
  sessions.forgetUser('lupita');
  assert.equal((await auth(token)).res.code, 401);
  users[0].disabled = false;
  sessions.forgetUser('lupita');
  token = await tokenFor('sucursal-1');
  assert.equal((await auth(token)).passed, true);
  users[0].role = 'cashier';
  sessions.forgetUser('lupita');
  assert.equal((await auth(token)).res.code, 401);
  users[0].role = 'admin';
  sessions.forgetUser('lupita');
});

test('no se puede abrir una sesión de sucursal si el dueño ya no es administrador activo', async () => {
  users[0].disabled = true;
  sessions.forgetUser('lupita');
  await assert.rejects(sessions.startSession(reqOf(''), resStub(), byName('sucursal-1')), (e) => e.status === 401);
  users[0].disabled = false;
  sessions.forgetUser('lupita');
});

test('tokens fabricados: sin versión del dueño, con otra versión, con otro dueño o en una cuenta normal', async () => {
  const jwt = require('jsonwebtoken');
  users[0].tokenVersion = 3;
  sessions.forgetUser('lupita');
  const base = { userId: 'sucursal-1', userRole: 'admin', tenantId: 'centro', tv: 0, email: '' };
  const sign = (extra) => `Bearer ${jwt.sign({ ...base, ...extra }, process.env.SECRET_KEY, { expiresIn: '5m' })}`.replace('Bearer ', '');
  assert.equal((await auth(sign({ owner: 'lupita' }))).passed, false, 'sin otv');
  assert.equal((await auth(sign({ owner: 'lupita', otv: 2 }))).passed, false, 'otv viejo');
  assert.equal((await auth(sign({ owner: 'otro', otv: 3 }))).passed, false, 'otro dueño');
  assert.equal((await auth(sign({ owner: 'lupita', otv: 3 }))).passed, true, 'el correcto sí pasa');
  const normal = `${jwt.sign({ userId: 'normal', userRole: 'admin', tenantId: 'otra', tv: 0, owner: 'lupita', otv: 3 }, process.env.SECRET_KEY)}`;
  assert.equal((await auth(normal)).passed, false, 'una cuenta normal con datos de dueño se rechaza');
  users[0].tokenVersion = 0;
  sessions.forgetUser('lupita');
});

test('un token de la sucursal no sirve para entrar a otra tienda: el tenant sale del token firmado', async () => {
  const token = await tokenFor('sucursal-1');
  const r = await auth(token);
  assert.notEqual(r.req.tenantId, 'matriz');
  assert.notEqual(r.req.tenantId, 'otra');
});

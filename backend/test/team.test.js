process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');

const root = path.join(__dirname, '..');

function memoryDb() {
  const users = [];
  const sessions = [];
  let seq = 0;
  const byId = (id) => users.find((u) => String(u._id) === String(id)) || null;
  return {
    users,
    sessions,
    async FindUserByUsername(u) {
      return users.find((x) => x.username === u) || null;
    },
    async FindUserByEmail(e) {
      return users.find((x) => x.email === e) || null;
    },
    async LoginUsuario(d) {
      return users.find((x) => x.username === d || x.email === d) || null;
    },
    async FindUserById(id) {
      return byId(id);
    },
    async FindUserInTenant(id, tenantId) {
      const u = byId(id);
      return u && u.tenantId === String(tenantId) ? u : null;
    },
    async CountActiveAdmins(tenantId) {
      return users.filter((u) => u.tenantId === String(tenantId) && u.role === 'admin' && !u.disabled).length;
    },
    async CountUsersByTenant(tenantId) {
      return users.filter((u) => u.tenantId === String(tenantId) && !u.disabled).length;
    },
    async CountPendingInvites() {
      return 0;
    },
    async CountFoods() {
      return 0;
    },
    async GetTenantById() {
      return { id: 't1', plan: 'basic' };
    },
    async UpdateUserById(id, data) {
      return Object.assign(byId(id), data);
    },
    async RecordLoginFailure() {},
    async ClearLoginFailures(id) {
      Object.assign(byId(id), { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() });
    },
    async BumpUserTokenVersion(id) {
      const u = byId(id);
      u.tokenVersion = (u.tokenVersion || 0) + 1;
      return u;
    },
    async CreateSession(d) {
      const r = { ...d, _id: `s${++seq}` };
      sessions.push(r);
      return r;
    },
    async FindSessionByHash(h) {
      return sessions.find((s) => s.tokenHash === h) || null;
    },
    async RevokeSession(id, data) {
      const s = sessions.find((x) => x._id === id);
      if (!s || s.revokedAt) return false;
      Object.assign(s, { revokedAt: new Date(), ...data });
      return true;
    },
    async RevokeUserSessions(uid) {
      for (const s of sessions) if (s.userId === String(uid) && !s.revokedAt) s.revokedAt = new Date();
    },
  };
}

function load(db) {
  const file = require.resolve(path.join(root, 'database/mongodb.js'));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: db };
  for (const rel of [
    'services/session.service.js',
    'services/usuario.service.js',
    'services/plan-limits.service.js',
    'controllers/user.controller.js',
    'controllers/invites.controller.js',
    'middleware/auth.middleware.js',
  ]) {
    delete require.cache[require.resolve(path.join(root, rel))];
  }
  return {
    invites: require('../controllers/invites.controller'),
    users: require('../controllers/user.controller'),
    auth: require('../middleware/auth.middleware'),
    sessions: require('../services/session.service'),
  };
}

function res() {
  return {
    code: 200,
    body: null,
    cookies: [],
    status(c) {
      this.code = c;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
    append(k, v) {
      if (k === 'Set-Cookie') this.cookies.push(v);
    },
  };
}
const req = (body = {}, extra = {}) => ({ body, params: {}, headers: {}, ip: '127.0.0.1', ...extra });

async function seed(db) {
  const password = await bcrypt.hash('mi tienda abre a las 7', 4);
  const base = { tenantId: 't1', password };
  db.users.push(
    { ...base, _id: 'u1', username: 'dueno', email: 'dueno@tienda.mx', role: 'admin', name: 'Lupita' },
    { ...base, _id: 'u2', username: 'pedro', email: 'pedro@tienda.mx', role: 'cashier', name: 'Pedro' },
    { ...base, _id: 'u3', username: 'otra', email: 'otra@otra.mx', role: 'admin', tenantId: 't2' }
  );
}
async function login(users, who) {
  const r = res();
  await users.LoginUsuario(req({ data: who, password: 'mi tienda abre a las 7' }), r);
  return r;
}
async function check(auth, token) {
  const r = res();
  let ok = false;
  await auth.requireAuth({ headers: { authorization: `Bearer ${token}` } }, r, () => (ok = true));
  return ok ? 200 : r.code;
}
const asAdmin = { user: { username: 'dueno', role: 'admin' }, tenantId: 't1' };

test('desactivar a un cajero: su token y su refresh dejan de servir al instante', async () => {
  const db = memoryDb();
  await seed(db);
  const { invites, users, auth } = load(db);
  const pedro = await login(users, 'pedro');
  assert.equal(await check(auth, pedro.body.token), 200);

  const r = res();
  await invites.deactivateUser(req({}, { ...asAdmin, params: { id: 'u2' } }), r);
  assert.equal(r.code, 200);
  assert.equal(db.users[1].disabled, true);
  assert.equal(await check(auth, pedro.body.token), 401, 'aunque tenga un JWT vigente');

  const refresh = res();
  await users.RefreshSession(req({}, { headers: { cookie: pedro.cookies[0].split(';')[0] } }), refresh);
  assert.equal(refresh.code, 401);
});

test('un cajero desactivado no puede iniciar sesión; al reactivarlo, sí', async () => {
  const db = memoryDb();
  await seed(db);
  const { invites, users } = load(db);
  await invites.deactivateUser(req({}, { ...asAdmin, params: { id: 'u2' } }), res());
  const blocked = await login(users, 'pedro');
  assert.equal(blocked.code, 403);
  assert.match(blocked.body, /desactivada/);

  const r = res();
  await invites.reactivateUser(req({}, { ...asAdmin, params: { id: 'u2' } }), r);
  assert.equal(r.code, 200);
  assert.equal((await login(users, 'pedro')).code, 200);
});

test('no se puede desactivar la propia cuenta ni al último dueño activo', async () => {
  const db = memoryDb();
  await seed(db);
  const { invites } = load(db);
  const self = res();
  await invites.deactivateUser(req({}, { ...asAdmin, params: { id: 'u1' } }), self);
  assert.equal(self.code, 400);
  assert.equal(db.users[0].disabled, undefined);

  // Con un segundo dueño, un dueño sí puede desactivar al otro… pero no al último
  db.users.push({ _id: 'u4', username: 'socio', email: 's@t.mx', role: 'admin', tenantId: 't1' });
  const other = { user: { username: 'socio', role: 'admin' }, tenantId: 't1' };
  const ok = res();
  await invites.deactivateUser(req({}, { ...other, params: { id: 'u1' } }), ok);
  assert.equal(ok.code, 200);
  const last = res();
  await invites.deactivateUser(req({}, { user: { username: 'pedro', role: 'admin' }, tenantId: 't1', params: { id: 'u4' } }), last);
  assert.equal(last.code, 400, 'socio es el último dueño activo');
  assert.match(last.body, /al menos un dueño/);
});

test('un dueño no toca cuentas de otra tienda', async () => {
  const db = memoryDb();
  await seed(db);
  const { invites } = load(db);
  const r = res();
  await invites.deactivateUser(req({}, { ...asAdmin, params: { id: 'u3' } }), r);
  assert.equal(r.code, 404);
  assert.equal(db.users[2].disabled, undefined);
});

test('reactivar respeta los lugares del plan', async () => {
  const db = memoryDb();
  await seed(db);
  const { invites } = load(db);
  await invites.deactivateUser(req({}, { ...asAdmin, params: { id: 'u2' } }), res());
  // Plan básico: 2 usuarios. Otra persona ocupa el lugar libre.
  db.users.push({ _id: 'u5', username: 'nuevo', email: 'n@t.mx', role: 'cashier', tenantId: 't1' });
  const r = res();
  await invites.reactivateUser(req({}, { ...asAdmin, params: { id: 'u2' } }), r);
  assert.equal(r.code, 403);
  assert.equal(r.body.code, 'PLAN_LIMIT');
  assert.equal(db.users[1].disabled, true);
});

test('roles de restaurante: pasan a cajero (token viejo incluido) y ya no se pueden invitar', async () => {
  const db = memoryDb();
  await seed(db);
  db.users[1].role = 'waiter';
  const { invites, users, auth, sessions } = load(db);
  const tokenWithOldRole = sessions.accessTokenFor({ ...db.users[1], role: 'waiter' });
  const payloadRole = JSON.parse(Buffer.from(tokenWithOldRole.split('.')[1], 'base64url').toString()).userRole;
  assert.equal(payloadRole, 'cashier', 'el token ya sale como cajero');

  // Un token de antes de la migración, con rol viejo, se lee con el rol de la base
  const jwt = require('../utils/jwt.utils');
  const oldToken = jwt.generateJWT({ userId: 'pedro', userRole: 'waiter', tenantId: 't1', tv: 0 });
  const r = res();
  const request = { headers: { authorization: `Bearer ${oldToken}` } };
  db.users[1].role = 'cashier';
  sessions.forgetUser('pedro');
  await auth.requireAuth(request, r, () => {});
  assert.equal(request.user.role, 'cashier');

  const bad = res();
  await invites.create(req({ email: 'x@y.mx', role: 'waiter' }, { ...asAdmin }), bad);
  assert.equal(bad.code, 400);
  assert.equal((await login(users, 'pedro')).body.role, 'cashier');
});

test('el modelo solo conoce admin y cashier', () => {
  const t = require('../models/tenant.model');
  assert.deepEqual(t.TENANT_ROLES, ['admin', 'cashier']);
  assert.ok(!t.ROLES.some((r) => ['hosstess', 'waiter', 'kitchen'].includes(r)));
  assert.equal(t.normalizeRole('kitchen'), 'cashier');
  assert.equal(t.normalizeRole('admin'), 'admin');
  assert.equal(t.normalizeRole('platform_admin'), 'platform_admin');
});

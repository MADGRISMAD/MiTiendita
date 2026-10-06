process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const totp = require('../utils/totp');

const root = path.join(__dirname, '..');

/** Base de datos en memoria con lo que usan login, sesiones y 2FA. */
function memoryDb() {
  const users = [];
  const sessions = [];
  let seq = 0;
  const byId = (id) => users.find((u) => String(u._id) === String(id)) || null;
  const db = {
    users,
    sessions,
    async FindUserByUsername(username) {
      return users.find((u) => u.username === username) || null;
    },
    async FindUserByEmail(email) {
      return users.find((u) => u.email === email) || null;
    },
    async LoginUsuario(data) {
      return users.find((u) => u.username === data || u.email === data) || null;
    },
    async FindUserById(id) {
      return byId(id);
    },
    async UpdateUserById(id, data) {
      const u = byId(id);
      Object.assign(u, data);
      return u;
    },
    async RecordLoginFailure(id, { max, lockMs }) {
      const u = byId(id);
      u.failedLogins = (u.failedLogins || 0) + 1;
      if (u.failedLogins >= max) {
        u.failedLogins = 0;
        u.lockedUntil = new Date(Date.now() + lockMs);
      }
      return u;
    },
    async ClearLoginFailures(id) {
      Object.assign(byId(id), { failedLogins: 0, lockedUntil: null });
    },
    async BumpUserTokenVersion(id) {
      const u = byId(id);
      u.tokenVersion = (u.tokenVersion || 0) + 1;
      return u;
    },
    async CreateSession(data) {
      const row = { ...data, _id: `s${++seq}` };
      sessions.push(row);
      return row;
    },
    async FindSessionByHash(hash) {
      return sessions.find((s) => s.tokenHash === hash) || null;
    },
    async RevokeSession(id, data) {
      const s = sessions.find((x) => x._id === id);
      if (!s || s.revokedAt) return false;
      Object.assign(s, { revokedAt: new Date(), ...data });
      return true;
    },
    async RevokeUserSessions(userId) {
      for (const s of sessions) if (s.userId === String(userId) && !s.revokedAt) s.revokedAt = new Date();
    },
  };
  return db;
}

function load(db) {
  const stub = (rel, exports) => {
    const file = require.resolve(path.join(root, rel));
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
  };
  stub('database/db.js', db);
  stub('utils/mail.utils.js', { safeSend: async () => {}, sendPasswordResetEmail: async () => {}, sendWelcomeEmail: async () => {}, hasSmtpConfig: () => false });
  for (const rel of ['services/session.service.js', 'services/usuario.service.js', 'controllers/user.controller.js', 'middleware/auth.middleware.js']) {
    delete require.cache[require.resolve(path.join(root, rel))];
  }
  return {
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
const cookieOf = (r) => {
  const c = r.cookies.at(-1) || '';
  return c.split(';')[0];
};
const req = (body = {}, extra = {}) => ({ body, headers: { 'user-agent': 'test', ...(extra.headers || {}) }, ip: '127.0.0.1', ...extra });

async function addUser(db, data) {
  db.users.push({
    _id: `u${db.users.length + 1}`,
    username: 'lupita',
    email: 'lupita@tienda.mx',
    role: 'admin',
    tenantId: 't1',
    password: await bcrypt.hash('mi tienda abre a las 7', 4),
    ...data,
  });
}

async function authed(auth, token) {
  const r = res();
  let ok = false;
  await auth.requireAuth({ headers: { authorization: `Bearer ${token}` } }, r, () => (ok = true));
  return ok ? 200 : r.code;
}

test('login correcto: access token de 15 min y refresh en cookie HttpOnly', async () => {
  const db = memoryDb();
  await addUser(db);
  const { users, auth } = load(db);
  const r = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), r);
  assert.equal(r.code, 200);
  assert.ok(r.body.token);
  assert.match(r.cookies[0], /^mt_rt=.+; Path=\/; HttpOnly; SameSite=Lax/);
  assert.equal(db.sessions.length, 1);
  assert.notEqual(db.sessions[0].tokenHash, decodeURIComponent(cookieOf(r).split('=')[1]), 'se guarda solo el hash');
  const exp = JSON.parse(Buffer.from(r.body.token.split('.')[1], 'base64url').toString()).exp;
  assert.ok(exp - Date.now() / 1000 <= 15 * 60 + 5);
  assert.equal(await authed(auth, r.body.token), 200);
});

test('5 contraseñas mal seguidas bloquean la cuenta 15 min', async () => {
  const db = memoryDb();
  await addUser(db);
  const { users } = load(db);
  const codes = [];
  for (let i = 0; i < 5; i++) {
    const r = res();
    await users.LoginUsuario(req({ data: 'lupita', password: 'equivocada' }), r);
    codes.push(r.code);
  }
  assert.deepEqual(codes, [401, 401, 401, 401, 423]);
  const r = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), r);
  assert.equal(r.code, 423, 'ni con la buena entra mientras dure el bloqueo');
  assert.match(r.body, /bloqueada/);
  const ghost = res();
  await users.LoginUsuario(req({ data: 'nadie', password: 'x' }), ghost);
  assert.equal(ghost.code, 401, 'usuario inexistente: misma respuesta');
});

test('refresh rota el token; reusar uno viejo cierra todas las sesiones', async () => {
  const db = memoryDb();
  await addUser(db);
  const { users } = load(db);
  const login = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), login);
  const first = cookieOf(login);

  const r1 = res();
  await users.RefreshSession(req({}, { headers: { cookie: first } }), r1);
  assert.equal(r1.code, 200);
  assert.ok(r1.body.token);
  const second = cookieOf(r1);
  assert.notEqual(second, first);

  // Otra pestaña con la cookie anterior, al mismo tiempo: se tolera
  const twin = res();
  await users.RefreshSession(req({}, { headers: { cookie: first } }), twin);
  assert.equal(twin.code, 200);

  // Pasada la gracia, la cookie vieja es sospechosa: se revoca todo
  db.sessions[0].replacedAt = new Date(Date.now() - 60 * 1000);
  const thief = res();
  await users.RefreshSession(req({}, { headers: { cookie: first } }), thief);
  assert.equal(thief.code, 401);
  const victim = res();
  await users.RefreshSession(req({}, { headers: { cookie: second } }), victim);
  assert.equal(victim.code, 401, 'la sesión legítima también se cerró');
});

test('cambiar la contraseña invalida los tokens anteriores y deja esta sesión abierta', async () => {
  const db = memoryDb();
  await addUser(db);
  const { users, auth } = load(db);
  const other = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), other);
  const here = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), here);

  const r = res();
  await users.ChangePassword(
    req({ currentPassword: 'mi tienda abre a las 7', newPassword: 'otra frase para mi caja' }, { user: { username: 'lupita' } }),
    r
  );
  assert.equal(r.code, 200);
  assert.equal(await authed(auth, other.body.token), 401, 'el token de antes ya no sirve');
  assert.equal(await authed(auth, r.body.token), 200, 'el nuevo sí');
  const refreshOther = res();
  await users.RefreshSession(req({}, { headers: { cookie: cookieOf(other) } }), refreshOther);
  assert.equal(refreshOther.code, 401, 'la otra sesión ya no se renueva');

  const weak = res();
  await users.ChangePassword(req({ currentPassword: 'otra frase para mi caja', newPassword: '123456' }, { user: { username: 'lupita' } }), weak);
  assert.equal(weak.code, 400);
});

test('cuenta desactivada: su token deja de servir', async () => {
  const db = memoryDb();
  await addUser(db);
  const { users, auth, sessions } = load(db);
  const r = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), r);
  db.users[0].disabled = true;
  sessions.forgetUser('lupita');
  assert.equal(await authed(auth, r.body.token), 401);
});

test('2FA del dueño: activar, entrar con código, código de respaldo una sola vez, desactivar', async () => {
  const db = memoryDb();
  await addUser(db);
  const { users } = load(db);
  const login = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), login);
  const bearer = { headers: { authorization: `Bearer ${login.body.token}` } };

  const setup = res();
  await users.MfaSetup(req({}, bearer), setup);
  assert.equal(setup.code, 200);
  const secret = setup.body.secret;
  assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);

  const bad = res();
  await users.MfaEnable(req({ code: '000000' }, bearer), bad);
  assert.equal(bad.code, 400);
  const enable = res();
  const step = totp.stepAt();
  await users.MfaEnable(req({ code: totp.codeAt(secret, step - 1) }, bearer), enable);
  assert.equal(enable.code, 200);
  assert.equal(enable.body.recoveryCodes.length, 8);
  assert.ok(!JSON.stringify(db.users[0]).includes(secret), 'el secreto no queda en claro');

  // Ahora la contraseña sola no basta
  const step1 = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), step1);
  assert.equal(step1.body.mfaRequired, true);
  assert.equal(step1.body.token, undefined);
  assert.equal(step1.cookies.length, 0);

  const wrong = res();
  await users.LoginMfa(req({ mfaToken: step1.body.mfaToken, code: '123456' }), wrong);
  assert.equal(wrong.code, 401);
  const right = res();
  await users.LoginMfa(req({ mfaToken: step1.body.mfaToken, code: totp.codeAt(secret, step) }), right);
  assert.equal(right.code, 200);
  assert.ok(right.body.token);
  const replay = res();
  await users.LoginMfa(req({ mfaToken: step1.body.mfaToken, code: totp.codeAt(secret, step) }), replay);
  assert.equal(replay.code, 401, 'el mismo código no sirve dos veces');

  const recovery = enable.body.recoveryCodes[0];
  const viaRecovery = res();
  await users.LoginMfa(req({ mfaToken: step1.body.mfaToken, code: recovery }), viaRecovery);
  assert.equal(viaRecovery.code, 200);
  const again = res();
  await users.LoginMfa(req({ mfaToken: step1.body.mfaToken, code: recovery }), again);
  assert.equal(again.code, 401, 'cada código de respaldo es de un solo uso');

  const off = res();
  await users.MfaDisable(
    req({ password: 'mi tienda abre a las 7', code: enable.body.recoveryCodes[1] }, { user: { username: 'lupita' } }),
    off
  );
  assert.equal(off.code, 200);
  assert.equal(db.users[0].mfaEnabled, false);
});

test('equipo de plataforma: 2FA obligatorio', async () => {
  const db = memoryDb();
  await addUser(db, { username: 'ops', email: 'ops@mitiendita.mx', role: 'platform_admin', tenantId: null });
  const { users, auth } = load(db);
  const step1 = res();
  await users.LoginUsuario(req({ data: 'ops', password: 'mi tienda abre a las 7' }), step1);
  assert.equal(step1.body.mfaSetupRequired, true);
  assert.equal(step1.body.token, undefined);

  const setup = res();
  await users.MfaSetup(req({ mfaToken: step1.body.mfaToken }), setup);
  const enable = res();
  await users.MfaEnable(req({ mfaToken: step1.body.mfaToken, code: totp.codeAt(setup.body.secret, totp.stepAt()) }), enable);
  assert.equal(enable.code, 200);
  assert.ok(enable.body.token, 'al activarlo ya entra');
  assert.equal(await authed(auth, enable.body.token), 200);

  const off = res();
  await users.MfaDisable(req({ password: 'mi tienda abre a las 7', code: enable.body.recoveryCodes[0] }, { user: { username: 'ops' } }), off);
  assert.equal(off.code, 400, 'no lo puede apagar');
});

test('token de plataforma sin 2FA (de antes del cambio) se rechaza con MFA_SETUP_REQUIRED', async () => {
  const db = memoryDb();
  await addUser(db, { username: 'ops', role: 'platform_support', tenantId: null });
  const { auth, sessions } = load(db);
  const token = sessions.accessTokenFor(db.users[0]);
  const r = res();
  await auth.requireAuth({ headers: { authorization: `Bearer ${token}` } }, r, () => {});
  assert.equal(r.code, 403);
  assert.equal(r.body.code, 'MFA_SETUP_REQUIRED');
});

test('logout revoca el refresh y borra la cookie', async () => {
  const db = memoryDb();
  await addUser(db);
  const { users } = load(db);
  const login = res();
  await users.LoginUsuario(req({ data: 'lupita', password: 'mi tienda abre a las 7' }), login);
  const out = res();
  await users.Logout(req({}, { headers: { cookie: cookieOf(login) } }), out);
  assert.match(out.cookies[0], /Max-Age=0/);
  const r = res();
  await users.RefreshSession(req({}, { headers: { cookie: cookieOf(login) } }), r);
  assert.equal(r.code, 401);
});

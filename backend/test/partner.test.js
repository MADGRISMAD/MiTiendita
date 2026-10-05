process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const jwt = require('../utils/jwt.utils');

const DAY = 86400000;
const iso = (ms) => new Date(Date.now() + ms);

// ───────── Datos en memoria ─────────
const users = [
  { _id: 'pa1', username: 'marco', name: 'Marco', lastName: 'Ruiz', email: 'marco@socio.mx', role: 'partner_admin', partnerId: 'r1', mfaEnabled: true, tokenVersion: 0 },
  { _id: 'ps1', username: 'karla', name: 'Karla', lastName: 'Díaz', email: 'karla@socio.mx', role: 'partner_staff', partnerId: 'r1', mfaEnabled: true, tokenVersion: 0 },
  { _id: 'ps2', username: 'sinmfa', name: 'Sin', lastName: 'MFA', email: 'sin@socio.mx', role: 'partner_staff', partnerId: 'r1', mfaEnabled: false, tokenVersion: 0 },
  { _id: 'pb1', username: 'otro', name: 'Otro', lastName: 'Socio', email: 'otro@socio.mx', role: 'partner_admin', partnerId: 'r2', mfaEnabled: true, tokenVersion: 0 },
  { _id: 'hu1', username: 'huerfano', name: 'Sin', lastName: 'Socio', email: 'h@socio.mx', role: 'partner_admin', partnerId: null, mfaEnabled: true, tokenVersion: 0 },
  { _id: 'o1', username: 'lupita', name: 'Lupita', lastName: 'Pérez', email: 'lupita@tienda.mx', role: 'admin', tenantId: 'aaaaaaaaaaaaaaaaaaaaaaa1', tokenVersion: 0, lastLoginAt: iso(-1 * DAY) },
];
const tenants = [
  { _id: 'aaaaaaaaaaaaaaaaaaaaaaa1', id: 'aaaaaaaaaaaaaaaaaaaaaaa1', name: 'Abarrotes Lupita', plan: 'basic', billingStatus: 'active', referrerId: 'r1', referredAt: iso(-30 * DAY) },
  { _id: 'aaaaaaaaaaaaaaaaaaaaaaa2', id: 'aaaaaaaaaaaaaaaaaaaaaaa2', name: 'Ferretería Tornillo', plan: 'basic', billingStatus: 'trialing', trialEndsAt: iso(2 * DAY), referrerId: 'r1', referredAt: iso(-5 * DAY) },
  { _id: 'aaaaaaaaaaaaaaaaaaaaaaa3', id: 'aaaaaaaaaaaaaaaaaaaaaaa3', name: 'Tienda de Otro Socio', plan: 'pro', billingStatus: 'active', referrerId: 'r2' },
];
const referrers = [
  { id: 'r1', name: 'Marco Ruiz', code: 'MT-AAAAAA', status: 'active', email: 'marco@socio.mx' },
  { id: 'r2', name: 'Otro Socio', code: 'MT-BBBBBB', status: 'active', email: 'otro@socio.mx' },
];
const notes = [];
const byId = (id) => users.find((u) => String(u._id) === String(id)) || null;

const stub = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub('../database/mongodb', {
  async FindUserByUsername(u) {
    return users.find((x) => x.username === u) || null;
  },
  async FindUserByEmail(e) {
    return users.find((x) => x.email === e) || null;
  },
  async FindUserById(id) {
    return byId(id);
  },
  async CreateUser(doc) {
    users.push({ ...doc, _id: `n${users.length}` });
  },
  async UpdateUserById(id, patch) {
    return Object.assign(byId(id), patch);
  },
  async BumpUserTokenVersion(id) {
    const u = byId(id);
    u.tokenVersion = (u.tokenVersion || 0) + 1;
    return u;
  },
  async RevokeUserSessions() {},
  async GetSettings(id) {
    const t = tenants.find((x) => x.id === id);
    return t ? { businessName: t.name, setupCompleted: true } : null;
  },
  async ListUsersByTenant(tid) {
    return users.filter((u) => u.tenantId === tid).map((u) => ({ id: String(u._id), name: u.name, lastName: u.lastName, username: u.username, email: u.email, role: u.role, disabled: false, lastLoginAt: u.lastLoginAt || null }));
  },
  async ListBillingEvents() {
    return [{ id: 'b1', type: 'payment', note: 'Cobro', amount: 349, at: new Date() }];
  },
  async CountUsersByTenant() {
    return 1;
  },
  async CountPendingInvites() {
    return 0;
  },
  async CountFoods() {
    return 10;
  },
});
stub('../database/referral.db', {
  async GetReferrerById(id) {
    return referrers.find((r) => r.id === id) || null;
  },
  async ListTenantsByReferrer(id) {
    return tenants.filter((t) => t.referrerId === id).map((t) => ({ ...t }));
  },
  async ListCommissions({ tenantId } = {}) {
    return [{ id: 'c1', tenantId: tenantId || 'aaaaaaaaaaaaaaaaaaaaaaa1', amount: 349, rate: 0.1, commission: 34.9, status: 'pending', source: 'manual', createdAt: new Date() }];
  },
});
stub('../services/referral.service', {
  async detail(id) {
    return { id, code: 'MT-AAAAAA', rate: 0.1, closedSales: 1, next: { from: 5, rate: 0.12, missing: 4 }, ladder: [], pending: 34.9, pendingCount: 1, paid: 0, earned: 34.9, commissions: [], payouts: [] };
  },
});
stub('../database/partner.db', {
  async ListPartnerUsers(pid) {
    return users.filter((u) => u.partnerId === pid && String(u.role).startsWith('partner_')).map((u) => ({ id: String(u._id), name: u.name, lastName: u.lastName, username: u.username, email: u.email, role: u.role, disabled: Boolean(u.disabled), mfaEnabled: Boolean(u.mfaEnabled) }));
  },
  async FindPartnerUser(id, pid) {
    const u = byId(id);
    return u && u.partnerId === pid && String(u.role).startsWith('partner_') ? u : null;
  },
  async FindPartnerUserByUsername(name, pid) {
    return users.find((u) => u.username === name && u.partnerId === pid) || null;
  },
  async CountActivePartnerAdmins(pid) {
    return users.filter((u) => u.partnerId === pid && u.role === 'partner_admin' && !u.disabled).length;
  },
  async GetPartnerTenant(tid, pid) {
    const t = tenants.find((x) => x.id === tid && x.referrerId === pid);
    return t ? { ...t } : null;
  },
  async SetTenantAssignee(tid, pid, username) {
    const t = tenants.find((x) => x.id === tid && x.referrerId === pid);
    if (!t) return false;
    t.partnerAssignee = username;
    return true;
  },
  async ClearAssignee(pid, username) {
    tenants.filter((t) => t.referrerId === pid && t.partnerAssignee === username).forEach((t) => (t.partnerAssignee = null));
  },
  async ListNotes(pid, tid) {
    return notes.filter((n) => n.partnerId === pid && n.tenantId === tid);
  },
  async CreateNote(doc) {
    notes.push(doc);
    return doc;
  },
  async LastNotes() {
    return new Map();
  },
});

let base;
let server;
test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/partner', require('../routers/partner.router'));
  // Una ruta de tienda y una de plataforma para comprobar que un socio no entra
  const { requireAuth, requireActiveSubscription, requireRoles } = require('../middleware/auth.middleware');
  app.get('/tienda', requireAuth, requireActiveSubscription, requireRoles('admin', 'cashier'), (req, res) => res.json({ ok: true }));
  app.get('/plataforma', requireAuth, requireRoles('platform_admin', 'platform_support'), (req, res) => res.json({ ok: true }));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

const tokenFor = (username, extra = {}) => {
  const u = users.find((x) => x.username === username);
  return jwt.generateJWT({ userId: u.username, userRole: u.role, tenantId: u.tenantId || null, email: u.email, tv: u.tokenVersion || 0, ...extra });
};
async function call(method, url, user, body, extra) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(user, extra)}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* texto */
  }
  return { status: res.status, json, text };
}

test('el socio ve solo SUS tiendas; las de otro socio no existen para él', async () => {
  const list = await call('GET', '/partner/clients', 'marco');
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.map((c) => c.businessName).sort(), ['Abarrotes Lupita', 'Ferretería Tornillo']);
  const trial = list.json.find((c) => c.businessName === 'Ferretería Tornillo');
  assert.equal(trial.attention.tone, 'warn', 'la prueba por vencer pide atención');

  const other = await call('GET', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa3', 'marco');
  assert.equal(other.status, 404);
  const mine = await call('GET', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa1', 'marco');
  assert.equal(mine.status, 200);
  assert.equal(mine.json.ownerEmail, 'lupita@tienda.mx');
  assert.ok(Array.isArray(mine.json.commissions), 'el dueño del socio ve el dinero');
});

test('el trabajador atiende las tiendas pero no ve dinero ni maneja al equipo', async () => {
  const detail = await call('GET', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa1', 'karla');
  assert.equal(detail.status, 200);
  assert.equal(detail.json.commissions, null);
  assert.equal(detail.json.history[0].amount, undefined);
  assert.equal((await call('GET', '/partner/commissions', 'karla')).status, 403);
  assert.equal((await call('POST', '/partner/team', 'karla', { name: 'X' })).status, 403);
  assert.equal((await call('PUT', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa1/assignee', 'karla', { username: 'karla' })).status, 403);
  const home = await call('GET', '/partner/home', 'karla');
  assert.equal(home.status, 200);
  assert.equal(home.json.money, undefined);
  const note = await call('POST', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa1/notes', 'karla', { text: 'Le llamé, quiere capacitación' });
  assert.equal(note.status, 201);
  assert.equal(note.json.authorName, 'Karla Díaz');
});

test('el dueño del socio reparte tiendas solo entre su equipo activo', async () => {
  const ok = await call('PUT', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa2/assignee', 'marco', { username: 'karla' });
  assert.equal(ok.status, 200);
  assert.equal(tenants[1].partnerAssignee, 'karla');
  const foreign = await call('PUT', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa2/assignee', 'marco', { username: 'otro' });
  assert.equal(foreign.status, 400);
  const notMine = await call('PUT', '/partner/clients/aaaaaaaaaaaaaaaaaaaaaaa3/assignee', 'marco', { username: 'karla' });
  assert.equal(notMine.status, 404);
});

test('equipo: alta con contraseña segura, nunca deja al socio sin dueño, y al desactivar se liberan sus tiendas', async () => {
  const weak = await call('POST', '/partner/team', 'marco', { name: 'Pepe', email: 'pepe@socio.mx', username: 'pepe', password: '123' });
  assert.equal(weak.status, 400);
  const created = await call('POST', '/partner/team', 'marco', { name: 'Pepe', lastName: 'Luna', email: 'pepe@socio.mx', username: 'pepe', password: 'una frase larga y segura 2026', role: 'partner_staff' });
  assert.equal(created.status, 201, created.text);
  const pepe = users.find((u) => u.username === 'pepe');
  assert.equal(pepe.partnerId, 'r1');
  assert.equal(pepe.tenantId, null);
  assert.notEqual(pepe.password, 'una frase larga y segura 2026');

  // marco es el único dueño: no puede quedarse sin dueño (ni se cambia a sí mismo)
  assert.equal((await call('PUT', '/partner/team/pa1/role', 'marco', { role: 'partner_staff' })).status, 400);

  const off = await call('PUT', '/partner/team/ps1/deactivate', 'marco');
  assert.equal(off.status, 200);
  assert.equal(users.find((u) => u.username === 'karla').disabled, true);
  assert.equal(tenants[1].partnerAssignee, null, 'sus tiendas quedan sin responsable');
  // y ya no puede entrar
  assert.equal((await call('GET', '/partner/home', 'karla', null, { tv: 1 })).status, 401);
  // otro socio no puede tocar a la gente de este
  assert.equal((await call('PUT', '/partner/team/pa1/deactivate', 'otro')).status, 404);
});

test('cuentas de socio: 2FA obligatoria, socio ligado, y sin acceso a tiendas ni plataforma', async () => {
  const noMfa = await call('GET', '/partner/home', 'sinmfa');
  assert.equal(noMfa.status, 403);
  assert.equal(noMfa.json.code, 'MFA_SETUP_REQUIRED');
  assert.equal((await call('GET', '/partner/home', 'huerfano')).status, 401);
  // aunque el token traiga una tienda, la cuenta de socio no opera dentro de tiendas
  assert.notEqual((await call('GET', '/tienda', 'marco', null, { tenantId: 'aaaaaaaaaaaaaaaaaaaaaaa1' })).status, 200);
  assert.equal((await call('GET', '/plataforma', 'marco')).status, 403);
  // y el dueño de una tienda no entra al portal de socios
  assert.equal((await call('GET', '/partner/home', 'lupita')).status, 403);
});

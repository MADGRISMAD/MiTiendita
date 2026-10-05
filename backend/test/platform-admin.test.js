process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
process.env.MAIL_FROM = 'Mi Tiendita <soporte@mitiendita.mx>';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const root = path.join(__dirname, '..');
const jwt = require('../utils/jwt.utils');

const DAY = 86400000;
const iso = (ago) => new Date(Date.now() - ago);

/** Base de datos en memoria con lo que usa el área de plataforma. */
function platformDb() {
  const users = [
    { _id: 'a1', username: 'admin', email: 'admin@mitiendita.mx', role: 'platform_admin', name: 'Ana', lastName: 'Admin', mfaEnabled: true, tokenVersion: 0, lastLoginAt: iso(DAY) },
    { _id: 's1', username: 'sofi', email: 'sofi@mitiendita.mx', role: 'platform_support', name: 'Sofi', lastName: 'Soporte', mfaEnabled: true, tokenVersion: 0, lastLoginAt: iso(2 * DAY) },
    { _id: 's2', username: 'beto', email: 'beto@mitiendita.mx', role: 'platform_support', name: 'Beto', lastName: 'Soporte', mfaEnabled: true, tokenVersion: 0 },
    { _id: 'o1', username: 'lupita', email: 'lupita@tienda.mx', role: 'admin', tenantId: 't1', name: 'Lupita', lastName: 'Pérez', tokenVersion: 0, lastLoginAt: iso(3 * DAY) },
    { _id: 'o2', username: 'pedro', email: 'pedro@tienda.mx', role: 'cashier', tenantId: 't1', name: 'Pedro', lastName: 'Ruiz', tokenVersion: 0, lastLoginAt: iso(1 * DAY) },
    { _id: 'o3', username: 'rosa', email: 'rosa@otra.mx', role: 'admin', tenantId: 't2', name: 'Rosa', lastName: 'Gil', tokenVersion: 0 },
  ];
  const tenants = [
    { id: 't1', name: 'Abarrotes Lupita', plan: 'basic', billingStatus: 'active', createdAt: iso(40 * DAY) },
    { id: 't2', name: 'Farmacia Rosa', plan: 'growth', billingStatus: 'trialing', trialEndsAt: new Date(Date.now() + 2 * DAY), createdAt: iso(12 * DAY) },
  ];
  const mail = [
    // t1: un ticket abierto de Sofi y uno respondido de Sofi, y uno de Beto
    { id: 'm1', messageId: '<m1@x>', tenantId: 't1', direction: 'in', from: 'lupita@tienda.mx', to: 'soporte@mitiendita.mx', subject: 'No abre la caja', text: 'Ayuda, no abre', ticketId: 'k1', assignedTo: 'sofi@mitiendita.mx', at: iso(5 * 3600000) },
    { id: 'm2', messageId: '<m2@x>', tenantId: 't1', direction: 'in', from: 'lupita@tienda.mx', to: 'soporte@mitiendita.mx', subject: 'Factura', text: 'Una factura', ticketId: 'k2', assignedTo: 'sofi@mitiendita.mx', at: iso(2 * DAY) },
    { id: 'm3', messageId: '<m3@x>', tenantId: 't1', direction: 'out', from: 'soporte@mitiendita.mx', to: 'lupita@tienda.mx', subject: 'Re: Factura', text: 'Listo', ticketId: 'k2', assignedTo: 'sofi@mitiendita.mx', inReplyTo: '<m2@x>', at: iso(1 * DAY) },
    { id: 'm4', messageId: '<m4@x>', tenantId: 't2', direction: 'in', from: 'rosa@otra.mx', to: 'soporte@mitiendita.mx', subject: 'Precios', text: 'Dudas de precios', ticketId: 'k3', assignedTo: 'beto@mitiendita.mx', at: iso(1 * 3600000) },
  ];
  const state = { audit: [], billing: [{ id: 'b1', type: 'activated', note: 'Pago confirmado', amount: 349, at: iso(10 * DAY) }], sessions: [] };
  const byId = (id) => users.find((u) => String(u._id) === String(id)) || null;
  const db = {
    users,
    tenants,
    state,
    async FindUserByUsername(u) {
      return users.find((x) => x.username === u) || null;
    },
    async FindUserById(id) {
      return byId(id);
    },
    async UpdateUserById(id, data) {
      return Object.assign(byId(id), data);
    },
    async BumpUserTokenVersion(id) {
      const u = byId(id);
      u.tokenVersion = (u.tokenVersion || 0) + 1;
      return u;
    },
    async RevokeUserSessions(uid) {
      state.sessions.push(String(uid));
    },
    async ListPlatformUsers() {
      return users
        .filter((u) => u.role.startsWith('platform_'))
        .map((u) => ({
          id: String(u._id), name: u.name, lastName: u.lastName, username: u.username, email: u.email, cellphone: '', role: u.role,
          createdAt: null, lastLoginAt: u.lastLoginAt || null, mfaEnabled: Boolean(u.mfaEnabled),
        }));
    },
    async CountPlatformAdmins() {
      return users.filter((u) => u.role === 'platform_admin').length;
    },
    async ListTenants() {
      return tenants;
    },
    async GetTenantById(id) {
      return tenants.find((t) => t.id === id) || null;
    },
    async UpdateTenant(id, patch) {
      // Como la base real: devuelve una copia nueva, no modifica el objeto que ya se leyó
      const i = tenants.findIndex((t) => t.id === id);
      tenants[i] = { ...tenants[i], ...patch };
      return tenants[i];
    },
    async GetSettings(id) {
      return { tenantId: id, businessName: tenants.find((t) => t.id === id)?.name };
    },
    async UpdateSettings() {},
    async ListUsersByTenant(tid) {
      return users.filter((u) => u.tenantId === tid).map((u) => ({
        id: String(u._id), name: u.name, lastName: u.lastName, username: u.username, email: u.email, cellphone: '', role: u.role,
        disabled: false, lastLoginAt: u.lastLoginAt || null, mfaEnabled: false,
      }));
    },
    async GetAiUsage() {
      return 3;
    },
    async ListAiUsage() {
      return tenants.map((t) => ({ tenantId: t.id, count: 3 }));
    },
    async GetSettingsMany(ids) {
      return new Map(ids.map((id) => [id, { tenantId: id, businessName: tenants.find((t) => t.id === id)?.name }]));
    },
    async ListUsersByTenants(ids) {
      return new Map(ids.map((id) => [id, users.filter((u) => u.tenantId === id).map((u) => ({
        id: String(u._id), name: u.name, lastName: u.lastName, username: u.username, email: u.email, cellphone: '', role: u.role,
        disabled: false, lastLoginAt: u.lastLoginAt || null, mfaEnabled: false,
      }))]));
    },
    async CountUsersByTenant(tid) {
      return users.filter((u) => u.tenantId === tid).length;
    },
    async CountPendingInvites() {
      return 0;
    },
    async CountFoods() {
      return 12;
    },
    async CreateBillingEvent(e) {
      state.billing.push(e);
    },
    async ListBillingEvents() {
      return state.billing;
    },
    async CreatePlatformAudit(e) {
      state.audit.push({ ...e, id: `x${state.audit.length}` });
    },
    async ListPlatformAudit({ tenantId = null, limit = 60 } = {}) {
      return state.audit.filter((a) => !tenantId || a.tenantId === tenantId).slice().reverse().slice(0, limit);
    },
    async ListSupportMailAll(opts = {}) {
      const me = String(opts.assignedTo || '').toLowerCase();
      return mail.filter((m) => m.tenantId && String(m.assignedTo || '').toLowerCase() === me);
    },
    async ListSupportMail(tenantId, opts = {}) {
      const me = String(opts.assignedTo || '').toLowerCase();
      return mail.filter((m) => m.tenantId === tenantId && String(m.assignedTo || '').toLowerCase() === me);
    },
    async ListUnmatchedSupportMail() {
      return [];
    },
    async CreatePlatformExpense(e) {
      return { id: 'e1', ...e };
    },
    async DeletePlatformExpense() {
      return true;
    },
    async DeleteUserById(id) {
      const i = users.findIndex((u) => String(u._id) === String(id));
      if (i >= 0) users.splice(i, 1);
      return i >= 0;
    },
    aiMonthKey: () => '2026-10',
  };
  return db;
}

async function start() {
  const db = platformDb();
  const file = require.resolve(path.join(root, 'database/mongodb.js'));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: db };
  for (const key of Object.keys(require.cache)) {
    if (/\/(services\/(session|support-mail|platform-audit|plan-limits|rate-limit)|controllers\/platform|middleware\/auth|routers\/platform)/.test(key)) {
      delete require.cache[key];
    }
  }
  const app = express();
  app.use(express.json());
  app.use('/platform', require('../routers/platform.router'));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = (username) => {
    const u = db.users.find((x) => x.username === username);
    return jwt.generateJWT({ userId: u.username, userRole: u.role, tenantId: u.tenantId || null, email: u.email, tv: u.tokenVersion || 0 });
  };
  const call = async (method, url, user, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenFor(user)}` },
      body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* texto plano */
    }
    return { status: res.status, json, text };
  };
  return { db, call, base, tokenFor, close: () => server.close() };
}

test('soporte: la bandeja trae solo MIS tickets, abiertos primero, con conteos y búsqueda', async () => {
  const { call, close } = await start();
  try {
    const all = await call('GET', '/platform/support', 'sofi');
    assert.equal(all.status, 200);
    assert.deepEqual(all.json.counts, { open: 1, answered: 1 });
    assert.deepEqual(all.json.items.map((t) => t.subject), ['No abre la caja', 'Factura']);
    assert.equal(all.json.items[0].status, 'open');
    assert.equal(all.json.items[0].businessName, 'Abarrotes Lupita');
    assert.ok(!all.json.items.some((t) => t.tenantId === 't2'), 'el ticket de Beto no se ve');

    const open = await call('GET', '/platform/support?status=open', 'sofi');
    assert.deepEqual(open.json.items.map((t) => t.ticketId), ['k1']);
    const answered = await call('GET', '/platform/support?status=answered', 'sofi');
    assert.deepEqual(answered.json.items.map((t) => t.ticketId), ['k2']);
    assert.equal((await call('GET', '/platform/support?q=factura', 'sofi')).json.items.length, 1);
    assert.equal((await call('GET', '/platform/support?q=zzz', 'sofi')).json.items.length, 0);

    // El admin también ve solo lo suyo (nada asignado a él): no puede espiar los de soporte
    const admin = await call('GET', '/platform/support', 'admin');
    assert.equal(admin.status, 200);
    assert.equal(admin.json.items.length, 0);
    const beto = await call('GET', '/platform/support', 'beto');
    assert.deepEqual(beto.json.items.map((t) => t.ticketId), ['k3']);
  } finally {
    close();
  }
});

test('permisos: una tienda no entra; soporte no ve dinero, equipo ni actividad global', async () => {
  const { call, close } = await start();
  try {
    assert.equal((await call('GET', '/platform/support', 'lupita')).status, 403, 'dueño de tienda');
    assert.equal((await call('GET', '/platform/tenants', 'lupita')).status, 403);
    assert.equal((await call('GET', '/platform/tenants', 'sofi')).status, 200);
    for (const [method, url] of [
      ['GET', '/platform/overview'],
      ['GET', '/platform/activity'],
      ['GET', '/platform/staff'],
      ['POST', '/platform/staff/s2/reset-mfa'],
      ['PATCH', '/platform/tenants/t1'],
      ['POST', '/platform/tenants/t1/suspend'],
    ]) {
      assert.equal((await call(method, url, 'sofi', {})).status, 403, `${method} ${url} como soporte`);
    }
    assert.equal((await call('GET', '/platform/activity', 'admin')).status, 200);
  } finally {
    close();
  }
});

test('cada cambio a un cliente queda en la auditoría con quién lo hizo', async () => {
  const { call, db, close } = await start();
  try {
    const plan = await call('PATCH', '/platform/tenants/t1/plan', 'admin', { plan: 'pro' });
    assert.equal(plan.status, 200);
    await call('POST', '/platform/tenants/t1/suspend', 'admin', { reason: 'falta de pago' });
    await call('POST', '/platform/tenants/t1/reactivate', 'admin', { mode: 'trial' });
    const edit = await call('PATCH', '/platform/tenants/t2', 'admin', {
      businessName: 'Farmacia Rosa Centro', plan: 'growth', billingStatus: 'active', phone: '', address: '', inventoryEnabled: true,
    });
    assert.equal(edit.status, 200);

    const types = db.state.audit.map((a) => a.type);
    assert.deepEqual(types, ['tenant_plan_changed', 'tenant_suspended', 'tenant_reactivated', 'tenant_updated']);
    assert.ok(db.state.audit.every((a) => a.actor === 'admin' && a.actorRole === 'platform_admin' && a.createdAt));
    assert.match(db.state.audit[0].message, /Básico → Pro/);
    assert.match(db.state.audit[1].message, /falta de pago/);
    assert.match(db.state.audit[3].message, /estado Prueba → Activo/);
    assert.match(db.state.audit[3].message, /nombre «Farmacia Rosa» → «Farmacia Rosa Centro»/);

    // Soporte puede ver la historia del cliente (pagos + acciones del equipo), ordenada y sin mezclar tiendas
    const history = await call('GET', '/platform/tenants/t1/activity', 'sofi');
    assert.equal(history.status, 200);
    const sources = new Set(history.json.items.map((i) => i.source));
    assert.deepEqual([...sources].sort(), ['billing', 'team']);
    const dates = history.json.items.map((i) => +new Date(i.at));
    assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
    assert.ok(!history.json.items.some((i) => /Farmacia Rosa/.test(i.message)), 'nada de t2');
    assert.equal((await call('GET', '/platform/tenants/nope/activity', 'sofi')).status, 404);

    const feed = await call('GET', '/platform/activity', 'admin');
    assert.equal(feed.json.items[0].businessName, 'Farmacia Rosa Centro', 'nombre actual de la tienda');
    assert.equal(feed.json.items[0].actor, 'admin');
  } finally {
    close();
  }
});

test('ficha del cliente: última vez que entró y uso del plan', async () => {
  const { call, close } = await start();
  try {
    const detail = await call('GET', '/platform/tenants/t1', 'sofi');
    assert.equal(detail.status, 200);
    assert.ok(detail.json.lastSeenAt, 'último acceso = el más reciente de sus usuarios');
    assert.equal(new Date(detail.json.lastSeenAt).getTime() > Date.now() - 2 * DAY, true, 'Pedro entró ayer');
    assert.equal(detail.json.usage.users.used, 2);
    assert.equal(detail.json.usage.products.used, 12);
    assert.ok(!JSON.stringify(detail.json).includes('password'));
    const list = await call('GET', '/platform/tenants', 'sofi');
    assert.equal(list.json.find((t) => t.id === 't1').waiting, 1, 'tickets por responder para quien pregunta');
  } finally {
    close();
  }
});

test('equipo: ve quién tiene 2FA y último acceso; el admin restablece el 2FA de otro (no el suyo)', async () => {
  const { call, db, close, base, tokenFor } = await start();
  try {
    const staff = await call('GET', '/platform/staff', 'admin');
    const beto = staff.json.find((p) => p.username === 'beto');
    assert.equal(beto.mfaEnabled, true);
    assert.equal(beto.lastLoginAt, null);
    assert.ok(staff.json.find((p) => p.username === 'sofi').lastLoginAt);
    assert.ok(!JSON.stringify(staff.json).match(/secret|password|recovery/i));

    const betoOldToken = tokenFor('beto');
    assert.equal((await call('POST', '/platform/staff/a1/reset-mfa', 'admin')).status, 400, 'no el propio');
    assert.equal((await call('POST', '/platform/staff/zzz/reset-mfa', 'admin')).status, 404);
    const ok = await call('POST', '/platform/staff/s2/reset-mfa', 'admin');
    assert.equal(ok.status, 200);
    const betoDb = db.users.find((u) => u.username === 'beto');
    assert.equal(betoDb.mfaEnabled, false);
    assert.equal(betoDb.mfaSecretEnc, null);
    assert.equal(betoDb.tokenVersion, 1, 'su sesión abierta deja de servir');
    assert.deepEqual(db.state.sessions, ['s2']);
    assert.equal(db.state.audit.at(-1).type, 'staff_mfa_reset');

    // Su sesión de antes ya no sirve; y aunque entre de nuevo, sin 2FA no pasa hasta activarlo
    const old = await fetch(`${base}/platform/tenants`, { headers: { authorization: `Bearer ${betoOldToken}` } });
    assert.equal(old.status, 401, 'su token anterior ya no sirve');
    const fresh = await call('GET', '/platform/tenants', 'beto');
    assert.equal(fresh.status, 403);
    assert.equal(fresh.json.code, 'MFA_SETUP_REQUIRED');
  } finally {
    close();
  }
});

test('quitar a alguien del equipo y anotar gastos también se audita', async () => {
  const { call, db, close } = await start();
  try {
    assert.equal((await call('POST', '/platform/expenses', 'admin', { label: 'Servidor', amount: 250 })).status, 201);
    assert.equal((await call('DELETE', '/platform/expenses/e1', 'admin')).status, 200);
    assert.equal((await call('DELETE', '/platform/staff/s2', 'admin')).status, 200);
    assert.deepEqual(db.state.audit.map((a) => a.type), ['expense_created', 'expense_deleted', 'staff_removed']);
  } finally {
    close();
  }
});

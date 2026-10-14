const test = require('node:test');
const assert = require('node:assert/strict');
const org = require('../services/org.service');

/** Tienda en memoria con las mismas reglas que database/org.db.js. */
function world({ plan = 'pro', status = 'active' } = {}) {
  let n = 0;
  const id = (p) => `${p}${++n}`;
  const tenants = new Map();
  const orgs = new Map();
  const users = new Map();
  const logs = [];
  const orders = [];
  const add = (t) => { const row = { id: id('t'), createdAt: new Date(2026, 0, n), ...t }; tenants.set(row.id, row); return row; };
  const matrix = add({ name: 'Abarrotes Lupita', plan, billingStatus: status, currentPeriodEnd: new Date(Date.now() + 864e5 * 20) });
  users.set('lupita', { _id: 'u1', username: 'lupita', role: 'admin', tenantId: matrix.id });
  users.set('segundo', { _id: 'u2', username: 'segundo', role: 'admin', tenantId: matrix.id });
  users.set('cajero', { _id: 'u3', username: 'cajero', role: 'cashier', tenantId: matrix.id });
  const outsider = add({ name: 'Otra tienda ajena', plan: 'pro', billingStatus: 'active' });
  users.set('ajeno', { _id: 'u9', username: 'ajeno', role: 'admin', tenantId: outsider.id });
  let failSeed = false;

  const eff = (t) => (t && t.isBranch ? { ...t, plan: tenants.get(t.matrixTenantId).plan, billingStatus: tenants.get(t.matrixTenantId).billingStatus, currentPeriodEnd: tenants.get(t.matrixTenantId).currentPeriodEnd } : t);
  const store = {
    async getRawTenant(i) { return tenants.get(String(i)) || null; },
    async getEffectiveTenant(i) { return eff(tenants.get(String(i))) || null; },
    async updateRawTenant(i, patch) { Object.assign(tenants.get(String(i)), patch); return tenants.get(String(i)); },
    async deleteRawTenant(i) { tenants.delete(String(i)); },
    async createBranchTenant({ name, organizationId, matrixTenantId }) { return add({ name, organizationId, matrixTenantId, isBranch: true, billingStatus: 'trialing' }); },
    async getOrgByOwner(u) { return [...orgs.values()].find((o) => o.ownerUsername === u) || null; },
    async createOrg(doc) { const o = { id: id('o'), ...doc }; orgs.set(o.id, o); return o; },
    async updateOrg(i, patch) { Object.assign(orgs.get(i), patch); return orgs.get(i); },
    async deleteOrg(i) { orgs.delete(i); },
    async listOrgTenants(orgId) { return [...tenants.values()].filter((t) => t.organizationId === orgId); },
    async getUser(u) { return users.get(u) || null; },
    async oldestActiveAdmin(tid) { return [...users.values()].filter((u) => u.tenantId === tid && u.role === 'admin' && !u.disabled && !u.linkedOwner).sort((a, b) => a._id.localeCompare(b._id))[0] || null; },
    async findLinkedUser(tid, owner) { return [...users.values()].find((u) => u.tenantId === String(tid) && u.linkedOwner === owner) || null; },
    async createLinkedUser({ tenantId, ownerUsername, branchName }) {
      const u = { _id: id('u'), username: `sucursal-${tenantId}`, role: 'admin', tenantId, linkedOwner: ownerUsername, name: 'Sucursal', lastName: branchName };
      users.set(u.username, u);
      return u;
    },
    async deleteUser(uid) { for (const [k, v] of users) if (v._id === uid) users.delete(k); },
    async seedBranch() { if (failSeed) throw new Error('falló el catálogo'); },
    async log(tid, entry) { logs.push({ tid, ...entry }); },
    async salesByTenant(ids) {
      return ids.map((tid) => {
        const own = orders.filter((o) => o.tenantId === tid && o.paymentStatus === 'paid');
        return { tenantId: tid, sales: own.reduce((s, o) => s + o.total, 0), tickets: own.length, refunded: 0, refundedTotal: 0, credit: 0 };
      }).filter((r) => r.tickets);
    },
    async dailySales(ids) {
      return orders.filter((o) => ids.includes(o.tenantId) && o.paymentStatus === 'paid').map((o) => ({ day: o.day, tenantId: o.tenantId, sales: o.total }));
    },
    async balanceByTenant() { return new Map(); },
  };
  const P = (username, tenantId, extra = {}) => ({ username, role: users.get(username).role, tenantId, ...extra });
  return { store, tenants, orgs, users, logs, orders, matrix, outsider, P, setFailSeed: (v) => (failSeed = v) };
}

test('el dueño funda la organización al crear la primera sucursal; la matriz queda enlazada', async () => {
  const w = world();
  const r = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: '  Sucursal   Centro ' });
  assert.equal(r.founded, true);
  assert.equal(r.branch.name, 'Sucursal Centro', 'se limpian los espacios');
  assert.equal(w.tenants.get(w.matrix.id).organizationId, r.organizationId);
  const branch = w.tenants.get(r.branch.id);
  assert.equal(branch.isBranch, true);
  assert.equal(branch.matrixTenantId, w.matrix.id);
  assert.equal(w.logs[0].type, 'org_created');
});

test('la sucursal recibe una cuenta técnica ligada al dueño, sin correo y de la sucursal', async () => {
  const w = world();
  const r = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  const linked = [...w.users.values()].find((u) => u.linkedOwner === 'lupita');
  assert.equal(linked.tenantId, r.branch.id);
  assert.equal(linked.role, 'admin');
  assert.equal(linked.email, undefined);
});

test('el plan limita las sucursales, contando la matriz', async () => {
  const w = world({ plan: 'pro' }); // Pro: 5
  for (const n of ['A', 'B', 'C', 'D']) await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: `Sucursal ${n}` });
  await assert.rejects(org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Sucursal E' }), (e) => e.code === 'BRANCH_LIMIT' && /hasta 5 sucursales/.test(e.message));
  const basic = world({ plan: 'basic' });
  await assert.rejects(org.createBranch(basic.store, basic.P('lupita', basic.matrix.id), { name: 'Otra' }), (e) => e.code === 'BRANCH_LIMIT' && /plan Pro/.test(e.message));
  assert.equal(basic.orgs.size, 0, 'no se crea la organización si no se puede');
});

test('una tienda sin suscripción activa no puede abrir sucursales', async () => {
  const w = world({ status: 'suspended' });
  await assert.rejects(org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' }), (e) => e.code === 'SUBSCRIPTION_REQUIRED');
});

test('solo el dueño (el administrador más antiguo) puede crear sucursales; cajeros y otros administradores no', async () => {
  const w = world();
  await assert.rejects(org.createBranch(w.store, w.P('segundo', w.matrix.id), { name: 'Centro' }), (e) => e.code === 'NOT_ORG_OWNER');
  await assert.rejects(org.createBranch(w.store, w.P('cajero', w.matrix.id), { name: 'Centro' }), (e) => e.code === 'NOT_ORG_OWNER');
  await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  // ya con organización, el segundo administrador sigue sin poder
  await assert.rejects(org.createBranch(w.store, w.P('segundo', w.matrix.id), { name: 'Norte' }), (e) => e.code === 'NOT_ORG_OWNER');
});

test('nombres: mínimo 2 letras y sin repetir', async () => {
  const w = world();
  await assert.rejects(org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'A' }), /entre 2 y 60/);
  await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  await assert.rejects(org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'centro' }), (e) => e.code === 'DUPLICATE_NAME');
});

test('si falla al armar la sucursal, se deshace todo (sin organización ni tienda ni cuenta huérfanas)', async () => {
  const w = world();
  w.setFailSeed(true);
  await assert.rejects(org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' }), /falló el catálogo/);
  assert.equal(w.orgs.size, 0);
  assert.equal(w.tenants.get(w.matrix.id).organizationId, null);
  assert.equal([...w.tenants.values()].filter((t) => t.isBranch).length, 0);
  assert.equal([...w.users.values()].filter((u) => u.linkedOwner).length, 0);
  w.setFailSeed(false);
  const ok = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  assert.equal(ok.founded, true, 'después de un fallo se puede reintentar');
});

test('cambiar de sucursal: el dueño obtiene la cuenta técnica de la sucursal o su propia cuenta en la matriz', async () => {
  const w = world();
  const { branch } = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  const toBranch = await org.switchTarget(w.store, w.P('lupita', w.matrix.id), branch.id);
  assert.equal(toBranch.user.linkedOwner, 'lupita');
  assert.equal(toBranch.user.tenantId, branch.id);
  // ya dentro de la sucursal (sesión de la cuenta técnica), puede volver a la matriz
  const linked = toBranch.user;
  const back = await org.switchTarget(w.store, { username: linked.username, role: 'admin', tenantId: branch.id, linkedOwner: 'lupita' }, w.matrix.id);
  assert.equal(back.user.username, 'lupita');
  assert.equal(w.logs.filter((l) => l.type === 'branch_switch').length, 2, 'cada cambio queda registrado');
});

test('nadie más puede cambiar de sucursal ni entrar a sucursales ajenas', async () => {
  const w = world();
  const { branch } = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  await assert.rejects(org.switchTarget(w.store, w.P('segundo', w.matrix.id), branch.id), (e) => e.code === 'NOT_ORG_OWNER');
  await assert.rejects(org.switchTarget(w.store, w.P('cajero', w.matrix.id), branch.id), (e) => e.code === 'NOT_ORG_OWNER');
  await assert.rejects(org.switchTarget(w.store, w.P('ajeno', w.outsider.id), branch.id), (e) => e.code === 'NOT_ORG_OWNER');
  // el dueño no puede entrar a una tienda que no es de su organización
  await assert.rejects(org.switchTarget(w.store, w.P('lupita', w.matrix.id), w.outsider.id), (e) => e.status === 404);
  // una cuenta técnica con un dueño inventado no funciona
  await assert.rejects(org.switchTarget(w.store, { username: 'sucursal-x', role: 'admin', tenantId: branch.id, linkedOwner: 'ajeno' }, w.matrix.id), (e) => e.code === 'NOT_ORG_OWNER');
});

test('si el dueño deja de ser administrador o se desactiva, sus sucursales dejan de abrirse', async () => {
  const w = world();
  const { branch } = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  const linked = { username: `sucursal-${branch.id}`, role: 'admin', tenantId: branch.id, linkedOwner: 'lupita' };
  w.users.get('lupita').disabled = true;
  await assert.rejects(org.switchTarget(w.store, linked, w.matrix.id), (e) => e.code === 'NOT_ORG_OWNER');
  w.users.get('lupita').disabled = false;
  w.users.get('lupita').role = 'cashier';
  await assert.rejects(org.overview(w.store, linked).then((o) => { if (!o.isOwner) throw org.errNotOwner(); return o; }), (e) => e.code === 'NOT_ORG_OWNER');
});

test('baja lógica: no se borra nada, no se puede entrar y la matriz o la sucursal actual no se pueden dar de baja', async () => {
  const w = world();
  const { branch } = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  await assert.rejects(org.setSuspended(w.store, w.P('lupita', w.matrix.id), w.matrix.id, true), /matriz/);
  const inBranch = { username: `sucursal-${branch.id}`, role: 'admin', tenantId: branch.id, linkedOwner: 'lupita' };
  await assert.rejects(org.setSuspended(w.store, inBranch, branch.id, true), /en la que estás/);
  await org.setSuspended(w.store, w.P('lupita', w.matrix.id), branch.id, true);
  assert.ok(w.tenants.get(branch.id).branchSuspendedAt);
  await assert.rejects(org.switchTarget(w.store, w.P('lupita', w.matrix.id), branch.id), (e) => e.code === 'BRANCH_SUSPENDED');
  await org.setSuspended(w.store, w.P('lupita', w.matrix.id), branch.id, false);
  assert.equal(w.tenants.get(branch.id).branchSuspendedAt, null);
});

test('la baja libera un lugar y reactivar respeta el límite del plan', async () => {
  const w = world({ plan: 'pro' });
  const ids = [];
  for (const n of ['A', 'B', 'C', 'D']) ids.push((await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: `S${n}` })).branch.id);
  await org.setSuspended(w.store, w.P('lupita', w.matrix.id), ids[0], true);
  const nueva = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Nueva' });
  assert.ok(nueva.branch.id, 'la baja dejó espacio');
  await assert.rejects(org.setSuspended(w.store, w.P('lupita', w.matrix.id), ids[0], false), (e) => e.code === 'BRANCH_LIMIT');
});

test('el reporte consolidado suma solo las sucursales de la organización y nunca tiendas ajenas', async () => {
  const w = world();
  const { branch } = await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  w.orders.push(
    { tenantId: w.matrix.id, paymentStatus: 'paid', total: 100, day: '2026-03-01' },
    { tenantId: w.matrix.id, paymentStatus: 'paid', total: 50, day: '2026-03-02' },
    { tenantId: branch.id, paymentStatus: 'paid', total: 200, day: '2026-03-01' },
    { tenantId: w.outsider.id, paymentStatus: 'paid', total: 99999, day: '2026-03-01' }
  );
  const s = await org.consolidatedSummary(w.store, w.P('lupita', w.matrix.id), { from: '2026-03-01', to: '2026-03-31' });
  assert.equal(s.total.sales, 350, 'la tienda ajena no cuenta');
  assert.equal(s.total.tickets, 3);
  assert.equal(s.total.average, 116.67);
  assert.deepEqual(s.daily, [{ day: '2026-03-01', sales: 300 }, { day: '2026-03-02', sales: 50 }]);
  assert.equal(s.branches.find((b) => b.isMatrix).sales, 150);
  await assert.rejects(org.consolidatedSummary(w.store, w.P('segundo', w.matrix.id), { from: '2026-03-01', to: '2026-03-31' }), (e) => e.code === 'NOT_ORG_OWNER');
  await assert.rejects(org.consolidatedSummary(w.store, w.P('lupita', w.matrix.id), { from: '2020-01-01', to: '2026-03-31' }), /2 años/);
  await assert.rejects(org.consolidatedSummary(w.store, w.P('lupita', w.matrix.id), { from: 'x', to: 'y' }), /inválido/);
});

test('CSV consolidado: encabezado, una fila por sucursal y total, con comillas escapadas', async () => {
  const w = world();
  await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro "Plaza"' });
  const csv = org.toCsv(await org.consolidatedSummary(w.store, w.P('lupita', w.matrix.id), { from: '2026-03-01', to: '2026-03-31' }));
  const lines = csv.trim().split('\r\n');
  assert.match(lines[0], /Sucursal.*Ventas.*Tickets/);
  assert.equal(lines.length, 4);
  assert.match(csv, /"Centro ""Plaza"""/);
  assert.match(lines[3], /^"Total"/);
});

test('resumen: quién puede fundar y qué ve el dueño', async () => {
  const w = world();
  assert.equal((await org.overview(w.store, w.P('lupita', w.matrix.id))).canCreate, true);
  assert.equal((await org.overview(w.store, w.P('segundo', w.matrix.id))).isOwner, false);
  assert.equal((await org.overview(w.store, w.P('cajero', w.matrix.id))).isOwner, false);
  await org.createBranch(w.store, w.P('lupita', w.matrix.id), { name: 'Centro' });
  const o = await org.overview(w.store, w.P('lupita', w.matrix.id));
  assert.equal(o.limit, 5);
  assert.equal(o.active, 2);
  assert.deepEqual(o.branches.map((b) => [b.name, b.isMatrix, b.current]), [['Abarrotes Lupita', true, true], ['Centro', false, false]]);
  const basic = world({ plan: 'basic' });
  const b = await org.overview(basic.store, basic.P('lupita', basic.matrix.id));
  assert.equal(b.canCreate, false, 'en Básico no hay sucursales');
  assert.equal(b.limit, 1);
});

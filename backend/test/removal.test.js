const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const purge = require('../database/entity-purge');
const removal = require('../services/removal.service');

/** Base falsa: cada colección guarda sus documentos y entiende deleteMany/deleteOne/updateMany/find con los filtros que usa el borrado. */
function fakeMongo(seed) {
  const data = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((d) => ({ ...d }))]));
  const matches = (doc, filter) =>
    Object.entries(filter).every(([k, cond]) => {
      const v = doc[k];
      if (cond && cond.$in) return cond.$in.some((c) => String(c) === String(v));
      return String(cond) === String(v);
    });
  const col = (name) => {
    data[name] = data[name] || [];
    return {
      async deleteMany(filter) {
        const keep = data[name].filter((d) => !matches(d, filter));
        const deletedCount = data[name].length - keep.length;
        data[name] = keep;
        return { deletedCount };
      },
      async deleteOne(filter) {
        const i = data[name].findIndex((d) => matches(d, filter));
        if (i >= 0) data[name].splice(i, 1);
        return { deletedCount: i >= 0 ? 1 : 0 };
      },
      async updateMany(filter, update) {
        let n = 0;
        for (const d of data[name]) if (matches(d, filter)) { for (const k of Object.keys(update.$unset || {})) delete d[k]; n += 1; }
        return { modifiedCount: n };
      },
      find(filter) {
        return { toArray: async () => data[name].filter((d) => matches(d, filter)) };
      },
    };
  };
  return { data, col };
}

const T1 = new ObjectId();
const T2 = new ObjectId();
const R1 = new ObjectId();

function world() {
  return fakeMongo({
    tenants: [{ _id: T1, name: 'Abarrotes Lupe', referrerId: String(R1) }, { _id: T2, name: 'Otra tienda' }],
    foods: [{ tenantId: String(T1) }, { tenantId: String(T1) }, { tenantId: String(T2) }],
    orders: [{ tenantId: String(T1) }, { tenantId: T1 }, { tenantId: String(T2) }],
    users: [{ _id: new ObjectId(), tenantId: String(T1) }, { _id: new ObjectId(), tenantId: String(T2) }, { _id: new ObjectId(), partnerId: String(R1) }],
    settings: [{ tenantId: String(T1), businessName: 'Abarrotes Lupe' }],
    billing_events: [{ tenantId: String(T1), amount: 349 }],
    referral_commissions: [{ referrerId: String(R1), tenantId: String(T1), commission: 50, status: 'paid' }],
    referrers: [{ _id: R1, name: 'Ana Vendedora', code: 'MT-AAAAAA' }],
    partner_notes: [{ partnerId: String(R1) }],
  });
}

test('borrar una tienda quita sus datos (con el id como texto o como ObjectId) y no toca a las demás', async () => {
  const w = world();
  const removed = await purge.purgeTenant(w.col, String(T1));
  assert.deepEqual(removed, { foods: 2, orders: 2, users: 1, settings: 1, tenants: 1 });
  assert.equal(w.data.foods.length, 1);
  assert.equal(w.data.tenants.length, 1);
  assert.equal(w.data.tenants[0].name, 'Otra tienda');
  assert.equal(w.data.users.filter((u) => u.tenantId).length, 1);
});

test('el historial del dinero se conserva: cobros, comisiones y liquidaciones', async () => {
  const w = world();
  await purge.purgeTenant(w.col, String(T1));
  assert.equal(w.data.billing_events.length, 1);
  assert.equal(w.data.referral_commissions.length, 1);
});

test('borrar un vendedor quita su registro, su acceso y sus notas; sus tiendas quedan sin vendedor y su historial de comisiones se queda', async () => {
  const w = world();
  const removed = await purge.purgeReferrer(w.col, String(R1));
  assert.deepEqual(removed, { users: 1, partner_notes: 1, tenants_sin_vendedor: 1, referrers: 1 });
  assert.equal(w.data.referrers.length, 0);
  assert.equal('referrerId' in w.data.tenants.find((t) => String(t._id) === String(T1)), false);
  assert.equal(w.data.referral_commissions.length, 1);
});

function deps(w, over = {}) {
  const revoked = [];
  const cancelled = [];
  const transfers = [];
  const tenants = w.data.tenants.map((t) => ({ ...t, id: String(t._id) }));
  return {
    revoked,
    cancelled,
    db: {
      GetTenantById: async (id) => tenants.find((t) => t.id === String(id)) || null,
      GetSettings: async (id) => w.data.settings.find((s) => s.tenantId === String(id)) || null,
      ListTenants: async () => tenants,
      ListUsersByTenant: async (id) => w.data.users.filter((u) => u.tenantId === String(id)).map((u) => ({ ...u, id: String(u._id) })),
      ...(over.db || {}),
    },
    mp: { cancelPreapproval: async (id) => { cancelled.push(id); if (over.mpFails) throw new Error('MP caído'); } },
    refDb: {
      GetReferrerById: async (id) => w.data.referrers.map((r) => ({ ...r, id: String(r._id) })).find((r) => r.id === String(id)) || null,
      SumCommissions: async () => over.sums || [],
    },
    referrals: {
      transferReferrer: async ({ fromId, toId }) => {
        if (String(fromId) === String(toId)) throw Object.assign(new Error('Elige a otro vendedor.'), { status: 400 });
        transfers.push([String(fromId), String(toId)]);
        return { commissions: 1, payouts: 0, tenants: 1 };
      },
    },
    transfers,
    col: w.col,
    revokeSessions: async (id) => revoked.push(String(id)),
  };
}

test('eliminar una tienda exige escribir su nombre exacto (sin importar mayúsculas ni espacios de más)', async () => {
  const w = world();
  const d = deps(w);
  await assert.rejects(removal.removeTenant(d, String(T1), ''), (e) => e.status === 400 && /Abarrotes Lupe/.test(e.message));
  await assert.rejects(removal.removeTenant(d, String(T1), 'Abarrotes'), (e) => e.status === 400);
  assert.equal(w.data.tenants.length, 2, 'sin confirmar no se borra nada');
  const r = await removal.removeTenant(d, String(T1), '  abarrotes   LUPE ');
  assert.equal(r.name, 'Abarrotes Lupe');
  assert.equal(w.data.tenants.length, 1);
  assert.equal(d.revoked.length, 1, 'se cierran las sesiones de sus usuarios');
});

test('una matriz con sucursales no se elimina; una sucursal tampoco desde aquí; una tienda que no existe da 404', async () => {
  const w = world();
  w.data.tenants.push({ _id: new ObjectId(), name: 'Sucursal', isBranch: true, matrixTenantId: String(T1) });
  const d = deps(w);
  await assert.rejects(removal.removeTenant(d, String(T1), 'Abarrotes Lupe'), (e) => e.status === 409 && /sucursal/.test(e.message));
  const branch = w.data.tenants.find((t) => t.isBranch);
  await assert.rejects(removal.removeTenant(deps(w), String(branch._id), 'Sucursal'), (e) => e.status === 409);
  await assert.rejects(removal.removeTenant(d, String(new ObjectId()), 'x'), (e) => e.status === 404);
});

test('si tiene suscripción de Mercado Pago se cancela antes; si no se puede cancelar, no se borra nada', async () => {
  const w = world();
  w.data.tenants[0].mpPreapprovalId = 'pre_123';
  const bad = deps(w, { mpFails: true });
  await assert.rejects(removal.removeTenant(bad, String(T1), 'Abarrotes Lupe'), (e) => e.status === 502);
  assert.equal(w.data.tenants.length, 2, 'la tienda sigue ahí');
  assert.equal(w.data.foods.length, 3);
  const ok = deps(w);
  await removal.removeTenant(ok, String(T1), 'Abarrotes Lupe');
  assert.deepEqual(ok.cancelled, ['pre_123']);
  assert.equal(w.data.tenants.length, 1);
});

test('eliminar un vendedor exige su nombre, y no deja si tiene comisiones por pagar', async () => {
  const w = world();
  await assert.rejects(removal.removeReferrer(deps(w), String(R1), 'otro nombre'), (e) => e.status === 400);
  const owing = deps(w, { sums: [{ referrerId: String(R1), status: 'pending', total: 120.5, count: 2 }] });
  await assert.rejects(removal.removeReferrer(owing, String(R1), 'Ana Vendedora'), (e) => e.status === 409 && /120\.50/.test(e.message));
  assert.equal(w.data.referrers.length, 1);
  const free = deps(w, { sums: [{ referrerId: String(R1), status: 'paid', total: 50, count: 1 }] });
  const r = await removal.removeReferrer(free, String(R1), 'ana vendedora');
  assert.equal(r.code, 'MT-AAAAAA');
  assert.equal(w.data.referrers.length, 0);
  assert.equal(free.revoked.length, 1, 'se cierran las sesiones de sus accesos al portal');
  await assert.rejects(removal.removeReferrer(free, String(new ObjectId()), 'x'), (e) => e.status === 404);
});

test('eliminar un vendedor pasando su historial a otro: no se bloquea por comisiones por pagar y avisa a quién pasó', async () => {
  const w = world();
  const d = deps(w, { sums: [{ referrerId: String(R1), status: 'pending', total: 120.5, count: 2 }] });
  await assert.rejects(removal.removeReferrer(d, String(R1), 'Ana Vendedora', { transferTo: String(R1) }), (e) => e.status === 400);
  assert.equal(w.data.referrers.length, 1, 'si el traspaso falla no se borra');
  const r = await removal.removeReferrer(d, String(R1), 'Ana Vendedora', { transferTo: 'otro-id' });
  assert.deepEqual(d.transfers, [[String(R1), 'otro-id']]);
  assert.equal(r.transferred.commissions, 1);
  assert.equal(w.data.referrers.length, 0);
});

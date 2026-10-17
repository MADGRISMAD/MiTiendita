const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/mongodb');
const { exchangeWithSupplier } = require('../services/inventory.service');

const OID = (n) => String(n).padStart(24, '0');
const T = 'tenant1';

function fakeDb({ food, lots = [] }) {
  const state = { lots: lots.map((l) => ({ ...l })), created: [], exchanges: [], logs: [], foodPatch: null };
  db.GetFoodById = async () => food;
  db.GetSupplierById = async (id) => (id === OID(9) ? { id: OID(9), name: 'Coca-Cola FEMSA' } : null);
  db.ConsumeSaleLots = async (_id, qty) => {
    const out = [];
    let left = qty;
    for (const l of state.lots.filter((x) => x.quantity > 0).sort((a, b) => a.expiresAt - b.expiresAt)) {
      const take = Math.min(l.quantity, left);
      l.quantity -= take;
      left -= take;
      out.push({ lotId: l.id, qty: take, lot: l.lot, expiresAt: l.expiresAt });
      if (left <= 0) break;
    }
    return out;
  };
  db.TakeFromLot = async (id, qty) => {
    const l = state.lots.find((x) => x.id === id && x.quantity >= qty);
    if (!l) return null;
    l.quantity -= qty;
    return l;
  };
  db.CreateLot = async (data) => {
    const lot = { ...data, id: OID(100 + state.created.length) };
    state.created.push(lot);
    return lot;
  };
  db.UpdateFood = async (_id, patch) => { state.foodPatch = patch; };
  db.CreateExchange = async (data) => {
    const row = { ...data, id: OID(500) };
    state.exchanges.push(row);
    return row;
  };
  db.CreateActivityLog = async (e) => { state.logs.push(e); };
  return state;
}

const food = { id: OID(1), name: 'Coca Cola 600 ml', stock: 20, cost: 14, tracksExpiry: true };
const old = { id: OID(2), lot: 'L-VIEJO', expiresAt: new Date('2026-11-01'), quantity: 20 };

test('canje parejo: sale el lote viejo, entra el nuevo, la existencia no cambia y queda registrado', async () => {
  const s = fakeDb({ food, lots: [old] });
  const ex = await exchangeWithSupplier({
    tenantId: T,
    user: { username: 'dueño' },
    body: { foodId: OID(1), supplierId: OID(9), quantity: 6, newExpiresAt: '2027-03-01', newLot: 'L-NUEVO', note: 'por caducar' },
  });
  assert.equal(s.lots[0].quantity, 14); // salieron 6 del lote viejo
  assert.equal(s.created.length, 1);
  assert.equal(s.created[0].quantity, 6);
  assert.equal(s.created[0].lot, 'L-NUEVO');
  assert.equal(ex.supplierName, 'Coca-Cola FEMSA');
  assert.equal(ex.value, 84);
  assert.equal(s.logs[0].type, 'supplier_exchange');
});

test('pide proveedor, cantidad válida y caducidad de lo nuevo', async () => {
  fakeDb({ food, lots: [old] });
  const base = { foodId: OID(1), supplierId: OID(9), quantity: 3, newExpiresAt: '2027-03-01' };
  await assert.rejects(() => exchangeWithSupplier({ tenantId: T, body: { ...base, supplierId: '' } }), /proveedor/i);
  await assert.rejects(() => exchangeWithSupplier({ tenantId: T, body: { ...base, quantity: 0 } }), /cuántas piezas/);
  await assert.rejects(() => exchangeWithSupplier({ tenantId: T, body: { ...base, quantity: 99 } }), /no puedes cambiar más/);
  await assert.rejects(() => exchangeWithSupplier({ tenantId: T, body: { ...base, newExpiresAt: '' } }), /caducidad/);
});

test('se puede indicar de qué lote salen las piezas viejas', async () => {
  const s = fakeDb({ food, lots: [old, { id: OID(3), lot: 'L-OTRO', expiresAt: new Date('2027-01-01'), quantity: 5 }] });
  await exchangeWithSupplier({ tenantId: T, body: { foodId: OID(1), supplierId: OID(9), quantity: 4, lotId: OID(3), newExpiresAt: '2027-05-01' } });
  assert.equal(s.lots[1].quantity, 1);
  assert.equal(s.lots[0].quantity, 20);
  await assert.rejects(() => exchangeWithSupplier({ tenantId: T, body: { foodId: OID(1), supplierId: OID(9), quantity: 4, lotId: OID(3), newExpiresAt: '2027-05-01' } }), /no tiene tantas/);
});

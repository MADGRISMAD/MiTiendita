const test = require('node:test');
const assert = require('node:assert/strict');
const svc = require('../services/stocktake.service');

const foods = () => [
  { id: 'a', name: 'Refresco 600ml', stock: 10, menuId: 'm1', barcode: '750100' },
  { id: 'b', name: 'Jitomate', stock: 4.5, menuId: 'm2', saleUnit: 'kg' },
  { id: 'c', name: 'Servicio sin stock', menuId: 'm2' },
  { id: 'd', name: 'Leche', stock: 6, menuId: 'm1', tracksExpiry: true },
];

/** Tienda en memoria con lo que usa applyStocktake. */
function fakeStore(rows) {
  const data = new Map(rows.map((r) => [r.id, { ...r }]));
  const logs = [];
  const lots = [];
  return {
    data, logs, lots,
    async getFood(id) { return data.get(id) ? { ...data.get(id) } : null; },
    async addStock(id, delta) { data.get(id).stock = Math.round((data.get(id).stock + delta) * 1000) / 1000; },
    async takeLots(id, qty) { lots.push({ id, took: qty }); },
    async addLot(food, qty) { lots.push({ id: food.id, added: qty }); },
    async log(entry) { logs.push(entry); },
  };
}

test('un conteo nuevo toma solo productos con existencias y guarda la foto del sistema', () => {
  const lines = svc.buildLines(foods(), { menuNames: { m1: 'Bebidas', m2: 'Frutas' } });
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.name), ['Jitomate', 'Leche', 'Refresco 600ml']);
  assert.equal(lines.find((l) => l.name === 'Jitomate').expected, 4.5);
  assert.equal(lines.find((l) => l.name === 'Jitomate').unit, 'kg');
  assert.ok(lines.every((l) => l.counted === null));
});

test('conteo por categoría: solo esa categoría', () => {
  const lines = svc.buildLines(foods(), { menuId: 'm1', menuNames: { m1: 'Bebidas' } });
  assert.deepEqual(lines.map((l) => l.name), ['Leche', 'Refresco 600ml']);
  assert.ok(lines.every((l) => l.category === 'Bebidas'));
});

test('capturar: guarda a medias, valida números y no acepta productos ajenos', () => {
  const t = { status: 'open', lines: svc.buildLines(foods()) };
  svc.mergeCounts(t, [{ foodId: 'a', counted: '8' }]);
  assert.equal(t.lines.find((l) => l.foodId === 'a').counted, 8);
  assert.throws(() => svc.mergeCounts(t, [{ foodId: 'a', counted: -1 }]), /de 0 en adelante/);
  assert.throws(() => svc.mergeCounts(t, [{ foodId: 'a', counted: 'abc' }]), /de 0 en adelante/);
  assert.throws(() => svc.mergeCounts(t, [{ foodId: 'zzz', counted: 1 }]), /no pertenece/);
  svc.mergeCounts(t, [{ foodId: 'a', counted: null }]);
  assert.equal(t.lines.find((l) => l.foodId === 'a').counted, null, 'se puede borrar lo capturado');
  t.status = 'applied';
  assert.throws(() => svc.mergeCounts(t, [{ foodId: 'a', counted: 1 }]), (e) => e.code === 'stocktake_closed');
});

test('resumen: faltantes, sobrantes y su valor al costo', () => {
  const t = { status: 'open', lines: svc.buildLines(foods()) };
  svc.mergeCounts(t, [{ foodId: 'a', counted: 8 }, { foodId: 'b', counted: 5 }, { foodId: 'd', counted: 6 }]);
  const s = svc.summarize(t, (id) => ({ a: 10, b: 20 }[id] || 0));
  assert.equal(s.total, 3);
  assert.equal(s.counted, 3);
  assert.equal(s.withDiff, 2);
  assert.equal(s.shortage, 2);
  assert.equal(s.surplus, 0.5);
  assert.equal(s.shortageValue, 20);
  assert.equal(s.surplusValue, 10);
});

test('contar después de vender no resta la venta dos veces; vender después de contar tampoco la pierde', async () => {
  const t = { id: 't1', status: 'open', lines: svc.buildLines(foods()) };
  const store = fakeStore(foods());
  // Al abrir había 10 refrescos. Se vendieron 3 (sistema: 7) y recién entonces se cuenta el estante: hay 7.
  store.data.get('a').stock = 7;
  svc.mergeCounts(t, [{ foodId: 'a', counted: 7 }], { a: 7 });
  assert.equal(svc.lineDiff(t.lines.find((l) => l.foodId === 'a')), 0, 'contado 7 contra 7 del sistema: sin diferencia');
  // Se cuenta el jitomate: el sistema dice 4.5 y hay 4 (faltan 0.5). Después se venden 1.5 kg más antes de aplicar.
  svc.mergeCounts(t, [{ foodId: 'b', counted: 4 }], { b: 4.5 });
  store.data.get('b').stock = 3;
  const r = await svc.applyStocktake(t, store, { user: 'ana' });
  assert.equal(r.applied.length, 1);
  assert.equal(store.data.get('b').stock, 2.5, 'la venta posterior se conserva: 3 − 0.5');
  assert.equal(store.data.get('a').stock, 7);
});

test('aplicar con diferencia exacta no cambia nada y no escribe bitácora', async () => {
  const t = { id: 't2', status: 'open', lines: svc.buildLines(foods()) };
  const store = fakeStore(foods());
  svc.mergeCounts(t, [{ foodId: 'a', counted: 10 }, { foodId: 'b', counted: 4.5 }]);
  const r = await svc.applyStocktake(t, store, { user: 'ana' });
  assert.equal(r.applied.length, 0);
  assert.equal(store.logs.length, 0);
  assert.equal(store.data.get('a').stock, 10);
});

test('aplicar: ajusta cada renglón contado, deja bitácora y toca lotes solo en productos con caducidad', async () => {
  const t = { id: 't3', status: 'open', lines: svc.buildLines(foods()) };
  const store = fakeStore(foods());
  svc.mergeCounts(t, [{ foodId: 'a', counted: 12, note: 'estaba en bodega' }, { foodId: 'd', counted: 4 }]);
  const r = await svc.applyStocktake(t, store, { user: 'ana' });
  assert.equal(r.summary.pending, 1, 'Jitomate quedó sin contar: no se toca');
  assert.equal(store.data.get('a').stock, 12);
  assert.equal(store.data.get('d').stock, 4);
  assert.equal(store.data.get('b').stock, 4.5);
  assert.deepEqual(store.lots, [{ id: 'd', took: 2 }], 'restar en un producto con caducidad consume lotes');
  assert.equal(store.logs.length, 2);
  assert.match(store.logs.find((l) => l.meta.foodId === 'a').message, /Conteo de Refresco 600ml: 10 → 12 \(\+2\).*estaba en bodega/);
  assert.equal(store.logs[0].user, 'ana');
});

test('aplicar: un conteo ya aplicado, cancelado o sin nada contado se rechaza', async () => {
  const lines = svc.buildLines(foods());
  const store = fakeStore(foods());
  await assert.rejects(svc.applyStocktake({ id: 'x', status: 'applied', lines }, store), (e) => e.code === 'stocktake_applied');
  await assert.rejects(svc.applyStocktake({ id: 'x', status: 'cancelled', lines }, store), (e) => e.code === 'stocktake_closed');
  await assert.rejects(svc.applyStocktake({ id: 'x', status: 'open', lines }, store), (e) => e.code === 'nothing_counted');
});

test('aplicar exigiendo todo contado avisa cuántos faltan', async () => {
  const t = { id: 't4', status: 'open', lines: svc.buildLines(foods()) };
  svc.mergeCounts(t, [{ foodId: 'a', counted: 9 }]);
  await assert.rejects(svc.applyStocktake(t, fakeStore(foods()), { skipUncounted: false }), (e) => e.code === 'pending_lines' && /Faltan 2/.test(e.message));
});

test('un producto borrado durante el conteo se omite sin romper el resto', async () => {
  const t = { id: 't5', status: 'open', lines: svc.buildLines(foods()) };
  const store = fakeStore(foods().filter((f) => f.id !== 'a'));
  svc.mergeCounts(t, [{ foodId: 'a', counted: 1 }, { foodId: 'b', counted: 5 }]);
  const r = await svc.applyStocktake(t, store);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.applied.length, 1);
  assert.equal(store.data.get('b').stock, 5);
});

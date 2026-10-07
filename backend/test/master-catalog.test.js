process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalog = require('../services/master-catalog.service');
const { withPriceFlag } = require('../utils/needs-price');
const { firstUnpriced } = require('../services/unpriced-items.service');

/** Base en memoria con lo que usa el catálogo maestro. */
function memoryDb({ foods = [], menus = [], settings = [] } = {}) {
  let seq = 0;
  const db = {
    foods,
    menus,
    settings,
    async GetFoods(tenantId) {
      return foods.filter((f) => f.tenantId === tenantId);
    },
    async GetFoodById(id, tenantId) {
      return foods.find((f) => f.id === id && f.tenantId === tenantId) || null;
    },
    async CountUsersByTenant() {
      return 1;
    },
    async CountPendingInvites() {
      return 0;
    },
    async CountPlanFoods(tenantId) {
      return foods.filter((f) => f.tenantId === tenantId && f.needsPrice !== true).length;
    },
    async GetMenus(tenantId) {
      return menus.filter((m) => m.tenantId === tenantId);
    },
    async CreateMenu(data) {
      const m = { ...data, id: `m${++seq}` };
      menus.push(m);
      return m;
    },
    async CreateFoods(docs) {
      for (const d of docs) foods.push({ ...d, id: `f${++seq}` });
      return docs.length;
    },
    async DeleteUnpricedCatalogFoods(tenantId) {
      const gone = foods.filter((f) => f.tenantId === tenantId && f.catalogId && f.needsPrice === true);
      for (const f of gone) foods.splice(foods.indexOf(f), 1);
      return gone.length;
    },
    async DeleteEmptyCatalogMenus(tenantId) {
      const gone = menus.filter((m) => m.tenantId === tenantId && m.fromCatalog && !foods.some((f) => f.menuId === m.id));
      for (const m of gone) menus.splice(menus.indexOf(m), 1);
      return gone.length;
    },
    async UpdateSettings(data, tenantId) {
      let s = settings.find((x) => x.tenantId === tenantId);
      if (!s) settings.push((s = { tenantId }));
      return Object.assign(s, data);
    },
    async ListSettingsNeedingCatalog(giros, version) {
      return settings.filter(
        (s) => s.setupCompleted === true && s.masterCatalogVersion !== version && (!s.businessType || giros.includes(s.businessType))
      );
    },
  };
  return db;
}
const mine = (db, tenantId = 't1') => db.foods.filter((f) => f.tenantId === tenantId);

test('el catálogo trae los 181 productos del documento y ninguno con precio', () => {
  assert.equal(catalog.ITEMS.length, 181);
  assert.equal(new Set(catalog.ITEMS.map((i) => i.section)).size, 14);
  assert.equal(new Set(catalog.ITEMS.map((i) => i.id)).size, 181, 'ids únicos');
  assert.equal(new Set(catalog.ITEMS.map((i) => i.code)).size, 181, 'códigos únicos');
  for (const item of catalog.ITEMS) {
    assert.ok(item.name && item.presentation && item.section && item.code, item.id);
    assert.ok(!Object.keys(item).some((k) => /price|precio/i.test(k)), `${item.id} no debe traer precio`);
  }
  assert.ok(!/\$\s?\d/.test(fs.readFileSync(path.join(root, 'data/catalogo-maestro.json'), 'utf8')), 'ni un solo precio en el archivo');
});

test('cada producto llega sin precio, con su código, su unidad y marcado para pedirle precio', () => {
  const papas = catalog.toFood(catalog.ITEMS.find((i) => i.id === '7501011100013'), { menuId: 'm9', tenantId: 't1' });
  assert.deepEqual(
    [papas.name, papas.price, papas.needsPrice, papas.barcode, papas.sku, papas.saleUnit, papas.catalogId, papas.menuId, papas.tenantId],
    ['Papas Sabritas Saladas 170 g', 0, true, '7501011100013', '7501011100013', 'pz', '7501011100013', 'm9', 't1']
  );
  // lo que se pesa: por kilo, con la clave de báscula (solo los dígitos del PLU) y sin «1 kg» en el nombre
  const jitomate = catalog.toFood(catalog.ITEMS.find((i) => i.id === 'PLU-3001'), { menuId: 'm9', tenantId: 't1' });
  assert.deepEqual([jitomate.name, jitomate.barcode, jitomate.saleUnit], ['Jitomate Saladette', '3001', 'kg']);
  const frijoles = catalog.toFood(catalog.ITEMS.find((i) => i.id === 'PLU-4010'), { menuId: 'm9', tenantId: 't1' });
  assert.equal(frijoles.saleUnit, 'pz', 'una tarrina de 500 g no se vende por kilo');
});

test('cargar: la tienda recibe los 181 productos sin precio, cada uno en la categoría de su proveedor', async () => {
  const db = memoryDb();
  const r = await catalog.seed(db, 't1');
  assert.deepEqual(r, { created: 181, menusCreated: 14 });
  assert.equal(mine(db).length, 181);
  assert.ok(mine(db).every((f) => f.price === 0 && f.needsPrice === true && f.tenantId === 't1'));
  assert.deepEqual(new Set(db.menus.map((m) => m.name)).size, 14);
  assert.ok(db.menus.every((m) => m.fromCatalog === true && m.tenantId === 't1'));
  const sabritas = db.menus.find((m) => m.name === 'Sabritas (PepsiCo Botanas)');
  assert.equal(mine(db).filter((f) => f.menuId === sabritas.id).length, 19);
});

test('cargar: se puede repetir sin duplicar, respeta lo que la tienda ya tiene y las tiendas no se mezclan', async () => {
  const db = memoryDb({
    foods: [
      { id: 'a', tenantId: 't1', name: 'Mis papas', barcode: '7501011100013', price: 40 },
      { id: 'b', tenantId: 't1', name: 'Jitomate', catalogId: 'PLU-3001', barcode: '999', price: 30 },
      { id: 'c', tenantId: 't2', name: 'De otra tienda', barcode: '7501011100020' },
    ],
    menus: [{ id: 'mine', name: 'sabritas (pepsico botanas)', tenantId: 't1' }, { id: 'otra', name: 'Gamesa (PepsiCo Galletas)', tenantId: 't2' }],
  });
  const r = await catalog.seed(db, 't1');
  assert.equal(r.created, 179, 'omite el que ya tiene por código y el que ya tiene por catálogo');
  assert.equal(r.menusCreated, 13, 'reutiliza «sabritas…» aunque esté en minúsculas, y no usa la categoría de otra tienda');
  const papas = mine(db).filter((f) => f.barcode === '7501011100013');
  assert.equal(papas.length, 1);
  assert.equal(papas[0].price, 40, 'no pisa el precio de la tienda');
  assert.deepEqual(await catalog.seed(db, 't1'), { created: 0, menusCreated: 0 });
  assert.equal(db.foods.filter((f) => f.tenantId === 't2').length, 1, 'la otra tienda no recibió nada');
});

test('el giro decide: abarrotes, conveniencia y comercio lo reciben; ferretería y los demás, no', async () => {
  for (const [giro, recibe] of [['abarrotes', true], ['convenience', true], ['other', true], [undefined, true], ['hardware', false], ['pharmacy', false], ['restaurant', false], ['cafe', false], ['bar', false], ['hotel', false]]) {
    const db = memoryDb();
    await catalog.syncForGiro(db, 't1', { businessType: giro });
    assert.equal(mine(db).length, recibe ? 181 : 0, String(giro));
    assert.equal(db.settings.find((s) => s.tenantId === 't1')?.masterCatalogVersion === catalog.VERSION, recibe, `${giro}: marca de versión`);
  }
});

test('se carga una sola vez: lo que el dueño borra después no vuelve a aparecer', async () => {
  const db = memoryDb();
  const settings = { businessType: 'abarrotes' };
  await catalog.syncForGiro(db, 't1', settings);
  db.foods.splice(0, 100); // el dueño borra 100 que no vende
  Object.assign(settings, db.settings[0]); // lo que la tienda ya tiene guardado en sus ajustes
  assert.equal(await catalog.syncForGiro(db, 't1', settings), null);
  assert.equal(mine(db).length, 81);
});

test('si la tienda cambia a un giro sin catálogo, se quita lo que sigue sin precio y se conserva lo que ya tiene precio', async () => {
  const db = memoryDb();
  const settings = { businessType: 'abarrotes' };
  await catalog.syncForGiro(db, 't1', settings);
  db.menus.push({ id: 'propia', name: 'Mi categoría', tenantId: 't1' });
  db.foods.push({ id: 'propio', tenantId: 't1', name: 'Mío', menuId: 'propia', price: 10 });
  const priced = db.foods.find((f) => f.catalogId === '7501011100013');
  Object.assign(priced, { price: 48, needsPrice: false }); // el dueño ya le puso precio a este
  Object.assign(settings, db.settings[0], { businessType: 'hardware' });

  await catalog.syncForGiro(db, 't1', settings);
  assert.deepEqual(mine(db).map((f) => f.name).sort(), ['Mío', 'Papas Sabritas Saladas 170 g']);
  assert.deepEqual(db.menus.map((m) => m.name).sort(), ['Mi categoría', 'Sabritas (PepsiCo Botanas)'], 'quedan la propia y la que aún tiene algo con precio');
  assert.equal(db.settings[0].masterCatalogVersion, null);
});

test('al arrancar, las tiendas que ya existían reciben el catálogo; las que no corresponden, no; un error no frena a las demás', async () => {
  const db = memoryDb({
    settings: [
      { tenantId: 'a', setupCompleted: true, businessType: 'abarrotes' },
      { tenantId: 'b', setupCompleted: true, businessType: 'hardware' },
      { tenantId: 'c', setupCompleted: false, businessType: 'abarrotes' },
      { tenantId: 'd', setupCompleted: true, businessType: 'convenience', masterCatalogVersion: catalog.VERSION },
      { tenantId: 'e', setupCompleted: true, businessType: 'other' },
    ],
  });
  const original = db.CreateFoods;
  db.CreateFoods = async (docs) => {
    if (docs[0].tenantId === 'a') throw new Error('falla a propósito');
    return original(docs);
  };
  const warn = console.warn;
  console.warn = () => {};
  const n = await catalog.backfill(db);
  console.warn = warn;
  assert.equal(n, 1, 'solo «e» se cargó; «a» falló');
  assert.equal(mine(db, 'e').length, 181);
  for (const t of ['a', 'b', 'c', 'd']) assert.equal(mine(db, t).length, 0, `tienda ${t}`);
  db.CreateFoods = original;
  assert.equal(await catalog.backfill(db), 1, 'al volver a arrancar se reintenta la que falló');
  assert.equal(mine(db, 'a').length, 181);
  assert.equal(await catalog.backfill(db), 0, 'y ya no queda nada pendiente');
});

test('al ponerle precio a un producto, deja de pedirlo (por la caja, la edición o una factura)', () => {
  assert.deepEqual(withPriceFlag({ price: 48 }), { price: 48, needsPrice: false });
  assert.deepEqual(withPriceFlag({ price: '19.5', cost: 10 }), { price: '19.5', cost: 10, needsPrice: false });
  assert.deepEqual(withPriceFlag({ cost: 12 }), { cost: 12 }, 'ponerle costo no le quita la falta de precio');
  assert.deepEqual(withPriceFlag({ price: 0 }), { price: 0 });
  assert.deepEqual(withPriceFlag({ price: null }), { price: null });
  assert.deepEqual(withPriceFlag({ price: 48, needsPrice: true }), { price: 48, needsPrice: true }, 'si alguien lo pide explícito, se respeta');
});

test('una venta con un producto sin precio se rechaza; lo demás pasa', async () => {
  const db = memoryDb({
    foods: [
      { id: 'sin', tenantId: 't1', name: 'Sin precio', needsPrice: true },
      { id: 'con', tenantId: 't1', name: 'Con precio', price: 20 },
      { id: 'otra', tenantId: 't2', name: 'De otra tienda', needsPrice: true },
    ],
  });
  assert.equal((await firstUnpriced(db, [{ foodId: 'con' }, { foodId: 'sin' }], 't1')).name, 'Sin precio');
  assert.equal(await firstUnpriced(db, [{ foodId: 'con' }, { food: 'con' }], 't1'), null);
  assert.equal(await firstUnpriced(db, [{ foodId: 'misc-abc123', name: 'Varios', price: 5 }, { name: 'Sin id' }], 't1'), null, 'artículo varios y líneas sueltas pasan');
  assert.equal(await firstUnpriced(db, [{ foodId: 'otra' }], 't1'), null, 'no mira productos de otra tienda');
});

test('los productos sin precio no cuentan para el tope del plan', async () => {
  const foods = [
    ...Array.from({ length: 245 }, (_, i) => ({ id: `p${i}`, tenantId: 't1', name: `P${i}`, price: 10 })),
    ...catalog.ITEMS.map((i, n) => ({ id: `c${n}`, tenantId: 't1', name: i.name, needsPrice: true, price: 0 })),
  ];
  const file = require.resolve(path.join(root, 'database/mongodb.js'));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: memoryDb({ foods }) };
  delete require.cache[require.resolve(path.join(root, 'services/plan-limits.service.js'))];
  const limits = require('../services/plan-limits.service');
  await limits.assertProductRoom('t1', 'basic', 5); // 245 con precio + 5 = 250, el tope del plan Básico
  await assert.rejects(limits.assertProductRoom('t1', 'basic', 6), (e) => e.payload?.code === 'PLAN_LIMIT');
  assert.equal((await limits.usageFor('t1', 'basic')).products.used, 245);
});

test('el front y el back coinciden en qué giros usan el catálogo', async () => {
  const src = fs.readFileSync(path.join(root, '../frontend/src/masterCatalog.js'), 'utf8');
  const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  assert.deepEqual([...mod.MASTER_CATALOG_GIROS].sort(), [...catalog.GIROS].sort());
});

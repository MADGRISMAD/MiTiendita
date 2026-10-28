process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalog = require('../services/master-catalog.service');
const admin = require('../services/master-catalog-admin.service');
const ITEMS = require('../data/catalogo-maestro.json').items;
const { withPriceFlag } = require('../utils/needs-price');
const { firstUnpriced } = require('../services/unpriced-items.service');

/** Base en memoria con lo que usa el catálogo maestro. */
function memoryDb({ foods = [], menus = [], settings = [], catalogItems = catalog.seedItems() } = {}) {
  let seq = 0;
  let seeded = false;
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
    catalogItems,
    async ListCatalogItems(c) {
      return catalogItems.filter((i) => i.catalog === c).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
    },
    async CountCatalogItems(c) {
      return catalogItems.filter((i) => i.catalog === c).length;
    },
    async GetCatalogItem(c, key) {
      return catalogItems.find((i) => i.catalog === c && i.key === String(key)) || null;
    },
    async InsertCatalogItems(items) {
      catalogItems.push(...items);
      return items.length;
    },
    async UpsertCatalogItem(c, key, data) {
      let row = catalogItems.find((i) => i.catalog === c && i.key === String(key));
      if (!row) catalogItems.push((row = { catalog: c, key: String(key) }));
      return Object.assign(row, data);
    },
    async DeleteCatalogItem(c, key) {
      const i = catalogItems.findIndex((x) => x.catalog === c && x.key === String(key));
      if (i < 0) return 0;
      catalogItems.splice(i, 1);
      return 1;
    },
    async DeleteAllCatalogItems(c) {
      const before = catalogItems.length;
      for (let i = catalogItems.length - 1; i >= 0; i -= 1) if (catalogItems[i].catalog === c) catalogItems.splice(i, 1);
      return before - catalogItems.length;
    },
    async IsCatalogSeeded() {
      return seeded;
    },
    async MarkCatalogSeeded() {
      seeded = true;
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
        (s) => s.setupCompleted === true && s.masterCatalogVersion !== version && s.masterCatalogSkipped !== true && (!s.businessType || giros.includes(s.businessType))
      );
    },
  };
  return db;
}
const mine = (db, tenantId = 't1') => db.foods.filter((f) => f.tenantId === tenantId);

test('el catálogo trae los 181 productos del documento y ninguno con precio', () => {
  assert.equal(ITEMS.length, 181);
  assert.equal(new Set(ITEMS.map((i) => i.section)).size, 14);
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, 181, 'ids únicos');
  assert.equal(new Set(ITEMS.map((i) => i.code)).size, 181, 'códigos únicos');
  for (const item of ITEMS) {
    assert.ok(item.name && item.presentation && item.section && item.code, item.id);
    assert.ok(!Object.keys(item).some((k) => /price|precio/i.test(k)), `${item.id} no debe traer precio`);
  }
  assert.ok(!/\$\s?\d/.test(fs.readFileSync(path.join(root, 'data/catalogo-maestro.json'), 'utf8')), 'ni un solo precio en el archivo');
});

test('cada producto llega sin precio, con su código, su unidad y marcado para pedirle precio', () => {
  const papas = catalog.toFood(catalog.seedItems().find((i) => i.key === '7501011100013'), { menuId: 'm9', tenantId: 't1' });
  assert.deepEqual(
    [papas.name, papas.price, papas.needsPrice, papas.barcode, papas.sku, papas.saleUnit, papas.catalogId, papas.menuId, papas.tenantId],
    ['Papas Sabritas Saladas 170 g', 0, true, '7501011100013', '7501011100013', 'pz', '7501011100013', 'm9', 't1']
  );
  // lo que se pesa: por kilo, con la clave de báscula (solo los dígitos del PLU) y sin «1 kg» en el nombre
  const jitomate = catalog.toFood(catalog.seedItems().find((i) => i.key === 'PLU-3001'), { menuId: 'm9', tenantId: 't1' });
  assert.deepEqual([jitomate.name, jitomate.barcode, jitomate.saleUnit], ['Jitomate Saladette', '3001', 'kg']);
  const frijoles = catalog.toFood(catalog.seedItems().find((i) => i.key === 'PLU-4010'), { menuId: 'm9', tenantId: 't1' });
  assert.equal(frijoles.saleUnit, 'pz', 'una tarrina de 500 g no se vende por kilo');
});

test('cargar: la tienda recibe los 181 productos sin precio, cada uno en la categoría de su proveedor', async () => {
  const db = memoryDb();
  const r = await catalog.seed(db, 't1', 'abarrotes');
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
  const r = await catalog.seed(db, 't1', 'abarrotes');
  assert.equal(r.created, 179, 'omite el que ya tiene por código y el que ya tiene por catálogo');
  assert.equal(r.menusCreated, 13, 'reutiliza «sabritas…» aunque esté en minúsculas, y no usa la categoría de otra tienda');
  const papas = mine(db).filter((f) => f.barcode === '7501011100013');
  assert.equal(papas.length, 1);
  assert.equal(papas[0].price, 40, 'no pisa el precio de la tienda');
  assert.deepEqual(await catalog.seed(db, 't1', 'abarrotes'), { created: 0, menusCreated: 0 });
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
    ...ITEMS.map((i, n) => ({ id: `c${n}`, tenantId: 't1', name: i.name, needsPrice: true, price: 0 })),
  ];
  const file = require.resolve(path.join(root, 'database/mongodb.js'));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: memoryDb({ foods }) };
  delete require.cache[require.resolve(path.join(root, 'services/plan-limits.service.js'))];
  const limits = require('../services/plan-limits.service');
  await limits.assertProductRoom('t1', 'basic', 5); // 245 con precio + 5 = 250, el tope del plan Básico
  await assert.rejects(limits.assertProductRoom('t1', 'basic', 6), (e) => e.payload?.code === 'PLAN_LIMIT');
  assert.equal((await limits.usageFor('t1', 'basic')).products.used, 245);
});


test('quien rechazó el catálogo no lo recibe solo: ni al guardar ajustes ni al reiniciar el servidor', async () => {
  const db = memoryDb({ settings: [{ tenantId: 'a', setupCompleted: true, businessType: 'abarrotes', masterCatalogSkipped: true }] });
  assert.equal(await catalog.syncForGiro(db, 'a', db.settings[0]), null);
  assert.equal(mine(db, 'a').length, 0);
  assert.equal(await catalog.backfill(db), 0);
  assert.equal(mine(db, 'a').length, 0);
});

test('Ajustes: el dueño lo carga a pedido, solo lo que falta, y desde ahí vuelve a recibir las versiones nuevas', async () => {
  const db = memoryDb({ settings: [{ tenantId: 'a', setupCompleted: true, businessType: 'abarrotes', masterCatalogSkipped: true }] });
  const before = await catalog.status(db, 'a', db.settings[0]);
  assert.deepEqual([before.available, before.total, before.inStore, before.missing, before.unpriced], [true, 181, 0, 181, 0]);

  const out = await catalog.load(db, 'a', db.settings[0]);
  assert.equal(out.created, 181);
  assert.equal(db.settings[0].masterCatalogVersion, catalog.VERSION);
  assert.equal(db.settings[0].masterCatalogSkipped, false);
  const after = await catalog.status(db, 'a', db.settings[0]);
  assert.deepEqual([after.inStore, after.missing, after.unpriced], [181, 0, 181]);

  // se puede repetir sin duplicar, y respeta lo que el dueño ya tenía
  assert.equal((await catalog.load(db, 'a', db.settings[0])).created, 0);
  assert.equal(mine(db, 'a').length, 181);
});

test('Ajustes: farmacia y ferretería no tienen catálogo que cargar', async () => {
  for (const giro of ['pharmacy', 'hardware']) {
    const db = memoryDb({ settings: [{ tenantId: 'a', setupCompleted: true, businessType: giro }] });
    assert.equal((await catalog.status(db, 'a', db.settings[0])).available, false);
    assert.equal(await catalog.load(db, 'a', db.settings[0]), null);
    assert.equal(mine(db, 'a').length, 0);
  }
});

test('Ajustes: quitar lo que no tiene precio conserva lo que ya tiene precio y no vuelve solo', async () => {
  const db = memoryDb({ settings: [{ tenantId: 'a', setupCompleted: true, businessType: 'abarrotes' }] });
  await catalog.load(db, 'a', db.settings[0]);
  const priced = db.foods.find((f) => f.catalogId === '7501011100013');
  Object.assign(priced, { price: 48, needsPrice: false });
  const out = await catalog.removeUnpriced(db, 'a');
  assert.equal(out.removed, 180);
  assert.deepEqual(mine(db, 'a').map((f) => f.name), ['Papas Sabritas Saladas 170 g']);
  assert.equal(db.settings[0].masterCatalogSkipped, true);
  // al guardar ajustes o reiniciar, no regresa
  assert.equal(await catalog.syncForGiro(db, 'a', db.settings[0]), null);
  assert.equal(await catalog.backfill(db), 0);
  assert.equal(mine(db, 'a').length, 1);
});

test('cada giro usa su catálogo: conveniencia y comercio comparten el de abarrotes; restaurante no tiene', () => {
  const k = catalog.catalogKeyFor;
  assert.deepEqual([k('abarrotes'), k('convenience'), k('other'), k(undefined), k('pharmacy'), k('hardware'), k('restaurant')], ['abarrotes', 'abarrotes', 'abarrotes', 'abarrotes', 'pharmacy', 'hardware', null]);
});

test('al arrancar, el archivo pasa a la base una sola vez; si el equipo la vacía a propósito, no regresa', async () => {
  const db = memoryDb({ catalogItems: [] });
  assert.equal(await catalog.ensureSeeded(db), 181);
  assert.equal(await db.CountCatalogItems('abarrotes'), 181);
  for (const i of [...db.catalogItems]) await db.DeleteCatalogItem('abarrotes', i.key);
  assert.equal(await catalog.ensureSeeded(db), 0);
  assert.equal(await db.CountCatalogItems('abarrotes'), 0);
});

test('eliminar un catálogo: pide la palabra de confirmación, borra solo ese catálogo y no se vuelve a llenar al reiniciar', async () => {
  const db = memoryDb({ catalogItems: [] });
  await catalog.ensureSeeded(db);
  await admin.create(db, 'pharmacy', { section: 'Analgésicos', name: 'Paracetamol', code: '7502000000011' });
  await assert.rejects(admin.clear(db, 'abarrotes', ''), (e) => e.status === 400);
  await assert.rejects(admin.clear(db, 'abarrotes', 'si'), (e) => e.status === 400);
  await assert.rejects(admin.clear(db, 'nada', 'ELIMINAR'), (e) => e.status === 404);
  assert.equal(await db.CountCatalogItems('abarrotes'), 181, 'sin confirmar no se borra nada');
  assert.deepEqual(await admin.clear(db, 'abarrotes', ' eliminar '), { removed: 181 });
  assert.equal(await db.CountCatalogItems('abarrotes'), 0);
  assert.equal(await db.CountCatalogItems('pharmacy'), 1, 'los demás catálogos no se tocan');
  assert.equal(await catalog.ensureSeeded(db), 0, 'al reiniciar no se vuelve a sembrar');
  assert.equal(await db.CountCatalogItems('abarrotes'), 0);
});

test('farmacia: cuando el catálogo ya tiene productos, la tienda de farmacia los recibe; al cambiar de giro se cambia el catálogo', async () => {
  const db = memoryDb();
  await admin.create(db, 'pharmacy', { section: 'Analgésicos', name: 'Paracetamol', presentation: '500 mg c/20', code: '7502000000011' });
  await admin.create(db, 'pharmacy', { section: 'Vitaminas', name: 'Vitamina C', presentation: '1 g', code: '7502000000028' });
  const settings = { businessType: 'pharmacy' };
  assert.deepEqual(await catalog.syncForGiro(db, 't1', settings), { created: 2, menusCreated: 2 });
  assert.deepEqual(mine(db).map((f) => f.name).sort(), ['Paracetamol 500 mg c/20', 'Vitamina C 1 g']);
  Object.assign(settings, db.settings[0]);
  assert.equal(settings.masterCatalogKey, 'pharmacy');

  // la tienda pasa a abarrotes: se retira lo de farmacia que siga sin precio y llega el de abarrotes
  Object.assign(settings, { businessType: 'abarrotes' });
  const r = await catalog.syncForGiro(db, 't1', settings);
  assert.equal(r.created, 181);
  assert.equal(mine(db).length, 181);
  assert.ok(!mine(db).some((f) => /Paracetamol/.test(f.name)));
});

test('panel: agregar, editar, quitar y no repetir códigos', async () => {
  const db = memoryDb();
  const item = await admin.create(db, 'hardware', { section: 'Tornillería', name: 'Tornillo', presentation: '1/4 x 1', code: '7503000000012', unit: 'pz' });
  assert.equal(item.key, '7503000000012');
  const sinCodigo = await admin.create(db, 'hardware', { section: 'Pinturas', name: 'Brocha 2"' });
  assert.match(sinCodigo.key, /^g-/);
  await assert.rejects(admin.create(db, 'hardware', { name: 'Otro', code: '7503000000012' }), (e) => e.status === 409);
  await assert.rejects(admin.create(db, 'hardware', { name: 'X' }), (e) => e.status === 400);
  await assert.rejects(admin.create(db, 'hardware', { name: 'Cinta', unit: 'galón' }), (e) => e.status === 400);
  await assert.rejects(admin.create(db, 'nada', { name: 'Cinta' }), (e) => e.status === 404);

  const edited = await admin.update(db, 'hardware', sinCodigo.key, { section: 'Brochas', code: '7503000000029' });
  assert.deepEqual([edited.section, edited.code, edited.key, edited.name], ['Brochas', '7503000000029', sinCodigo.key, 'Brocha 2"'], 'la clave no cambia al ponerle código');
  await assert.rejects(admin.update(db, 'hardware', sinCodigo.key, { code: '07503000000012' }), (e) => e.status === 409, 'ni escrito con un cero de más');
  await admin.remove(db, 'hardware', item.key);
  await assert.rejects(admin.remove(db, 'hardware', item.key), (e) => e.status === 404);
  const sum = (await admin.summary(db)).find((c) => c.key === 'hardware');
  assert.deepEqual([sum.total, sum.sections], [1, 1]);
});

test('panel: importar un archivo crea lo nuevo, actualiza lo que ya existe y reporta las filas con error', async () => {
  const db = memoryDb();
  const rows = [
    { section: 'Analgésicos', name: 'Paracetamol', presentation: '500 mg', code: '7502000000011' },
    { section: 'Analgésicos', name: 'Ibuprofeno', presentation: '400 mg' }, // sin código
    { section: '', name: 'Suero oral', code: '7502000000035', unit: 'pz', plu: 'sí', verificado: 'x' },
    { section: 'Mal', name: '' }, // sin nombre
    { section: 'Mal', name: 'Algo', unit: 'tonelada' }, // unidad inválida
    { section: 'Analgésicos', name: 'Paracetamol', presentation: '500 mg', code: '7502000000011' }, // repetida
  ];
  const first = await admin.importRows(db, 'pharmacy', rows);
  assert.deepEqual([first.created, first.updated], [3, 0]);
  assert.deepEqual(first.errors.map((e) => e.row), [4, 5, 6]);
  const suero = (await db.GetCatalogItem('pharmacy', '7502000000035'));
  assert.equal(suero.section, 'General');
  assert.equal(suero.plu, true);

  // volver a subirlo (con una corrección) actualiza, no duplica
  const again = await admin.importRows(db, 'pharmacy', [
    { section: 'Analgésicos y fiebre', name: 'Paracetamol', presentation: '500 mg c/20', code: '07502000000011' },
    { section: 'Analgésicos', name: 'Ibuprofeno', presentation: '400 mg' },
  ]);
  assert.deepEqual([again.created, again.updated], [0, 2]);
  assert.equal(await db.CountCatalogItems('pharmacy'), 3);
  assert.equal((await db.GetCatalogItem('pharmacy', '7502000000011')).section, 'Analgésicos y fiebre');

  // con precio y costo el producto nace con precio; sin ellos, sin precio
  await admin.importRows(db, 'pharmacy', [{ name: 'Con precio', code: '7502000000099', price: '$12.50', cost: '9' }]);
  const priced = catalog.toFood(await db.GetCatalogItem('pharmacy', '7502000000099'), { menuId: 'm1', tenantId: 't1' });
  assert.deepEqual([priced.price, priced.cost, priced.needsPrice], [12.5, 9, false]);
  const bare = catalog.toFood(await db.GetCatalogItem('pharmacy', '7502000000035'), { menuId: 'm1', tenantId: 't1' });
  assert.deepEqual([bare.price, bare.needsPrice], [0, true]);
  const bad = await admin.importRows(db, 'pharmacy', [{ name: 'Mal precio', price: 'abc' }]);
  assert.equal(bad.errors.length, 1);
  await assert.rejects(admin.importRows(db, 'pharmacy', []), (e) => e.status === 400);
  await assert.rejects(admin.importRows(db, 'pharmacy', Array(3001).fill({ name: 'Producto' })), (e) => e.status === 400);
});

test('panel: el catálogo de una tienda muestra lo que falta en el maestro, sin precios ni costos, y se puede pasar al catálogo', async () => {
  const db = memoryDb({
    foods: [
      { id: 'f1', tenantId: 't1', name: 'Papas Sabritas Saladas 170 g', barcode: '7501011100013', catalogId: '7501011100013', menuId: 'm1', price: 40, cost: 25, stock: 7, saleUnit: 'pz' },
      { id: 'f2', tenantId: 't1', name: 'Pan de la esquina', barcode: '2000000000017', menuId: 'm2', price: 8, cost: 5, stock: 20, saleUnit: 'pz' },
      { id: 'f3', tenantId: 't1', name: 'Chile seco', barcode: '', menuId: 'm2', price: 12, cost: 7, saleUnit: 'kg' },
      { id: 'f4', tenantId: 't1', name: 'Varios', isMisc: true, menuId: 'm2' },
      { id: 'f5', tenantId: 't2', name: 'De otra tienda', barcode: '123', menuId: 'm3' },
    ],
    menus: [{ id: 'm1', name: 'Sabritas (PepsiCo Botanas)', tenantId: 't1' }, { id: 'm2', name: 'Mis cosas', tenantId: 't1' }],
  });
  const view = await admin.tenantProducts(db, 't1', 'abarrotes');
  assert.deepEqual([view.total, view.notInCatalog], [3, 2]);
  assert.deepEqual(view.products.map((p) => [p.name, p.inCatalog]), [['Chile seco', false], ['Pan de la esquina', false], ['Papas Sabritas Saladas 170 g', true]]);
  assert.ok(view.products.every((p) => !('price' in p) && !('cost' in p) && !('stock' in p)), 'ni precios, ni costos, ni existencias');
  assert.ok(!view.products.some((p) => p.name === 'De otra tienda' || p.name === 'Varios'));

  const out = await admin.addFromTenant(db, 'abarrotes', 't1', ['f1', 'f2', 'f3']);
  assert.deepEqual([out.created, out.skipped, out.errors.length], [2, 1, 0], 'la que ya está en el catálogo se omite');
  const added = await db.GetCatalogItem('abarrotes', '2000000000017');
  assert.deepEqual([added.name, added.section], ['Pan de la esquina', 'Mis cosas']);
  assert.equal((await admin.tenantProducts(db, 't1', 'abarrotes')).notInCatalog, 0);
  await assert.rejects(admin.addFromTenant(db, 'abarrotes', 't1', []), (e) => e.status === 400);
});

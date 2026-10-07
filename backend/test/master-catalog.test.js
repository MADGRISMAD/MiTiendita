process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** Base en memoria con lo que usa el catálogo maestro: categorías, productos, ajustes y tope del plan. */
function memoryDb({ businessType = 'abarrotes', foods = [] } = {}) {
  const menus = [];
  const created = [];
  let seq = 0;
  return {
    menus,
    created,
    foods,
    async GetSettings() {
      return { businessType };
    },
    async GetFoods(tenantId) {
      return foods.filter((f) => f.tenantId === tenantId);
    },
    async CountFoods(tenantId) {
      return foods.filter((f) => f.tenantId === tenantId).length;
    },
    async GetMenus(tenantId) {
      return menus.filter((m) => m.tenantId === tenantId);
    },
    async GetMenuById(id, tenantId) {
      return menus.find((m) => m.id === String(id) && m.tenantId === tenantId) || null;
    },
    async CreateMenu(data) {
      const m = { ...data, id: `m${++seq}` };
      menus.push(m);
      return m;
    },
    async CreateFood(data) {
      const f = { ...data, id: `f${++seq}` };
      foods.push(f);
      created.push(f);
      return f;
    },
  };
}

function load(db) {
  const file = require.resolve(path.join(root, 'database/mongodb.js'));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: db };
  for (const rel of ['services/plan-limits.service.js', 'controllers/catalog.controller.js']) {
    delete require.cache[require.resolve(path.join(root, rel))];
  }
  return require('../controllers/catalog.controller');
}

function res() {
  return {
    code: 200,
    body: null,
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
  };
}
const req = (body = {}, extra = {}) => ({ body, params: {}, tenantId: 't1', tenant: { plan: 'basic' }, ...extra });
const catalog = require('../services/master-catalog.service');
const ids = (n) => catalog.ITEMS.slice(0, n).map((i) => i.id);
const withPrice = (list, price = 20) => list.map((id) => ({ id, price }));

test('el catálogo trae los 181 productos del documento y ninguno con precio', () => {
  assert.equal(catalog.ITEMS.length, 181);
  assert.equal(catalog.SECTIONS.length, 14);
  assert.equal(new Set(catalog.ITEMS.map((i) => i.id)).size, 181, 'ids únicos');
  assert.equal(new Set(catalog.ITEMS.map((i) => i.code)).size, 181, 'códigos únicos');
  for (const item of catalog.ITEMS) {
    assert.ok(item.name && item.presentation && item.section && item.code, item.id);
    assert.ok(!Object.keys(item).some((k) => /price|precio/i.test(k)), `${item.id} no debe traer precio`);
  }
  assert.ok(!/\$\s?\d/.test(fs.readFileSync(path.join(root, 'data/catalogo-maestro.json'), 'utf8')), 'ni un solo precio en el archivo');
});

test('lo que se pesa va por kilo y con la clave de la báscula (solo los dígitos del PLU)', () => {
  const jitomate = catalog.find('PLU-3001');
  assert.deepEqual([jitomate.code, jitomate.unit, jitomate.plu], ['3001', 'kg', true]);
  assert.equal(catalog.productName(jitomate), 'Jitomate Saladette', 'por kilo no lleva «1 kg» en el nombre');
  const frijoles = catalog.find('PLU-4010');
  assert.equal(frijoles.unit, 'pz', 'una tarrina de 500 g no se vende por kilo');
  const papas = catalog.find('7501011100013');
  assert.equal(catalog.productName(papas), 'Papas Sabritas Saladas 170 g');
});

test('solo abarrotes, conveniencia y comercio usan el catálogo; ferretería y los demás, no', async () => {
  for (const [giro, ok] of [['abarrotes', true], ['convenience', true], ['other', true], [undefined, true], ['hardware', false], ['pharmacy', false], ['restaurant', false], ['cafe', false], ['bar', false], ['hotel', false]]) {
    const { list, add } = load(memoryDb({ businessType: giro }));
    const a = res();
    await list(req(), a);
    const b = res();
    await add(req({ items: withPrice(ids(1)) }), b);
    assert.equal(a.code, ok ? 200 : 403, `${giro}: ver`);
    assert.equal(b.code, ok ? 201 : 403, `${giro}: agregar`);
    if (!ok) assert.equal(a.body.code, 'GIRO_NOT_SUPPORTED');
  }
});

test('agregar: cada producto lleva el precio del dueño y todo lo demás sale del catálogo', async () => {
  const db = memoryDb();
  const { add } = load(db);
  const r = res();
  await add(req({ items: [{ id: '7501011100013', price: '48.5' }, { id: 'PLU-3001', price: 32 }] }), r);
  assert.equal(r.code, 201);
  assert.deepEqual(r.body, { created: 2, skipped: 0, menusCreated: 2 });
  const [papas, jitomate] = db.created;
  assert.equal(papas.name, 'Papas Sabritas Saladas 170 g');
  assert.equal(papas.price, 48.5);
  assert.equal(papas.barcode, '7501011100013');
  assert.equal(papas.sku, '7501011100013');
  assert.equal(papas.saleUnit, 'pz');
  assert.equal(papas.catalogId, '7501011100013');
  assert.equal(papas.tenantId, 't1');
  assert.deepEqual([jitomate.barcode, jitomate.saleUnit, jitomate.price], ['3001', 'kg', 32]);
  const names = db.menus.map((m) => m.name);
  assert.deepEqual(names, ['Sabritas (PepsiCo Botanas)', 'Departamentos Frescos: Frutería, Verdulería y Carnicería (PLU Báscula)']);
  assert.equal(papas.menuId, db.menus[0].id);
  assert.equal(jitomate.menuId, db.menus[1].id);
});

test('agregar: sin precio válido no se agrega nada', async () => {
  for (const price of [undefined, '', 0, -5, 'gratis', NaN, 2_000_000]) {
    const db = memoryDb();
    const { add } = load(db);
    const r = res();
    await add(req({ items: [{ id: ids(2)[0], price: 10 }, { id: ids(2)[1], price }] }), r);
    assert.equal(r.code, 400, `precio ${price}`);
    assert.match(r.body, /Falta el precio/);
    assert.equal(db.created.length, 0, 'ni siquiera el que sí traía precio');
    assert.equal(db.menus.length, 0, 'ni categorías sueltas');
  }
});

test('agregar: pide algo del catálogo, no inventos ni listas vacías', async () => {
  const db = memoryDb();
  const { add } = load(db);
  for (const body of [{}, { items: [] }, { items: 'todo' }, { items: [{ id: 'no-existe', price: 10 }] }, { items: Array.from({ length: 251 }, () => ({ id: ids(1)[0], price: 1 })) }]) {
    const r = res();
    await add(req(body), r);
    assert.equal(r.code, 400, JSON.stringify(body).slice(0, 40));
  }
  assert.equal(db.created.length, 0);
});

test('agregar: lo que la tienda ya tiene se omite (por código o por catálogo) y no se duplica', async () => {
  const db = memoryDb({ foods: [{ tenantId: 't1', name: 'Mis papas', barcode: '7501011100013' }, { tenantId: 't1', name: 'Jitomate', catalogId: 'PLU-3001', barcode: '999' }] });
  const { add, list } = load(db);
  const l = res();
  await list(req(), l);
  assert.equal(l.body.items.filter((i) => i.added).length, 2);

  const r = res();
  await add(req({ items: withPrice(['7501011100013', 'PLU-3001', '7501011100020']) }), r);
  assert.deepEqual(r.body, { created: 1, skipped: 2, menusCreated: 1 });
  const again = res();
  await add(req({ items: withPrice(['7501011100020']) }), again);
  assert.deepEqual(again.body, { created: 0, skipped: 1, menusCreated: 0 });
});

test('agregar: las categorías se reutilizan sin importar mayúsculas, y se puede elegir una propia', async () => {
  const db = memoryDb();
  db.menus.push({ id: 'mine', name: 'sabritas (pepsico botanas)', tenantId: 't1' }, { id: 'otra-tienda', name: 'Botanas', tenantId: 't2' });
  const { add } = load(db);
  const r = res();
  await add(req({ items: withPrice(['7501011100013']) }), r);
  assert.equal(r.body.menusCreated, 0);
  assert.equal(db.created[0].menuId, 'mine');

  const chosen = res();
  await add(req({ items: withPrice(['7501011100020']), menuId: 'mine' }), chosen);
  assert.equal(chosen.code, 201);
  assert.equal(db.created[1].menuId, 'mine');

  const foreign = res();
  await add(req({ items: withPrice(['7501011100037']), menuId: 'otra-tienda' }), foreign);
  assert.equal(foreign.code, 400, 'no se puede usar la categoría de otra tienda');
  assert.equal(db.created.length, 2);
});

test('agregar: respeta el tope de productos del plan y no agrega nada a medias', async () => {
  const have = Array.from({ length: 245 }, (_, i) => ({ tenantId: 't1', name: `P${i}`, barcode: `x${i}` }));
  const db = memoryDb({ foods: have });
  const { add } = load(db);
  const r = res();
  await add(req({ items: withPrice(ids(10)) }), r); // 245 + 10 > 250 del plan Básico
  assert.equal(r.code, 403);
  assert.equal(r.body.code, 'PLAN_LIMIT');
  assert.equal(db.created.length, 0);
  const ok = res();
  await add(req({ items: withPrice(ids(5)) }), ok); // justo 250
  assert.equal(ok.code, 201);
});

test('las tiendas no se ven entre sí', async () => {
  const db = memoryDb({ foods: [{ tenantId: 't2', name: 'De otra tienda', barcode: '7501011100013' }] });
  const { add } = load(db);
  const r = res();
  await add(req({ items: withPrice(['7501011100013']) }), r);
  assert.deepEqual(r.body, { created: 1, skipped: 0, menusCreated: 1 }, 'lo de otra tienda no cuenta como «ya lo tiene»');
});

test('el front y el back coinciden en qué giros usan el catálogo', async () => {
  const src = fs.readFileSync(path.join(root, '../frontend/src/masterCatalog.js'), 'utf8');
  const mod = await import(`data:text/javascript,${encodeURIComponent(src)}`);
  assert.deepEqual([...mod.MASTER_CATALOG_GIROS].sort(), [...catalog.GIROS].sort());
});

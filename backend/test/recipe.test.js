process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
const test = require('node:test');
const assert = require('node:assert/strict');

const foods = new Map();
const stub = (rel, exports) => {
  const p = require.resolve(rel);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
};
stub('../database/mongodb', {
  async GetFoodById(id) {
    return foods.get(String(id)) || null;
  },
});
const r = require('../services/recipe.service');

const add = (f) => foods.set(f.id, f);
add({ id: 'cafe', name: 'Café en grano', isIngredient: true, stockUnit: 'g', cost: 0.4 });
add({ id: 'leche', name: 'Leche entera', isIngredient: true, stockUnit: 'ml', cost: 0.025 });
add({ id: 'almendra', name: 'Leche de almendra', isIngredient: true, stockUnit: 'ml', cost: 0.06 });
add({ id: 'vaso', name: 'Vaso 12 oz', isIngredient: true, stockUnit: 'pz', cost: 2 });
add({ id: 'jarabe', name: 'Jarabe vainilla', isIngredient: true, stockUnit: 'ml', cost: 0.1 });
add({
  id: 'latte',
  name: 'Latte',
  price: 55,
  ...r.sanitizeRecipeFields({
    recipe: [
      { ingredientId: 'cafe', qty: 18 },
      { ingredientId: 'leche', qty: 200 },
      { ingredientId: 'vaso', qty: 1 },
    ],
    sizes: [
      { id: 'ch', name: 'Chico', price: 55, factor: 1 },
      { id: 'gd', name: 'Grande', price: 70, factor: 1.5 },
    ],
    modifierGroups: [
      { id: 'leche', name: 'Leche', options: [{ id: 'alm', name: 'Leche de almendra', priceDelta: 10, replaceFrom: 'leche', replaceTo: 'almendra' }] },
      { id: 'extra', name: 'Extras', multi: true, options: [
        { id: 'shot', name: 'Extra shot', priceDelta: 12, add: [{ ingredientId: 'cafe', qty: 9 }] },
        { id: 'vai', name: 'Vainilla', priceDelta: 8, add: [{ ingredientId: 'jarabe', qty: 15 }] },
      ] },
    ],
  }),
});
add({ id: 'galleta', name: 'Galleta', price: 25 });

const qty = (lines, id) => lines.filter((l) => l.foodId === id).reduce((s, l) => s + l.quantity, 0);

test('precio y nombre los pone el servidor según tamaño y extras', async () => {
  const [item] = await r.priceItems([{ foodId: 'latte', price: 1, quantity: 1, sizeId: 'gd', modifierIds: ['leche:alm', 'extra:shot'] }]);
  assert.equal(item.price, 70 + 10 + 12, 'no se usa el precio que manda la caja');
  assert.equal(item.name, 'Latte Grande');
  assert.deepEqual(item.modifiers, ['Leche de almendra', 'Extra shot']);
  assert.equal(item.recipe, true);
  assert.equal(item.prep, true);
});

test('cada venta descuenta sus insumos: receta × tamaño × cantidad, con cambios y extras', async () => {
  const items = await r.priceItems([
    { foodId: 'latte', quantity: 2, sizeId: 'gd', modifierIds: ['leche:alm', 'extra:shot', 'extra:vai'] },
    { foodId: 'latte', quantity: 1, sizeId: 'ch' },
    { foodId: 'galleta', name: 'Galleta', price: 25, quantity: 3 },
  ]);
  const lines = await r.consumptionFor(items);
  // 2 grandes: café 18×1.5 + 9×1.5 (shot) = 40.5 c/u → 81; 1 chico: 18 → total 99 g
  assert.equal(qty(lines, 'cafe'), 99);
  // la leche entera solo la del chico (las grandes van con almendra): 200
  assert.equal(qty(lines, 'leche'), 200);
  assert.equal(qty(lines, 'almendra'), 600, '200×1.5 por cada grande');
  assert.equal(qty(lines, 'jarabe'), 45, '15×1.5×2');
  assert.equal(qty(lines, 'vaso'), 2 * 1.5 + 1);
  // lo que no lleva receta sale tal cual
  assert.equal(qty(lines, 'galleta'), 3);
  assert.equal(lines.find((l) => l.foodId === 'almendra').name, 'Leche de almendra');
});

test('costo de la bebida = suma de sus insumos', async () => {
  const [item] = await r.priceItems([{ foodId: 'latte', quantity: 1, sizeId: 'ch' }]);
  // 18×0.4 + 200×0.025 + 1×2 = 7.2 + 5 + 2
  assert.equal(await r.unitCostFor(item), 14.2);
});

test('tamaño obligatorio y validación de opciones', async () => {
  await assert.rejects(r.priceItems([{ foodId: 'latte', quantity: 1 }]), /tamaño/);
  const grp = r.sanitizeRecipeFields({ modifierGroups: [{ name: 'Leche', required: true, options: [{ name: 'Entera' }, { name: 'Almendra' }] }] });
  add({ id: 'chai', name: 'Chai', price: 50, recipe: [{ ingredientId: 'leche', qty: 200 }], ...grp });
  await assert.rejects(r.priceItems([{ foodId: 'chai', quantity: 1 }]), /leche/i);
  await assert.rejects(r.priceItems([{ foodId: 'chai', quantity: 1, modifierIds: ['g1:o1', 'g1:o2'] }]), /Solo una/);
  const [ok] = await r.priceItems([{ foodId: 'chai', quantity: 1, modifierIds: ['g1:o2'] }]);
  assert.equal(ok.price, 50);
});

test('sanitizar: unidades válidas, cantidades positivas, límites', () => {
  const s = r.sanitizeRecipeFields({ isIngredient: 1, stockUnit: 'litros', recipe: [{ ingredientId: 'x', qty: -2 }, { ingredientId: 'y', qty: '2.5' }] });
  assert.equal(s.isIngredient, true);
  assert.equal(s.stockUnit, 'pz');
  assert.deepEqual(s.recipe, [{ ingredientId: 'y', qty: 2.5 }]);
});

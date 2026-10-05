/**
 * Cafetería: bebidas y preparados con receta.
 *
 * - Un **insumo** (materia prima) es un producto con `isIngredient: true`: no sale en la caja, tiene
 *   existencias en su unidad (`stockUnit`: g, ml o pz) y costo por esa unidad.
 * - Una **bebida** tiene `recipe` (insumos y cantidades), tamaños opcionales (`sizes`, cada uno con su
 *   precio y un factor que multiplica la receta) y grupos de extras (`modifierGroups`, cada opción con
 *   su precio y lo que agrega o cambia de la receta: «leche de almendra» cambia la leche entera).
 * - Al vender, el precio lo pone el servidor (no lo que mande la caja) y se descuenta de cada insumo
 *   lo que lleva la bebida × cantidad.
 */
const db = require('../database/mongodb');

const STOCK_UNITS = ['g', 'ml', 'pz'];

class RecipeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const cleanId = (v) => String(v || '').trim().slice(0, 40);
const cleanName = (v, max = 60) => String(v || '').trim().slice(0, max);
const isRecipeFood = (food) => Array.isArray(food?.recipe) && food.recipe.length > 0;

/** Normaliza lo que llega del editor de recetas antes de guardarlo. */
function sanitizeRecipeFields(body) {
  const out = {};
  if (body.isIngredient !== undefined) out.isIngredient = Boolean(body.isIngredient);
  if (body.stockUnit !== undefined) out.stockUnit = STOCK_UNITS.includes(body.stockUnit) ? body.stockUnit : 'pz';
  if (body.prep !== undefined) out.prep = Boolean(body.prep);
  if (body.recipe !== undefined) {
    out.recipe = (Array.isArray(body.recipe) ? body.recipe : [])
      .map((r) => ({ ingredientId: cleanId(r.ingredientId), qty: Math.max(0, round3(r.qty)) }))
      .filter((r) => r.ingredientId && r.qty > 0)
      .slice(0, 30);
  }
  if (body.sizes !== undefined) {
    out.sizes = (Array.isArray(body.sizes) ? body.sizes : [])
      .map((s, i) => ({
        id: cleanId(s.id) || `s${i + 1}`,
        name: cleanName(s.name, 30),
        price: Math.max(0, round2(s.price)),
        factor: Math.min(10, Math.max(0.1, Number(s.factor) || 1)),
      }))
      .filter((s) => s.name)
      .slice(0, 6);
  }
  if (body.modifierGroups !== undefined) {
    out.modifierGroups = (Array.isArray(body.modifierGroups) ? body.modifierGroups : [])
      .map((g, gi) => ({
        id: cleanId(g.id) || `g${gi + 1}`,
        name: cleanName(g.name, 40),
        required: Boolean(g.required),
        multi: Boolean(g.multi),
        options: (Array.isArray(g.options) ? g.options : [])
          .map((o, oi) => ({
            id: cleanId(o.id) || `o${oi + 1}`,
            name: cleanName(o.name, 40),
            priceDelta: round2(o.priceDelta),
            add: (Array.isArray(o.add) ? o.add : [])
              .map((a) => ({ ingredientId: cleanId(a.ingredientId), qty: Math.max(0, round3(a.qty)) }))
              .filter((a) => a.ingredientId && a.qty > 0)
              .slice(0, 10),
            replaceFrom: cleanId(o.replaceFrom) || null,
            replaceTo: cleanId(o.replaceTo) || null,
          }))
          .filter((o) => o.name)
          .slice(0, 20),
      }))
      .filter((g) => g.name && g.options.length)
      .slice(0, 8);
  }
  return out;
}

/** Tamaño y extras elegidos para un renglón, validados contra la bebida guardada. */
function choiceFor(food, item) {
  const sizes = Array.isArray(food.sizes) ? food.sizes : [];
  let size = null;
  if (sizes.length) {
    size = sizes.find((s) => s.id === item.sizeId) || null;
    if (!size) throw new RecipeError(400, `Elige el tamaño de «${food.name}».`);
  }
  const wanted = new Set((Array.isArray(item.modifierIds) ? item.modifierIds : []).map(String));
  const chosen = [];
  for (const group of food.modifierGroups || []) {
    const picked = group.options.filter((o) => wanted.has(`${group.id}:${o.id}`));
    if (group.required && !picked.length) throw new RecipeError(400, `Elige ${group.name.toLowerCase()} de «${food.name}».`);
    if (!group.multi && picked.length > 1) throw new RecipeError(400, `Solo una opción de ${group.name.toLowerCase()} en «${food.name}».`);
    for (const o of picked) chosen.push({ group, option: o });
  }
  return { size, chosen };
}

/** Precio unitario y nombre visible de un renglón con receta. */
function priceFor(food, item) {
  const { size, chosen } = choiceFor(food, item);
  const base = size ? Number(size.price) : Number(food.price) || 0;
  const price = round2(base + chosen.reduce((sum, c) => sum + (Number(c.option.priceDelta) || 0), 0));
  return {
    price,
    name: size ? `${food.name} ${size.name}` : food.name,
    sizeId: size ? size.id : null,
    sizeName: size ? size.name : '',
    modifierIds: chosen.map((c) => `${c.group.id}:${c.option.id}`),
    modifiers: chosen.map((c) => c.option.name),
  };
}

/** Insumos que lleva UNA unidad del renglón (receta × tamaño, con cambios y extras). */
function ingredientsFor(food, item) {
  const { size, chosen } = choiceFor(food, item);
  const factor = size ? Number(size.factor) || 1 : 1;
  const amounts = new Map();
  for (const r of food.recipe || []) amounts.set(r.ingredientId, (amounts.get(r.ingredientId) || 0) + r.qty * factor);
  for (const { option } of chosen) {
    if (option.replaceFrom && amounts.has(option.replaceFrom)) {
      const qty = amounts.get(option.replaceFrom);
      amounts.delete(option.replaceFrom);
      if (option.replaceTo) amounts.set(option.replaceTo, (amounts.get(option.replaceTo) || 0) + qty);
    }
    for (const a of option.add || []) amounts.set(a.ingredientId, (amounts.get(a.ingredientId) || 0) + a.qty * factor);
  }
  return [...amounts.entries()].map(([ingredientId, qty]) => ({ ingredientId, qty: round3(qty) }));
}

async function foodsFor(items, tenantId) {
  const ids = [...new Set((items || []).map((i) => String(i?.foodId || i?.food || '')).filter(Boolean))];
  const foods = await Promise.all(ids.map((id) => db.GetFoodById(id, tenantId).catch(() => null)));
  return new Map(foods.filter(Boolean).map((f) => [String(f.id), f]));
}

/**
 * Antes de crear la venta: a los renglones con receta les pone el precio, nombre y extras del servidor.
 * Los demás renglones pasan igual.
 */
async function priceItems(items, tenantId, foodsById = null) {
  const foods = foodsById || (await foodsFor(items, tenantId));
  return (items || []).map((item) => {
    const food = foods.get(String(item?.foodId || item?.food || ''));
    if (!food || !isRecipeFood(food)) return item;
    const priced = priceFor(food, item);
    return { ...item, ...priced, priceIncludesTax: Boolean(food.priceIncludesTax), recipe: true, prep: food.prep !== false };
  });
}

/**
 * Lo que sale del inventario al cobrar: productos normales tal cual; bebidas, sus insumos.
 * @returns renglones { foodId, name, quantity } listos para descontar existencias
 */
async function consumptionFor(items, tenantId, foodsById = null) {
  const foods = foodsById || (await foodsFor(items, tenantId));
  const lines = [];
  const needIngredients = new Set();
  for (const item of items || []) {
    const foodId = String(item?.foodId || item?.food || '');
    const qty = Number(item?.quantity) || 0;
    if (!foodId || qty <= 0) continue;
    const food = foods.get(foodId);
    if (food && isRecipeFood(food)) {
      for (const ing of ingredientsFor(food, item)) {
        needIngredients.add(ing.ingredientId);
        lines.push({ foodId: ing.ingredientId, name: '', quantity: round3(ing.qty * qty), fromItem: item.name, fromRecipe: true });
      }
    } else {
      lines.push({ foodId, name: item.name || 'Producto', quantity: qty });
    }
  }
  // Nombres de los insumos para los avisos de «sin existencias»
  const missing = [...needIngredients].filter((id) => !foods.has(id));
  const extra = await Promise.all(missing.map((id) => db.GetFoodById(id, tenantId).catch(() => null)));
  for (const f of extra) if (f) foods.set(String(f.id), f);
  for (const line of lines) if (!line.name) line.name = foods.get(line.foodId)?.name || 'Insumo';
  return lines;
}

/** Costo de una unidad del renglón con receta (suma de insumos × su costo). */
async function unitCostFor(item, tenantId) {
  const food = await db.GetFoodById(String(item.foodId || item.food || ''), tenantId).catch(() => null);
  if (!food || !isRecipeFood(food)) return null;
  const parts = ingredientsFor(food, item);
  const costs = await Promise.all(parts.map((p) => db.GetFoodById(p.ingredientId, tenantId).catch(() => null)));
  return round2(parts.reduce((sum, p, i) => sum + p.qty * (Number(costs[i]?.cost) || 0), 0));
}

module.exports = {
  STOCK_UNITS,
  RecipeError,
  isRecipeFood,
  sanitizeRecipeFields,
  priceFor,
  ingredientsFor,
  priceItems,
  consumptionFor,
  unitCostFor,
};

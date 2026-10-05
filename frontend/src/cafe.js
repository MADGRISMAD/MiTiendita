// Cafetería: bebidas con receta, tamaños y extras.
// El precio que se muestra aquí es el mismo que calcula el servidor (backend/services/recipe.service.js);
// al cobrar, el servidor vuelve a poner el precio y descuenta los insumos.

export const STOCK_UNITS = [
  { id: "ml", label: "Mililitros (ml)", short: "ml" },
  { id: "g", label: "Gramos (g)", short: "g" },
  { id: "pz", label: "Piezas (pz)", short: "pz" },
];

export function unitShort(unit) {
  return STOCK_UNITS.find((u) => u.id === unit)?.short || "pz";
}

export function isRecipe(food) {
  return Array.isArray(food?.recipe) && food.recipe.length > 0;
}

export function isIngredient(food) {
  return Boolean(food?.isIngredient);
}

/** ¿Hay que preguntar tamaño o extras antes de agregarla al ticket? */
export function needsOptions(food) {
  return isRecipe(food) && ((food.sizes || []).length > 0 || (food.modifierGroups || []).length > 0);
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Precio, nombre y extras de una bebida con la elección hecha.
 * @param {object} food bebida
 * @param {{ sizeId?: string, modifierIds?: string[] }} choice
 */
export function pricedChoice(food, choice = {}) {
  const sizes = food.sizes || [];
  const size = sizes.find((s) => s.id === choice.sizeId) || null;
  const wanted = new Set(choice.modifierIds || []);
  const chosen = [];
  for (const g of food.modifierGroups || []) {
    for (const o of g.options || []) if (wanted.has(`${g.id}:${o.id}`)) chosen.push({ g, o });
  }
  const base = size ? Number(size.price) : Number(food.price) || 0;
  const price = round2(base + chosen.reduce((sum, c) => sum + (Number(c.o.priceDelta) || 0), 0));
  const modifierIds = chosen.map((c) => `${c.g.id}:${c.o.id}`);
  return {
    price,
    name: size ? `${food.name} ${size.name}` : food.name,
    sizeId: size ? size.id : null,
    sizeName: size ? size.name : "",
    modifierIds,
    modifiers: chosen.map((c) => c.o.name),
    lineKey: [food.id, size?.id || "", ...[...modifierIds].sort()].join("|"),
  };
}

/** Insumos de una taza con la elección hecha (para mostrar el costo en el editor). */
export function ingredientsOf(food, choice = {}) {
  const size = (food.sizes || []).find((s) => s.id === choice.sizeId) || null;
  const factor = size ? Number(size.factor) || 1 : 1;
  const wanted = new Set(choice.modifierIds || []);
  const amounts = new Map();
  for (const r of food.recipe || []) amounts.set(r.ingredientId, (amounts.get(r.ingredientId) || 0) + Number(r.qty) * factor);
  for (const g of food.modifierGroups || []) {
    for (const o of g.options || []) {
      if (!wanted.has(`${g.id}:${o.id}`)) continue;
      if (o.replaceFrom && amounts.has(o.replaceFrom)) {
        const qty = amounts.get(o.replaceFrom);
        amounts.delete(o.replaceFrom);
        if (o.replaceTo) amounts.set(o.replaceTo, (amounts.get(o.replaceTo) || 0) + qty);
      }
      for (const a of o.add || []) amounts.set(a.ingredientId, (amounts.get(a.ingredientId) || 0) + Number(a.qty) * factor);
    }
  }
  return [...amounts.entries()].map(([ingredientId, qty]) => ({ ingredientId, qty }));
}

/** Costo de una taza: insumos × costo por unidad. */
export function recipeCost(food, ingredientsById, choice = {}) {
  return round2(
    ingredientsOf(food, choice).reduce((sum, p) => sum + p.qty * (Number(ingredientsById.get(p.ingredientId)?.cost) || 0), 0)
  );
}

/** Cuántas tazas alcanzan con las existencias de insumos (tamaño base, sin extras). */
export function cupsLeft(food, ingredientsById) {
  let min = Infinity;
  for (const p of ingredientsOf(food, { sizeId: food.sizes?.[0]?.id })) {
    const stock = Number(ingredientsById.get(p.ingredientId)?.stock) || 0;
    if (p.qty > 0) min = Math.min(min, Math.floor(stock / p.qty));
  }
  return Number.isFinite(min) ? Math.max(0, min) : null;
}

/** ¿La bebida usa el insumo, en su receta o en algún extra? */
export function usesIngredient(drink, id) {
  const key = String(id);
  if ((drink.recipe || []).some((r) => String(r.ingredientId) === key)) return true;
  return (drink.modifierGroups || []).some((g) =>
    (g.options || []).some((o) => String(o.replaceTo) === key || (o.add || []).some((a) => String(a.ingredientId) === key))
  );
}

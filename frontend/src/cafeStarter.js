// Menú de ejemplo para una cafetería: insumos con costo típico y bebidas con receta.
// Se crea desde la pantalla Recetas con un toque; el dueño luego ajusta cantidades y precios.

export const STARTER_INGREDIENTS = [
  { key: "coffee", name: "Café en grano", stockUnit: "g", cost: 0.4, stock: 1000, lowStockThreshold: 250 },
  { key: "milk", name: "Leche entera", stockUnit: "ml", cost: 0.025, stock: 4000, lowStockThreshold: 1000 },
  { key: "almond", name: "Leche de almendra", stockUnit: "ml", cost: 0.06, stock: 1000, lowStockThreshold: 500 },
  { key: "oat", name: "Leche de avena", stockUnit: "ml", cost: 0.055, stock: 1000, lowStockThreshold: 500 },
  { key: "vanilla", name: "Jarabe de vainilla", stockUnit: "ml", cost: 0.25, stock: 750, lowStockThreshold: 150 },
  { key: "caramel", name: "Jarabe de caramelo", stockUnit: "ml", cost: 0.25, stock: 750, lowStockThreshold: 150 },
  { key: "cocoa", name: "Cocoa", stockUnit: "g", cost: 0.3, stock: 500, lowStockThreshold: 100 },
  { key: "cup", name: "Vaso con tapa", stockUnit: "pz", cost: 3.5, stock: 100, lowStockThreshold: 25 },
];

const SIZES = (chico, grande) => [
  { id: "chico", name: "Chico", price: chico, factor: 1 },
  { id: "grande", name: "Grande", price: grande, factor: 1.5 },
];

const MILK_GROUP = {
  id: "leche",
  name: "Leche",
  required: false,
  multi: false,
  options: [
    { id: "almendra", name: "Almendra", priceDelta: 10, replaceFrom: "milk", replaceTo: "almond" },
    { id: "avena", name: "Avena", priceDelta: 10, replaceFrom: "milk", replaceTo: "oat" },
  ],
};
const EXTRAS_GROUP = {
  id: "extras",
  name: "Extras",
  required: false,
  multi: true,
  options: [
    { id: "shot", name: "Shot extra", priceDelta: 12, add: [{ ingredient: "coffee", qty: 9 }] },
    { id: "vainilla", name: "Vainilla", priceDelta: 8, add: [{ ingredient: "vanilla", qty: 15 }] },
    { id: "caramelo", name: "Caramelo", priceDelta: 8, add: [{ ingredient: "caramel", qty: 15 }] },
  ],
};

export const STARTER_DRINKS = [
  {
    name: "Espresso",
    price: 35,
    recipe: [{ ingredient: "coffee", qty: 9 }],
    groups: [],
  },
  {
    name: "Americano",
    recipe: [{ ingredient: "coffee", qty: 18 }, { ingredient: "cup", qty: 1 }],
    sizes: SIZES(40, 50),
    groups: [EXTRAS_GROUP],
  },
  {
    name: "Latte",
    recipe: [{ ingredient: "coffee", qty: 18 }, { ingredient: "milk", qty: 200 }, { ingredient: "cup", qty: 1 }],
    sizes: SIZES(55, 68),
    groups: [MILK_GROUP, EXTRAS_GROUP],
  },
  {
    name: "Capuchino",
    recipe: [{ ingredient: "coffee", qty: 18 }, { ingredient: "milk", qty: 150 }, { ingredient: "cup", qty: 1 }],
    sizes: SIZES(55, 68),
    groups: [MILK_GROUP, EXTRAS_GROUP],
  },
  {
    name: "Mocha",
    recipe: [
      { ingredient: "coffee", qty: 18 },
      { ingredient: "milk", qty: 180 },
      { ingredient: "cocoa", qty: 20 },
      { ingredient: "cup", qty: 1 },
    ],
    sizes: SIZES(62, 75),
    groups: [MILK_GROUP],
  },
  {
    name: "Chocolate caliente",
    recipe: [{ ingredient: "milk", qty: 240 }, { ingredient: "cocoa", qty: 30 }, { ingredient: "cup", qty: 1 }],
    sizes: SIZES(50, 62),
    groups: [MILK_GROUP],
  },
];

/** Pasa la bebida de ejemplo al formato del servidor, con los ids reales de los insumos. */
export function starterDrinkPayload(drink, idOf, menuId) {
  const ref = (key) => idOf[key];
  const sizes = drink.sizes || [];
  return {
    name: drink.name,
    menuId,
    price: sizes.length ? sizes[0].price : drink.price,
    prep: true,
    priceIncludesTax: true,
    recipe: drink.recipe.map((r) => ({ ingredientId: ref(r.ingredient), qty: r.qty })),
    sizes,
    modifierGroups: drink.groups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
        add: (o.add || []).map((a) => ({ ingredientId: ref(a.ingredient), qty: a.qty })),
        replaceFrom: o.replaceFrom ? ref(o.replaceFrom) : null,
        replaceTo: o.replaceTo ? ref(o.replaceTo) : null,
      })),
    })),
  };
}

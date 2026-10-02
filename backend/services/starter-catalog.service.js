/**
 * Catálogo mínimo para que una tienda cobre el primer día.
 * No reemplaza el seed demo completo (scripts/seed-menu.js).
 */
const STARTER = [
  {
    name: 'Bebidas',
    description: 'Refrescos y agua',
    foods: [
      { name: 'Coca-Cola 600 ml', price: 22, barcode: '7501055300162' },
      { name: 'Agua Ciel 1.5 L', price: 18, barcode: '7501055363013' },
      { name: 'Sabritas Original 45 g', price: 18, barcode: '7501011115084' },
    ],
  },
  {
    name: 'Abarrotes',
    description: 'Despensa básica',
    foods: [
      { name: 'Leche Lala 1 L', price: 28, barcode: '7501020543674' },
      { name: 'Huevo blanco 18 pzas', price: 62, barcode: '7501030425113' },
      { name: 'Frijol negro 900 g', price: 32, barcode: '7501018310123' },
      { name: 'Azúcar 1 kg', price: 36, barcode: '7501071302015' },
      { name: 'Aceite 1 L', price: 48, barcode: '7501052471011' },
    ],
  },
];

function starterProductCount() {
  return STARTER.reduce((n, cat) => n + cat.foods.length, 0);
}

async function seedStarterCatalog(db, tenantId) {
  const created = { menus: 0, foods: 0 };
  for (const cat of STARTER) {
    const menu = await db.CreateMenu({
      name: cat.name,
      description: cat.description,
      tenantId,
      starterSeed: true,
    });
    created.menus += 1;
    for (const food of cat.foods) {
      await db.CreateFood({
        name: food.name,
        price: food.price,
        cost: 0,
        priceIncludesTax: true,
        description: '',
        imgUrl: '',
        sku: food.barcode,
        barcode: food.barcode,
        menuId: String(menu.id),
        tenantId,
        stock: 0,
        starterSeed: true,
      });
      created.foods += 1;
    }
  }
  return created;
}

module.exports = {
  STARTER,
  starterProductCount,
  seedStarterCatalog,
};

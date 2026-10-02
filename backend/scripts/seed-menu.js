/**
 * Seed catálogo de abarrotes (categorías + productos con código de barras).
 * Uso: node scripts/seed-menu.js
 * Opcional:
 *   TENANT_ID=<id>     — solo ese tenant
 *   WIPE_ALL=1         — borra todos los menus/foods del tenant (default: 1)
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const { createTenantDoc } = require('../models/tenant.model');

const uri = process.env.DATABASE_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DATABASE_NAME || 'timber';
const SEED_TAG = 'demo-abarrotes-v1';
const wipeAll = process.env.WIPE_ALL !== '0';

const img = (id) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

/** Catálogo típico de tienda de abarrotes (MXN, IVA incluido) */
const CATALOG = [
  {
    name: 'Bebidas',
    description: 'Refrescos, agua y jugos',
    foods: [
      {
        name: 'Coca-Cola 600 ml',
        price: 22,
        barcode: '7501055300162',
        description: 'Refresco de cola PET 600 ml',
        imgUrl: img('photo-1629203851122-3726ecdf080e'),
      },
      {
        name: 'Pepsi 600 ml',
        price: 20,
        barcode: '7501031311309',
        description: 'Refresco de cola PET 600 ml',
        imgUrl: img('photo-1629203851122-3726ecdf080e'),
      },
      {
        name: 'Agua Ciel 1.5 L',
        price: 18,
        barcode: '7501055363013',
        description: 'Agua purificada PET 1.5 L',
        imgUrl: img('photo-1548839140-29a749e1cf4d'),
      },
      {
        name: 'Jumex Mango 1 L',
        price: 28,
        barcode: '7501020512014',
        description: 'Néctar de mango tetra 1 L',
        imgUrl: img('photo-1600271886742-f049cd451bba'),
      },
      {
        name: 'Powerade Uva 500 ml',
        price: 25,
        barcode: '7501055330015',
        description: 'Bebida isotónica 500 ml',
        imgUrl: img('photo-1622483767028-3f66f32aef97'),
      },
      {
        name: 'Cerveza Corona 355 ml',
        price: 28,
        barcode: '7501064191183',
        description: 'Cerveza clara lata/botella 355 ml',
        imgUrl: img('photo-1608270586620-248524c67de9'),
      },
    ],
  },
  {
    name: 'Botanas',
    description: 'Snacks y dulces',
    foods: [
      {
        name: 'Sabritas Original 45 g',
        price: 18,
        barcode: '7501011115084',
        description: 'Papas fritas saladas',
        imgUrl: img('photo-1566478989037-eec170784d0b'),
      },
      {
        name: 'Doritos Nacho 62 g',
        price: 20,
        barcode: '7501011131503',
        description: 'Totopos sabor queso nacho',
        imgUrl: img('photo-1613919113644-2960b0b5c2d9'),
      },
      {
        name: 'Ruffles Queso 45 g',
        price: 18,
        barcode: '7501011117057',
        description: 'Papas onduladas sabor queso',
        imgUrl: img('photo-1566478989037-eec170784d0b'),
      },
      {
        name: 'Carlos V 18 g',
        price: 12,
        barcode: '7501000104018',
        description: 'Chocolate con leche individual',
        imgUrl: img('photo-1548907040-4baa42d10919'),
      },
      {
        name: 'Galletas Emperador 172 g',
        price: 32,
        barcode: '7501000663107',
        description: 'Galletas rellenas de chocolate',
        imgUrl: img('photo-1558961363-fa8fdf82db35'),
      },
      {
        name: 'Chicles Trident Menta',
        price: 15,
        barcode: '7501003301234',
        description: 'Paquete 3 piezas',
        imgUrl: img('photo-1582058091505-f87a2e55a40f'),
      },
    ],
  },
  {
    name: 'Lácteos',
    description: 'Leche, yogurt y quesos',
    foods: [
      {
        name: 'Leche Lala Entera 1 L',
        price: 28,
        barcode: '7501020511109',
        description: 'Leche pasteurizada entera',
        imgUrl: img('photo-1563636619-e9143da7973b'),
      },
      {
        name: 'Leche Alpura Deslactosada 1 L',
        price: 32,
        barcode: '7501055901674',
        description: 'Leche deslactosada',
        imgUrl: img('photo-1563636619-e9143da7973b'),
      },
      {
        name: 'Yogurt Danone Fresa 150 g',
        price: 14,
        barcode: '7501032399010',
        description: 'Yogurt batido sabor fresa',
        imgUrl: img('photo-1488477181946-6428a0291777'),
      },
      {
        name: 'Queso Panela 400 g',
        price: 68,
        barcode: '7501040090123',
        description: 'Queso fresco panela',
        imgUrl: img('photo-1486297678162-eb2a19b0a32d'),
      },
      {
        name: 'Crema Lala 450 ml',
        price: 38,
        barcode: '7501020512205',
        description: 'Crema ácida para cocinar',
        imgUrl: img('photo-1628088062854-d1870b4553da'),
      },
      {
        name: 'Huevo blanco 12 pzas',
        price: 45,
        barcode: '7503001234567',
        description: 'Cartón de 12 huevos blancos',
        imgUrl: img('photo-1582722872445-44dc5f7e3c8f'),
      },
    ],
  },
  {
    name: 'Abarrotes',
    description: 'Básicos de despensa',
    foods: [
      {
        name: 'Arroz Schettino 1 kg',
        price: 32,
        barcode: '7501017001234',
        description: 'Arroz grano largo',
        imgUrl: img('photo-1586201375761-83865001e31c'),
      },
      {
        name: 'Frijol Negro Verde Valle 1 kg',
        price: 42,
        barcode: '7501006500894',
        description: 'Frijol negro entero',
        imgUrl: img('photo-1596797038530-2c107229654b'),
      },
      {
        name: 'Aceite Capullo 946 ml',
        price: 48,
        barcode: '7501003100018',
        description: 'Aceite vegetal comestible',
        imgUrl: img('photo-1474979266404-7eaacbcd87c5'),
      },
      {
        name: 'Azúcar Standard 1 kg',
        price: 28,
        barcode: '7501000110019',
        description: 'Azúcar refinada',
        imgUrl: img('photo-1587049352846-4a222e784d38'),
      },
      {
        name: 'Sal La Fina 1 kg',
        price: 18,
        barcode: '7501000120018',
        description: 'Sal de mesa yodada',
        imgUrl: img('photo-1518110925495-5fe2fda7b695'),
      },
      {
        name: 'Spaghetti Barilla 500 g',
        price: 35,
        barcode: '8076809513388',
        description: 'Pasta seca spaghetti nº5',
        imgUrl: img('photo-1551462147-ff29053ec39f'),
      },
      {
        name: 'Atún Dolores en aceite 140 g',
        price: 24,
        barcode: '7501017005019',
        description: 'Atún en aceite de soya',
        imgUrl: img('photo-1604908176997-125f25cc6f3d'),
      },
      {
        name: 'Salsa Valentina 370 ml',
        price: 22,
        barcode: '7501017000886',
        description: 'Salsa picante roja',
        imgUrl: img('photo-1599909533724-0c0c5a0a0a0a'),
      },
    ],
  },
  {
    name: 'Panadería',
    description: 'Pan y tortillas',
    foods: [
      {
        name: 'Pan Bimbo Blanco grande',
        price: 42,
        barcode: '7501000115105',
        description: 'Pan de caja blanco',
        imgUrl: img('photo-1509440159596-0249088772ff'),
      },
      {
        name: 'Tortillas de maíz 1 kg',
        price: 28,
        barcode: '7503009876543',
        description: 'Paquete de tortillas de maíz',
        imgUrl: img('photo-1565299585323-38d6b0865b47'),
      },
      {
        name: 'Tortillas de harina 10 pzas',
        price: 32,
        barcode: '7501017002200',
        description: 'Tortillas de harina para burritos',
        imgUrl: img('photo-1619535860434-ba1d8fa12536'),
      },
      {
        name: 'Bolillo',
        price: 5,
        barcode: '7503001111001',
        description: 'Pieza de pan bolillo',
        imgUrl: img('photo-1549931319-a545dcf3bc73'),
      },
      {
        name: 'Concha de vainilla',
        price: 12,
        barcode: '7503001111002',
        description: 'Pan dulce concha',
        imgUrl: img('photo-1509440159596-0249088772ff'),
      },
    ],
  },
  {
    name: 'Limpieza',
    description: 'Hogar y aseo',
    foods: [
      {
        name: 'Jabón Zote blanco 400 g',
        price: 22,
        barcode: '7501020601015',
        description: 'Jabón de lavandería',
        imgUrl: img('photo-1583947215259-38e31be8751f'),
      },
      {
        name: 'Cloralex 1 L',
        price: 28,
        barcode: '7501035901234',
        description: 'Cloro doméstico',
        imgUrl: img('photo-1585421514738-01798aa225fa'),
      },
      {
        name: 'Fabuloso Lavanda 1 L',
        price: 35,
        barcode: '7501035905678',
        description: 'Limpiador multiusos',
        imgUrl: img('photo-1563453397536-e570abbf16f5'),
      },
      {
        name: 'Papel Higiénico Pétalo 4 rollos',
        price: 48,
        barcode: '7501007461123',
        description: 'Paquete 4 rollos',
        imgUrl: img('photo-1584556812952-905ffd0a5d0d'),
      },
      {
        name: 'Servilletas Elite 200 pzas',
        price: 32,
        barcode: '7501007462205',
        description: 'Paquete de servilletas',
        imgUrl: img('photo-1584556812952-905ffd0a5d0d'),
      },
      {
        name: 'Escoba de plástico',
        price: 55,
        barcode: '7503002222001',
        description: 'Escoba con mango',
        imgUrl: img('photo-1581578731548-c64695cc6952'),
      },
    ],
  },
  {
    name: 'Cuidado personal',
    description: 'Higiene y belleza',
    foods: [
      {
        name: 'Pasta Colgate Triple Acción 75 ml',
        price: 38,
        barcode: '7509546001234',
        description: 'Pasta dental',
        imgUrl: img('photo-1622383563227-04401dedd4c0'),
      },
      {
        name: 'Jabón Dove 90 g',
        price: 28,
        barcode: '7506306201234',
        description: 'Jabón de tocador',
        imgUrl: img('photo-1608248543805-ba88399b5a0d'),
      },
      {
        name: 'Shampoo Head & Shoulders 180 ml',
        price: 65,
        barcode: '7500435123456',
        description: 'Shampoo anticaspa',
        imgUrl: img('photo-1535585209827-a15fcdbc4c2d'),
      },
      {
        name: 'Desodorante Rexona stick',
        price: 55,
        barcode: '7506306212345',
        description: 'Antitranspirante',
        imgUrl: img('photo-1556228578-0d85b1a4d571'),
      },
      {
        name: 'Rastrillos Gillette Prestobarba 2',
        price: 42,
        barcode: '7500435134567',
        description: 'Paquete 5 piezas',
        imgUrl: img('photo-1626467477482-6c0e0e0e0e0e'),
      },
    ],
  },
];

async function resolveTenantIds(db) {
  if (process.env.TENANT_ID && ObjectId.isValid(process.env.TENANT_ID)) {
    return [String(process.env.TENANT_ID)];
  }

  const tenants = db.collection('tenants');
  const all = await tenants.find({}).project({ _id: 1 }).toArray();
  if (all.length) return all.map((t) => String(t._id));

  const insert = await tenants.insertOne({
    ...createTenantDoc('Abarrotes Demo'),
    slug: 'default',
  });
  console.log('Tenant demo creado');
  return [String(insert.insertedId)];
}

async function seedTenant(db, tenantId) {
  const menusCol = db.collection('menus');
  const foodsCol = db.collection('foods');
  const settingsCol = db.collection('settings');
  const tenantsCol = db.collection('tenants');

  if (wipeAll) {
    await foodsCol.deleteMany({ tenantId });
    await menusCol.deleteMany({ tenantId });
  } else {
    await foodsCol.deleteMany({ tenantId, seedTag: SEED_TAG });
    await menusCol.deleteMany({ tenantId, seedTag: SEED_TAG });
  }

  let foodCount = 0;
  for (const cat of CATALOG) {
    const menuRes = await menusCol.insertOne({
      name: cat.name,
      description: cat.description,
      tenantId,
      seedTag: SEED_TAG,
      createdAt: new Date(),
    });
    const menuId = String(menuRes.insertedId);

    for (const food of cat.foods) {
      const code = String(food.barcode || '').trim();
      await foodsCol.insertOne({
        name: food.name,
        price: food.price,
        description: food.description,
        imgUrl: food.imgUrl,
        sku: code,
        barcode: code,
        priceIncludesTax: true,
        menuId,
        tenantId,
        seedTag: SEED_TAG,
        createdAt: new Date(),
      });
      foodCount += 1;
    }
  }

  await settingsCol.updateOne(
    { tenantId },
    {
      $set: {
        businessType: 'abarrotes',
        venueName: 'Abarrotes López',
        name: 'Abarrotes López',
        updatedAt: new Date(),
      },
      $setOnInsert: { tenantId, createdAt: new Date() },
    },
    { upsert: true }
  );

  await tenantsCol.updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: { name: 'Abarrotes López', updatedAt: new Date() } }
  );

  return foodCount;
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const tenantIds = await resolveTenantIds(db);

  let totalFoods = 0;
  for (const tenantId of tenantIds) {
    const n = await seedTenant(db, tenantId);
    totalFoods += n;
    console.log(
      `Tenant ${tenantId}: ${CATALOG.length} categorías, ${n} productos`
    );
  }

  console.log(
    `Seed OK: ${tenantIds.length} tenant(s), ${totalFoods} productos de abarrotes`
  );
  await client.close();
}

main().catch((err) => {
  console.error('Seed falló:', err.message);
  process.exit(1);
});

/**
 * Fotos de la landing: capturas de la app REAL (build de producción) con una API simulada
 * de una tienda de abarrotes creíble (catálogo maestro de 181 productos y una semana de ventas).
 *
 *   cd frontend && npm run build && npx vite preview --port 4175 &
 *   node scripts/landing-screens.cjs /tmp/capturas
 *   # Convertir a WebP para la página (PC 1600/900 px de ancho, celular 780 px):
 *   for f in caja-pc cobro-pc resumen-pc productos-pc; do
 *     ffmpeg -y -i /tmp/capturas/$f.png -vf scale=1600:-1 -c:v libwebp -quality 84 public/screens/$f.webp
 *     ffmpeg -y -i /tmp/capturas/$f.png -vf scale=900:-1 -c:v libwebp -quality 82 public/screens/$f-900.webp
 *   done
 *   ffmpeg -y -i /tmp/capturas/caja-movil.png -vf scale=780:-1 -c:v libwebp -quality 84 public/screens/caja-movil.webp
 *
 * Necesita Playwright con Chromium (npm i -g playwright). Vuelve a correrlo cuando cambie la caja,
 * así la landing siempre enseña cómo se ve el sistema hoy.
 */
const { execSync } = require('child_process');
const path = require('path');
const { chromium } = require(require.resolve('playwright', { paths: [process.cwd(), execSync('npm root -g').toString().trim()] }));
const ORIGIN = process.env.ORIGIN || 'http://localhost:4175';
const OUT = process.argv[2] || '.';
const cat = require(path.join(__dirname, '../../backend/data/catalogo-maestro.json')).items;

// Precios de anaquel realistas (MXN) por palabra clave
const PRICE = [
  [/Coca-Cola .*600/, 22], [/Coca-Cola .*1\.25/, 32], [/Coca-Cola .*2/, 42], [/Pepsi .*600|Manzanita .*600/, 19], [/2\.5 L/, 39],
  [/Papas Sabritas/, 52], [/Takis/, 46], [/Chips/, 44], [/Doritos/, 48], [/Ruffles/, 52], [/Cheetos/, 28], [/Fritos/, 24],
  [/Rancheritos/, 20], [/Sabritones/, 32], [/Churrumais/, 18], [/Cacahuates/, 22], [/Tostitos/, 52], [/Gansito/, 20], [/Pingüinos|Choco Roles|Submarinos/, 28],
  [/Pan Blanco Grande/, 54], [/Pan Blanco Chico/, 36], [/Pan/, 52], [/Galletas Marías Rollote/, 49], [/Galletas/, 25], [/Emperador/, 22],
  [/Leche/, 31], [/Crema/, 42], [/^Queso/, 89], [/Tecate .*Six|Six Pack/, 112], [/Tecate|XX|Cerveza/, 26],
  [/Nescafé Clásico/, 118], [/Nescafé|Café/, 89], [/Carlos V/, 9], [/Maggi/, 39], [/Chiles/, 24], [/Frijoles/, 29],
  [/Colgate/, 38], [/Palmolive/, 21], [/Fabuloso/, 34], [/Axion/, 36], [/Huevo/, 89], [/Tortilla/, 24],
  [/Jitomate/, 32], [/Tomate Verde/, 28], [/Cebolla/, 30], [/Papa /, 35], [/Limón/, 38], [/Plátano/, 24], [/Aguacate/, 79],
  [/Bistec|Res|Carne/, 199], [/Pollo/, 89], [/Electrolit/, 25], [/Gatorade/, 27], [/Agua/, 14],
];
const priceOf = (name) => (PRICE.find(([re]) => re.test(name)) || [, 25])[1];
const sections = [...new Set(cat.map((i) => i.section))];
const menuName = (s) => s.split(' (')[0].replace('Departamentos Frescos: ', '').replace('Productos de ', '');
const menus = [
  { id: 'm1', name: 'Bebidas' }, { id: 'm2', name: 'Botanas' }, { id: 'm3', name: 'Pan y galletas' },
  { id: 'm4', name: 'Lácteos' }, { id: 'm5', name: 'Abarrotes' }, { id: 'm6', name: 'Frutas y verduras' },
  { id: 'm7', name: 'Cervezas' }, { id: 'm8', name: 'Limpieza' },
];
const menuOf = (s) => /Coca|PepsiCo Bebidas/.test(s) ? 'm1' : /Sabritas|Barcel/.test(s) ? 'm2' : /Marinela|Gamesa|Bimbo/.test(s) ? 'm3'
  : /Lala|Sigma/.test(s) ? 'm4' : /Frescos/.test(s) ? 'm6' : /Cervecer/.test(s) ? 'm7' : /Colgate/.test(s) ? 'm8' : 'm5';
const IMG = {}; // sin fotos: la app muestra iniciales de color (así se ve una tienda real recién dada de alta)
const foods = cat.map((i, n) => {
  const name = i.unit === 'kg' && /^1\s*kg$/i.test(i.presentation) ? i.name : `${i.name} ${i.presentation}`;
  const price = priceOf(name);
  return {
    id: `f${n + 1}`, name, price, cost: Math.round(price * 0.68 * 100) / 100, priceIncludesTax: true,
    barcode: i.plu ? '' : i.code, sku: i.plu ? '' : i.code, menuId: menuOf(i.section), saleUnit: i.unit === 'kg' ? 'kg' : 'pz',
    stock: [3, 12, 24, 40, 8, 60, 18][n % 7] * (i.unit === 'kg' ? 1 : 1), lowStockThreshold: 5, tracksExpiry: false, supplierIds: [], description: '',
    imgUrl: IMG[name] || '',
  };
});
const byName = (re) => foods.find((f) => re.test(f.name));

// Ventas de la semana (horas de tienda de barrio)
function orders(days = 7) {
  const out = []; let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const now = new Date(`${new Date().toISOString().slice(0, 10)}T20:42:00Z`);
  for (let d = days - 1; d >= 0; d--) {
    const n = 85 + Math.floor(rnd() * 30);
    for (let k = 0; k < n; k++) {
      const t = new Date(now); t.setDate(t.getDate() - d);
      const hour = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 20, 21][Math.floor(rnd() * 17)];
      t.setUTCHours(hour + 7, Math.floor(rnd() * 60), 0, 0); // hora de Tijuana
      if (t > now) continue;
      const items = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => {
        const f = foods[Math.floor(rnd() * foods.length)];
        return { foodId: f.id, name: f.name, price: f.price, quantity: 1 + Math.floor(rnd() * 2), unitCost: f.cost, priceIncludesTax: true, saleUnit: f.saleUnit };
      });
      const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
      const pm = rnd() < 0.7 ? 'cash' : rnd() < 0.8 ? 'card' : 'transfer';
      out.push({ id: `o${d}${k}`, items, total, subtotal: total, tax: Math.round(total / 1.16 * 0.16 * 100) / 100, paymentMethod: pm, paymentStatus: 'paid', status: 'served', createdAt: t.toISOString(), paidAt: t.toISOString(), cashierName: 'Lupita', taxRate: 0.16 });
    }
  }
  return out;
}
const ORDERS = orders();

function api(path, method, q) {
  if (path.endsWith('/billing/status')) return { status: 'active', plan: 'growth', aiEnabled: true, isPerpetual: false };
  if (path.endsWith('/settings')) return { setupCompleted: true, businessName: 'Abarrotes Lupita', businessType: 'abarrotes', inventoryEnabled: true, taxRate: 0.16, address: 'Av. Revolución 1234, Tijuana', phone: '6641234567', timezone: 'America/Tijuana', logoUrl: '/logo.svg' };
  if (path.endsWith('/cash/session')) return { open: true, session: { id: 'c1', createdAt: `${new Date().toISOString().slice(0, 10)}T14:02:00Z`, openingFloat: 500, openedBy: 'Lupita' } };
  if (path.endsWith('/menus')) return menus;
  if (/\/menus\/m\d$/.test(path)) { const id = path.split('/').pop(); return { ...menus.find((m) => m.id === id), foods: foods.filter((f) => f.menuId === id) }; }
  if (path.endsWith('/foods')) return foods;
  if (path.endsWith('/foods/low-stock')) return foods.filter((f) => f.stock <= 5).slice(0, 6);
  if (path.includes('/orders/report/summary')) return { totalSales: 0, totalOrders: 0 };
  if (path.includes('/orders/report')) {
    const from = new Date(q.get('from')), to = new Date(q.get('to'));
    return ORDERS.filter((o) => { const t = new Date(o.paidAt); return (isNaN(from) || t >= from) && (isNaN(to) || t <= to); });
  }
  if (path.includes('/orders/sale')) return { id: 'a1b2c3', paymentStatus: 'paid' };
  if (/expiring/.test(path)) return { items: [], summary: {} };
  if (/suppliers|customers|purchases|activity|invites|lots/.test(path)) return [];
  return null; // desconocido
}

async function mock(page, unknown) {
  await page.route(/localhost:8081|hyperionmkt/, async (r) => {
    const req = r.request(); const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    let body = api(u.pathname, req.method(), u.searchParams);
    if (body === null) { unknown.add(`${req.method()} ${u.pathname}`); body = {}; }
    return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
}

(async () => {
  const b = await chromium.launch();
  const unknown = new Set();
  const mk = async (vp, mobile, dpr = 2) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile, colorScheme: 'light', locale: 'es-MX', timezoneId: 'America/Tijuana' });
    await ctx.addInitScript(() => {
      localStorage.setItem('timber_auth', JSON.stringify({ token: 'x.y.z', role: 'admin', tenantId: 't1', username: 'lupita', name: 'Lupita', email: 'lupita@example.com' }));
      localStorage.setItem('timber_ui_theme', 'light');
    });
    const p = await ctx.newPage();
    const noon = new Date(`${new Date().toISOString().slice(0, 10)}T20:42:00Z`);
    await p.clock.setFixedTime(noon).catch(() => {});
    p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
    await mock(p, unknown);
    return { ctx, p };
  };
  // Igual que el cajero: escribe en el buscador y Enter agrega el primero
  const add = async (p, query, qty = 1) => {
    const box = p.locator('input[placeholder*="Escanea"], input[placeholder*="Buscar"]').first();
    for (let i = 0; i < qty; i++) {
      await box.fill(query); await p.waitForTimeout(350);
      await box.press('Enter'); await p.waitForTimeout(250);
    }
  };
  const fill = async (p) => {
    await add(p, 'coca original 600', 2);
    await add(p, 'sabritas saladas');
    await add(p, 'pan blanco grande');
    await add(p, 'leche entera lala', 2);
    await add(p, 'gansito', 3);
  };

  // 1) Caja en PC (hero)
  let { ctx, p } = await mk({ width: 1440, height: 900 }, false);
  await p.goto(ORIGIN + '/pos'); await p.waitForTimeout(2500);
  await fill(p);
  await p.locator('input[type=search], .scan input, input[placeholder*="Escanea"]').first().fill('').catch(() => {});
  await p.mouse.move(5, 5); await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/caja-pc.png` });
  // 2) Cobro
  await p.keyboard.press('F12'); await p.waitForTimeout(800);
  const pay = p.locator('.dlg.pay input[type=number]').first();
  if (await pay.count()) { await pay.fill('300'); await p.waitForTimeout(400); }
  await p.screenshot({ path: `${OUT}/cobro-pc.png` });
  await ctx.close();

  // 3) Caja en celular
  ({ ctx, p } = await mk({ width: 390, height: 844 }, true, 3));
  await p.goto(ORIGIN + '/pos'); await p.waitForTimeout(2500);
  await add(p, 'coca original 600', 2); await add(p, 'gansito'); await add(p, 'sabritas saladas');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/caja-movil.png` });
  await ctx.close();

  // 4) Resumen del día
  ({ ctx, p } = await mk({ width: 1440, height: 900 }, false));
  await p.goto(ORIGIN + '/dashboard'); await p.waitForTimeout(3000);
  await p.screenshot({ path: `${OUT}/resumen-pc.png` });
  await ctx.close();

  // 5) Productos
  ({ ctx, p } = await mk({ width: 1440, height: 900 }, false));
  await p.goto(ORIGIN + '/products'); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/productos-pc.png` });
  await ctx.close();

  console.log('sin simular:', [...unknown].join(', ') || 'ninguno');
  await b.close();
})();

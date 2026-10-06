/**
 * Prueba de humo de punta a punta contra la API corriendo (con PostgreSQL detrás).
 *   API_URL=http://localhost:8081 node scripts/smoke-pg.js
 * Registra una tienda, crea productos, abre caja, cobra, cancela y cierra. Sale con código 1 si algo falla.
 */
const base = (process.env.API_URL || 'http://localhost:8081').replace(/\/$/, '');
const stamp = Date.now().toString(36);
let token = '';

async function call(method, path, body, expect = 200) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  const ok = Array.isArray(expect) ? expect.includes(res.status) : res.status === expect;
  console.log(`${ok ? '✔' : '✘'} ${method} ${path} → ${res.status}`);
  if (!ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return data;
}

function check(cond, msg) {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) throw new Error(msg);
}

(async () => {
  await call('GET', '/health');
  const email = `smoke-${stamp}@example.com`;
  const password = 'Abarrotes-Prueba-2026!x';
  await call('POST', '/usuarios/register', {
    name: 'Ana', lastName: 'Prueba', email, username: `smoke${stamp}`, password, cellphone: '5512345678', businessName: 'Abarrotes Humo',
  }, [200, 201]);
  const login = await call('POST', '/usuarios/login', { data: email, password });
  token = login.token;
  check(Boolean(token), 'login devuelve token');
  const me = await call('GET', '/usuarios/me');
  check(Boolean(me.tenantId || me.user?.tenantId || me.id), 'perfil del usuario');

  await call('GET', '/settings');
  const settings = await call('GET', '/settings');
  await call('PUT', '/settings', { businessName: settings.businessName || 'Abarrotes Humo', businessType: 'abarrotes', inventoryEnabled: true });
  const menu = await call('POST', '/menus', { name: 'Bebidas' }, [200, 201]);
  const coca = await call('POST', '/foods', { name: 'Coca 600', price: 18, cost: 12, menuId: menu.id, barcode: `75${stamp}`, stock: 10 }, [200, 201]);
  await call('POST', '/foods', { name: 'Sabritas', price: 20, menuId: menu.id, stock: 2, lowStockThreshold: 5 }, [200, 201]);
  const foods = await call('GET', '/foods');
  check(foods.length === 2, `2 productos (${foods.length})`);
  const found = await call('GET', `/foods/lookup?code=75${stamp}`);
  check(found && (found.id === coca.id || found.matches?.length), 'búsqueda por código');
  const low = await call('GET', '/foods/low-stock');
  check(low.some((f) => f.name === 'Sabritas'), 'Sabritas con poco stock');
  const search = await call('GET', '/foods/search?q=coca');
  check(search.some((f) => f.name === 'Coca 600'), 'búsqueda por nombre');
  await call('PUT', `/foods/${coca.id}`, { price: 19 });

  await call('POST', '/cash/session/open', { openingFloat: 500 }, [200, 201]);
  const sale = {
    clientSaleId: `venta-${stamp}-1`,
    items: [{ foodId: coca.id, name: 'Coca 600', price: 19, quantity: 2, priceIncludesTax: true }],
    taxRate: 16,
    paymentMethod: 'cash',
    cashReceived: 50,
  };
  const order = await call('POST', '/orders/sale', sale);
  check(order.paymentStatus === 'paid', 'venta cobrada');
  check(Number(order.total) === 38, `total 38 (${order.total})`);
  const again = await call('POST', '/orders/sale', sale);
  check(again.id === order.id, 'reenviar la misma venta no la duplica');
  const after = await call('GET', `/foods/${coca.id}`);
  check(Number(after.stock) === 8, `la venta descuenta 2 de 10 (${after.stock})`);

  const today = new Date().toISOString().slice(0, 10);
  const report = await call('GET', `/orders/report/summary?from=${today}&to=${today}`);
  check(report != null, 'resumen de ventas');
  const list = await call('GET', '/orders');
  check(Array.isArray(list) ? list.length >= 1 : true, 'lista de ventas');
  await call('PUT', `/orders/${order.id}/void`, {});
  const restored = await call('GET', `/foods/${coca.id}`);
  check(Number(restored.stock) === 10, `cancelar regresa las existencias (${restored.stock})`);
  // Sin existencias suficientes se rechaza
  await call('POST', '/orders/sale', { ...sale, clientSaleId: `venta-${stamp}-2`, items: [{ ...sale.items[0], quantity: 99 }], cashReceived: 5000 }, 409);
  const cash = await call('GET', '/cash/session');
  check(cash.open, 'caja abierta');
  await call('POST', '/cash/session/close', { countedCash: 500 });
  await call('GET', '/billing/status');

  // Panel de plataforma (si se creó el admin con scripts/create-platform-admin.js)
  if (process.env.PLATFORM_ADMIN_PASSWORD) {
    const totp = require('../utils/totp');
    token = '';
    const first = await call('POST', '/usuarios/login', { data: process.env.PLATFORM_ADMIN_EMAIL, password: process.env.PLATFORM_ADMIN_PASSWORD });
    let session = first;
    if (first.mfaSetupRequired) {
      const { secret } = await call('POST', '/usuarios/mfa/setup', { mfaToken: first.mfaToken });
      session = await call('POST', '/usuarios/mfa/enable', { mfaToken: first.mfaToken, code: totp.codeAt(secret, totp.stepAt()) });
    }
    token = session.token;
    check(Boolean(token), 'plataforma: sesión con 2FA');
    const overview = await call('GET', '/platform/overview');
    check(overview != null, 'plataforma: resumen');
    const tenants = await call('GET', '/platform/tenants');
    const rows = Array.isArray(tenants) ? tenants : tenants.items || tenants.tenants || [];
    check(rows.length >= 1, `plataforma: ${rows.length} tiendas`);
    const tid = rows[0].id || rows[0]._id;
    await call('GET', `/platform/tenants/${tid}`);
    await call('GET', `/platform/tenants/${tid}/activity`);
    await call('GET', '/platform/report');
    await call('GET', '/platform/activity');
    await call('GET', '/platform/staff');
    await call('GET', '/platform/support');
    await call('GET', '/platform/referrers');
  }
  console.log('\nTodo bien: la API funciona sobre PostgreSQL.');
})().catch((err) => {
  console.error('\nFALLÓ:', err.message);
  process.exit(1);
});

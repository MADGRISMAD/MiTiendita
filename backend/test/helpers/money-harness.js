/**
 * Arnés para probar de punta a punta los endpoints de dinero (cobrar, anular, devolver, caja) sin MongoDB:
 * reemplaza `database/mongodb.js` y `database/credit.db.js` por una base en memoria y monta los controladores
 * reales en un Express de prueba. Debe cargarse ANTES de requerir cualquier controlador.
 */
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { reserveSaleStock } = require('../../services/sale-stock.service');

const T = 'tenant1';
let nextId = 1;
const newId = () => String(nextId++).padStart(24, '0');
const clone = (v) => (v == null ? v : structuredClone(v));

// Los controladores guardan la referencia a la base al cargarse: el mundo es uno solo y se reinicia en el lugar.
const w = { orders: new Map(), sessions: new Map(), log: [], foods: new Map(), settings: {} };

function reset({ inventory = false, foods = [] } = {}) {
  w.orders.clear();
  w.sessions.clear();
  w.log.length = 0;
  w.foods.clear();
  w.settings = { tenantId: T, inventoryEnabled: inventory, timezone: 'America/Tijuana' };
  for (const f of foods) w.foods.set(f.id, { stock: 0, ...f });
}

function createWorld() {

  // Colección de productos mínima para el servicio real de existencias (ver sale-stock.test.js)
  const foodsCollection = {
    async findOne(filter) { return clone(w.foods.get(filter._id)) || null; },
    async findOneAndUpdate(filter, update) {
      const f = w.foods.get(filter._id);
      if (!f || (filter.stock && !(typeof f.stock === 'number' && f.stock >= filter.stock.$gte))) return null;
      f.stock = Number((f.stock + update.$inc.stock).toFixed(3));
      return clone(f);
    },
    async updateOne(filter, update) { const f = w.foods.get(filter._id); if (f) f.stock = Number((f.stock + update.$inc.stock).toFixed(3)); },
  };

  const db = {
    async GetSettings() { return clone(w.settings); },
    async CreateOrder(payload) {
      if (payload.clientSaleId && [...w.orders.values()].some((o) => o.clientSaleId === payload.clientSaleId)) {
        const e = new Error('dup'); e.code = 11000; throw e;
      }
      const o = { ...clone(payload), id: newId() };
      w.orders.set(o.id, o);
      return clone(o);
    },
    async GetOrderById(id) { return clone(w.orders.get(id)) || null; },
    async GetOrderByClientSaleId(csid) { return clone([...w.orders.values()].find((o) => o.clientSaleId === csid)) || null; },
    async UpdateOrder(id, data) { const o = w.orders.get(id); if (!o) return null; Object.assign(o, clone(data)); return clone(o); },
    async DeleteOrder(id) { w.orders.delete(id); return { deletedCount: 1 }; },
    async GetOrdersByCashSession(sid) { return [...w.orders.values()].filter((o) => o.cashSessionId === sid).map(clone); },
    async ApplyOrderReturn(id, _t, expectedTotal, set, entry) {
      const o = w.orders.get(id);
      if (!o || o.paymentStatus !== 'paid' || o.total !== expectedTotal) return null;
      Object.assign(o, clone(set));
      o.returns = [...(o.returns || []), clone(entry)];
      return clone(o);
    },
    async GetOpenCashSession() { return clone([...w.sessions.values()].find((s) => s.status === 'open')) || null; },
    async GetCashSessionById(id) { return clone(w.sessions.get(id)) || null; },
    async CreateCashSession(data) { const s = { ...clone(data), id: newId() }; w.sessions.set(s.id, s); return clone(s); },
    async UpdateCashSession(id, data) { const s = w.sessions.get(id); Object.assign(s, clone(data)); return clone(s); },
    async CreateActivityLog(entry) { w.log.push(clone(entry)); return entry; },
    async GetFoodById(id) { return clone(w.foods.get(id)) || null; },
    async GetCustomerById() { return null; },
    async ReserveSaleStock(items, _t, opts) { return reserveSaleStock(foodsCollection, (id) => ({ _id: id }), items, opts); },
    async ConsumeSaleLots() { return []; },
    async RestoreSaleStock(id, qty) { const f = w.foods.get(id); if (f) f.stock = Number((f.stock + qty).toFixed(3)); },
  };
  const creditDb = { async paymentsBySession() { return []; }, async getCustomer() { return null; } };
  return { db, creditDb };
}

let installed = null;

/** Instala la base falsa y devuelve el servidor de prueba con los controladores reales. */
async function start(options) {
  reset(options);
  if (!installed) {
    const world = createWorld();
    for (const [file, exports] of [['database/mongodb.js', world.db], ['database/credit.db.js', world.creditDb]]) {
      const full = path.join(__dirname, '../..', file);
      require.cache[full] = { id: full, filename: full, loaded: true, exports, children: [], paths: [] };
    }
    installed = { orders: require('../../controllers/orders.controller'), cash: require('../../controllers/cash.controller') };
  }
  const { orders, cash } = installed;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const role = req.get('x-role') || 'cashier';
    req.user = { username: req.get('x-user') || 'caja1', role };
    req.tenantId = T;
    req.tenant = { plan: 'pro' };
    next();
  });
  app.post('/orders/sale', orders.sale);
  app.post('/orders/:id/return', orders.returnItems);
  app.put('/orders/:id/void', orders.voidSale);
  app.post('/cash/open', cash.open);
  app.post('/cash/close', cash.close);

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  function call(method, url, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request(
        { port, method, path: url, headers: { 'content-type': 'application/json', ...(data ? { 'content-length': Buffer.byteLength(data) } : {}), ...headers } },
        (res) => {
          let text = '';
          res.on('data', (c) => (text += c));
          res.on('end', () => {
            let json = null;
            try { json = JSON.parse(text); } catch { /* texto plano */ }
            resolve({ status: res.statusCode, body: json ?? text });
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
  return { w, call, stop: () => new Promise((r) => server.close(r)) };
}

/** Cuerpo de una venta de prueba: precios con IVA incluido, efectivo exacto. */
function saleBody(items, extra = {}) {
  const total = items.reduce((a, i) => a + i.price * i.quantity, 0);
  return {
    clientSaleId: extra.clientSaleId || `sale-${Math.random().toString(36).slice(2, 12)}`,
    taxRate: 0.16,
    paymentMethod: 'cash',
    cashReceived: total,
    items: items.map((i) => ({ foodId: i.foodId || null, name: i.name || 'Producto', price: i.price, quantity: i.quantity, priceIncludesTax: true })),
    ...extra,
  };
}

module.exports = { start, saleBody, T };

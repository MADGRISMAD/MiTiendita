const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { ObjectId } = require('../database/sqlite-store');
const { stripCosts, hideCostsFromCashiers } = require('../middleware/cost-guard');

const food = { id: 'f1', name: 'Coca', price: 20, cost: 12, stock: 5 };
const order = { id: 'o1', total: 40, items: [{ name: 'Coca', price: 20, quantity: 2, unitCost: 12 }], createdAt: new Date('2026-10-14T10:00:00Z') };

test('stripCosts quita cost y unitCost a cualquier profundidad y deja lo demás', () => {
  assert.deepEqual(stripCosts(food), { id: 'f1', name: 'Coca', price: 20, stock: 5 });
  const clean = stripCosts([order]);
  assert.deepEqual(clean[0].items, [{ name: 'Coca', price: 20, quantity: 2 }]);
  assert.equal(clean[0].total, 40);
  assert.ok(clean[0].createdAt instanceof Date);
  const id = new ObjectId();
  assert.equal(stripCosts({ _id: id })._id, id);
  assert.equal(stripCosts(null), null);
  assert.ok('cost' in food, 'no modifica el original');
});

async function call(role) {
  const app = express();
  app.use((req, _res, next) => { req.user = role ? { role } : undefined; next(); });
  app.use(hideCostsFromCashiers);
  app.get('/foods', (_req, res) => res.status(200).json([food]));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    return await new Promise((resolve, reject) => {
      http.get({ port: server.address().port, path: '/foods' }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve(JSON.parse(b)));
      }).on('error', reject);
    });
  } finally {
    server.close();
  }
}

test('el cajero no recibe costos por la API; el administrador sí', async () => {
  assert.equal('cost' in (await call('cashier'))[0], false);
  assert.equal((await call('admin'))[0].cost, 12);
});

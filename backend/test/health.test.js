const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const healthRouter = require('../routers/health.router');

function get(server, path) {
  return new Promise((resolve, reject) => {
    http.get({ port: server.address().port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
    }).on('error', reject);
  });
}

async function withServer(db, fn) {
  const app = express();
  app.use('/health', healthRouter(db));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try { await fn(server); } finally { server.close(); }
}

test('/health responde 200 sin tocar la base', async () => {
  await withServer({ ensureConnection: async () => { throw new Error('no debe llamarse'); }, Ping: async () => {} }, async (s) => {
    const r = await get(s, '/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  });
});

test('/health/ready: 200 si la base contesta y 503 si no', async () => {
  await withServer({ ensureConnection: async () => {}, Ping: async () => {} }, async (s) => {
    assert.deepEqual((await get(s, '/health/ready')).body, { ok: true, db: 'up' });
  });
  await withServer({ ensureConnection: async () => {}, Ping: async () => { throw new Error('caída'); } }, async (s) => {
    const r = await get(s, '/health/ready');
    assert.equal(r.status, 503);
    assert.deepEqual(r.body, { ok: false, db: 'down' });
  });
});

test('/health/jobs: 200 con las tareas al día y 503 si una dejó de correr', async () => {
  const fresh = new Date();
  const ok = { ensureConnection: async () => {}, Ping: async () => {}, ListJobRuns: async () => [{ name: 'resumen-diario', lastRunAt: fresh, lastOk: true }] };
  await withServer(ok, async (s) => assert.equal((await get(s, '/health/jobs')).status, 200));
  const old = { ...ok, ListJobRuns: async () => [{ name: 'resumen-diario', lastRunAt: new Date(Date.now() - 5 * 3600 * 1000), lastOk: true }] };
  await withServer(old, async (s) => assert.equal((await get(s, '/health/jobs')).status, 503));
});

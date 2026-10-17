const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const { refuseBranch } = require('../middleware/refuse-branch');

const tenants = {
  matriz: { id: 'matriz', name: 'Abarrotes Lupita' },
  suc1: { id: 'suc1', name: 'Lupita Centro', isBranch: true, matrixTenantId: 'matriz' },
};

async function call(id) {
  const app = express();
  const db = { GetTenantById: async (tid) => tenants[tid] || null };
  app.post('/tenants/:id/suspend', refuseBranch(db), (_req, res) => res.status(200).json({ ok: true }));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({ port: server.address().port, method: 'POST', path: `/tenants/${id}/suspend` }, (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ status: res.statusCode, body: b }));
      });
      req.on('error', reject);
      req.end();
    });
  } finally {
    server.close();
  }
}

test('una matriz sí se modifica; una sucursal no (409); una tienda inexistente pasa al controlador', async () => {
  assert.equal((await call('matriz')).status, 200);
  const branch = await call('suc1');
  assert.equal(branch.status, 409);
  assert.match(branch.body, /sucursal/);
  assert.equal((await call('nada')).status, 200); // el controlador responde su propio 404
});

test('todas las rutas del panel que modifican una tienda por id llevan el bloqueo de sucursales', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routers/platform.router.js'), 'utf8');
  const writes = src.split('\n').filter((l) => /router\.(patch|put|post)\('\/tenants\/:id/.test(l) && !/\/mail'/.test(l));
  assert.ok(writes.length >= 6, 'se esperaban al menos 6 rutas de escritura');
  for (const line of writes) assert.match(line, /notBranch/, line.trim());
});

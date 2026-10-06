process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
// Detrás de Vercel la IP del cliente viene en x-vercel-forwarded-for: es la que usan los límites por IP.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

test('la IP del cliente sale de CLIENT_IP_HEADERS', async () => {
  process.env.CLIENT_IP_HEADERS = 'x-vercel-forwarded-for,x-real-ip';
  process.env.VERCEL = '1'; // no abre puerto
  const dbPath = require.resolve(path.join(__dirname, '../database/db'));
  const noop = async () => true;
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: new Proxy({ ensureConnection: noop, Ping: noop, getCollection: () => null }, { get: (t, k) => t[k] || noop }) };
  const express = require('express');
  const app = require('../app');
  const probe = express();
  probe.use(app);
  const seen = [];
  app.get('/__ip', (req, res) => {
    seen.push(req.ip);
    res.json({ ip: req.ip });
  });
  const server = probe.listen(0);
  const port = server.address().port;
  try {
    const r1 = await fetch(`http://127.0.0.1:${port}/__ip`, { headers: { 'x-vercel-forwarded-for': '201.1.2.3' } });
    assert.equal((await r1.json()).ip, '201.1.2.3');
    const r2 = await fetch(`http://127.0.0.1:${port}/__ip`, { headers: { 'x-real-ip': '187.4.5.6, 10.0.0.1' } });
    assert.equal((await r2.json()).ip, '187.4.5.6');
    const r3 = await fetch(`http://127.0.0.1:${port}/__ip`);
    assert.ok((await r3.json()).ip, 'sin cabecera usa la IP de la conexión');
  } finally {
    server.close();
  }
});

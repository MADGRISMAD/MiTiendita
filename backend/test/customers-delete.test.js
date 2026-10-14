const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// La ruta se revisa leyendo el router: probarla por HTTP exige la base de datos.
const src = fs.readFileSync(path.join(__dirname, '../routers/customers.router.js'), 'utf8');

test('eliminar un cliente es solo del administrador y queda en la bitácora', () => {
  const block = src.slice(src.indexOf("router.delete("));
  assert.match(block, /requireRoles\('admin'\)/);
  assert.doesNotMatch(block.slice(0, block.indexOf('async (req, res)')), /cashier/);
  assert.match(block, /customer_deleted/);
});

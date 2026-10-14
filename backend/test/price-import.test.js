const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let m;
test.before(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/priceImport.js'), 'utf8');
  m = await import(`data:text/javascript,${encodeURIComponent(src)}`);
});

const foods = [
  { id: 'a', name: 'Coca-Cola 600 ml', barcode: '7501055300075' },
  { id: 'b', name: 'Sabritas Original', barcode: '' },
  { id: 'c', name: 'Leche Lala 1 L', sku: 'LALA1' },
];

test('CSV: coma o punto y coma, comillas y BOM', () => {
  assert.deepEqual(m.parseCsv('﻿código,precio\n123,"1,200.50"\n'), [['código', 'precio'], ['123', '1,200.50']]);
  assert.deepEqual(m.parseCsv('nombre;precio\r\nPan;12,5\r\n'), [['nombre', 'precio'], ['Pan', '12,5']]);
});

test('precios escritos de varias formas', () => {
  assert.equal(m.parseMoney('$1,234.50'), 1234.5);
  assert.equal(m.parseMoney('18,50'), 18.5);
  assert.equal(m.parseMoney('18.5'), 18.5);
  assert.ok(Number.isNaN(m.parseMoney('gratis')));
  assert.ok(Number.isNaN(m.parseMoney('')));
});

test('cruza por código y luego por nombre (sin acentos ni mayúsculas); reporta lo que no entró', () => {
  const rows = m.parseCsv('Código,Producto,Precio,Costo\n7501055300075,,18,12\n,sabritas original,17.5,\nLALA1,x,0,\n,Galletas raras,10,\n,Leche lala 1 l,26,20');
  const r = m.matchPriceRows(rows, foods);
  assert.deepEqual(r.matches, [
    { id: 'a', price: 18, cost: 12 },
    { id: 'b', price: 17.5, cost: undefined },
    { id: 'c', price: 26, cost: 20 },
  ]);
  assert.deepEqual(r.unmatched, ['Galletas raras']);
  assert.deepEqual(r.invalid, ['x']);
});

test('sin columnas reconocibles o vacío: error claro', () => {
  assert.match(m.matchPriceRows(m.parseCsv('a,b\n1,2'), foods).error, /Faltan columnas/);
  assert.match(m.matchPriceRows([], foods).error, /vacío/);
});

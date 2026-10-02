const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let esc;
test.before(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/escpos.js'), 'utf8');
  esc = await import(`data:text/javascript,${encodeURIComponent(src)}`);
});

const has = (bytes, seq) => {
  const s = Buffer.from(bytes).toString('latin1');
  return s.includes(Buffer.from(seq).toString('latin1'));
};

const SAMPLE = {
  shop: 'Abarrotes Doña Lupe',
  kind: 'Abarrotes · Minisúper',
  address: 'Calle 5 de Mayo 123, Centro',
  phone: '222 123 4567',
  folio: 'A1B2C3',
  dateText: 'Lun 28 sep 2026 15:59',
  cashier: 'lupe',
  countText: '3 artículos',
  items: [
    { name: 'Refresco de cola 600 ml retornable con nombre larguísimo', notes: '', qtyText: '2', unit: 1740, amount: 3480 },
    { name: 'Pan dulce', notes: 'Conchas', qtyText: '1', unit: 11.6, amount: 11.6 },
  ],
  subtotal: 3491.6,
  discountPercentText: '10%',
  discountAmount: 349.16,
  cardExtraTax: 0,
  deliveryFee: 0,
  total: 3142.44,
  taxNote: 'Precios con IVA incluido. Base $2,709.00 + IVA 16% $433.44',
  paid: true,
  methodText: 'Efectivo',
  methodDetail: [['Recibido', '$3,200.00']],
  change: 57.56,
  saved: 349.16,
  stamp: 'PAGADO',
  thanks: '¡Gracias, vecino! Vuelva pronto.',
  note: 'Conserve su ticket.',
  invoiceUrl: 'https://mitiendita.mx/factura/abc123',
};

test('acentos y ñ en PC850; lo demás se aproxima', () => {
  assert.deepEqual(esc.encodeText('ñÑáé¿¡'), [0xa4, 0xa5, 0xa0, 0x82, 0xa8, 0xad]);
  assert.equal(Buffer.from(esc.encodeText('2 × $5 — ★')).toString('latin1'), '2 x $5 - *');
  assert.deepEqual(esc.encodeText('ç'), [0x63]);
});

test('ticket 80 mm: inicia, imprime totales, QR, abre cajón y corta', () => {
  const bytes = esc.buildReceipt(SAMPLE, { cols: 48, openDrawer: true });
  assert.ok(has(bytes, [0x1b, 0x40]), 'ESC @');
  assert.ok(has(bytes, [0x1b, 0x74, 0x02]), 'página PC850');
  assert.ok(has(bytes, [0x1b, 0x70, 0x00]), 'pulso de cajón');
  assert.ok(has(bytes, [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]), 'imprime QR');
  assert.ok(has(bytes, [0x1d, 0x56, 0x42]), 'corte');
  const text = Buffer.from(bytes).toString('latin1');
  for (const s of ['$3,480.00', '$3,142.44', '-$349.16', 'Su cambio', '$57.56', 'A1B2C3', 'mitiendita.mx/factura/abc123']) {
    assert.ok(text.includes(s), s);
  }
});

test('sin cajón ni factura cuando no aplica', () => {
  const bytes = esc.buildReceipt({ ...SAMPLE, invoiceUrl: '' }, { cols: 32 });
  assert.ok(!has(bytes, [0x1b, 0x70, 0x00]));
  assert.ok(!has(bytes, [0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]));
});

test('ningún renglón se pasa del ancho del papel', () => {
  for (const cols of [32, 48]) {
    for (const l of esc.leftRight(SAMPLE.items[0].name, '$3,480.00', cols)) {
      assert.ok(esc.encodeText(l).length <= cols, `${cols}: ${l}`);
    }
    for (const l of esc.wrap(SAMPLE.address + ' ' + 'x'.repeat(60), cols)) {
      assert.ok(esc.encodeText(l).length <= cols);
    }
  }
});

test('página de prueba', () => {
  const bytes = esc.buildTestPage({ cols: 32, openDrawer: true });
  assert.ok(Buffer.from(bytes).toString('latin1').includes('PRUEBA'));
  assert.ok(has(bytes, [0x1b, 0x70, 0x00]));
});

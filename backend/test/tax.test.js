const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const backendTax = require('../utils/tax');

// frontend/src/tax.ts no lleva tipos: se carga como módulo JS para probar que da lo mismo que el backend
let frontendTax;
test.before(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/tax.ts'), 'utf8');
  frontendTax = await import(`data:text/javascript,${encodeURIComponent(src)}`);
});

const r2 = (n) => Math.round(n * 100) / 100;

function checkInvariants(t) {
  assert.equal(r2(t.subtotal - t.discountAmount), t.payable, 'subtotal − descuento = a pagar');
  assert.equal(r2(t.net + t.tax), t.payable, 'base + IVA = a pagar');
  assert.equal(r2(t.payable + t.cardExtraTax), t.total, 'a pagar + comisión = total');
}

const CASES = {
  'sin descuento, neto': [[{ price: 10, quantity: 1 }], {}],
  'con descuento, neto': [[{ price: 10, quantity: 1 }], { discountPercent: 10 }],
  'con descuento, bruto': [[{ price: 11.6, quantity: 1, priceIncludesTax: true }], { discountPercent: 10 }],
  'mixto con descuento': [
    [
      { price: 1500, quantity: 2 },
      { price: 23.5, quantity: 3, priceIncludesTax: true },
      { price: 0.99, quantity: 7 },
      { price: 89.9, quantity: 1.235, priceIncludesTax: true },
    ],
    { discountPercent: 7.5 },
  ],
  'comisión tarjeta': [[{ price: 10, quantity: 1 }], { discountPercent: 10, cardExtraIva: true, cardFeeRate: 0.04 }],
  'IVA 0%': [[{ price: 10, quantity: 3 }], { taxRate: 0, discountPercent: 15 }],
};

test('neto $10 con 10% de descuento cuadra al centavo (10.44)', () => {
  const t = backendTax.cartTotals([{ price: 10, quantity: 1 }], { discountPercent: 10 });
  assert.equal(t.subtotal, 11.6);
  assert.equal(t.discountAmount, 1.16);
  assert.equal(t.total, 10.44);
  assert.equal(t.tax, 1.44);
  assert.equal(t.net, 9);
  checkInvariants(t);
});

test('bruto $11.60 con 10% de descuento da lo mismo que neto $10', () => {
  const t = backendTax.cartTotals([{ price: 11.6, quantity: 1, priceIncludesTax: true }], { discountPercent: 10 });
  assert.equal(t.total, 10.44);
  assert.equal(t.tax, 1.44);
  checkInvariants(t);
});

test('sin descuento: el total es la suma de renglones', () => {
  const t = backendTax.cartTotals([{ price: 10, quantity: 1 }]);
  assert.equal(t.discountAmount, 0);
  assert.equal(t.total, 11.6);
  assert.equal(t.tax, 1.6);
  checkInvariants(t);
});

test('c/u × cantidad = importe del renglón (2 × 1,500 neto)', () => {
  const b = backendTax.lineBreakdown(1500, 2, false, 0.16);
  assert.equal(b.unitGross, 1740);
  assert.equal(b.gross, 3480);
  const odd = backendTax.lineBreakdown(0.99, 7, false, 0.16);
  assert.equal(odd.gross, r2(odd.unitGross * 7));
});

test('comisión por tarjeta se suma sobre lo que se paga', () => {
  const t = backendTax.cartTotals([{ price: 10, quantity: 1 }], { discountPercent: 10, cardExtraIva: true, cardFeeRate: 0.04 });
  assert.equal(t.cardExtraTax, 0.42);
  assert.equal(t.total, 10.86);
  checkInvariants(t);
});

test('todos los casos cuadran y frontend = backend', () => {
  for (const [name, [items, opts]] of Object.entries(CASES)) {
    const back = backendTax.cartTotals(items, opts);
    const front = frontendTax.cartTotals(items, opts);
    checkInvariants(back);
    assert.deepEqual(front, back, name);
    for (const item of items) {
      const lb = backendTax.lineBreakdown(item.price, item.quantity, item.priceIncludesTax, opts.taxRate ?? 0.16);
      const lf = frontendTax.lineBreakdown(item.price, item.quantity, item.priceIncludesTax, opts.taxRate ?? 0.16);
      assert.deepEqual(lf, lb, `${name}: renglón ${item.price}`);
    }
  }
});

test('round2 no se equivoca con flotantes', () => {
  assert.equal(backendTax.round2(1.005), 1.01);
  assert.equal(backendTax.round2(0.1 + 0.2), 0.3);
  assert.equal(frontendTax.round2(1.005), 1.01);
});

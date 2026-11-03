const test = require('node:test');
const assert = require('node:assert/strict');
const match = require('../services/product-match');

test('dígito verificador: EAN-13, EAN-8, UPC-A, longitud rara, claves propias y vacíos', () => {
  assert.equal(match.gtinStatus('7501055300075'), 'ok');
  assert.equal(match.gtinStatus('7501055300076'), 'digit');
  assert.equal(match.gtinStatus('96385074'), 'ok'); // EAN-8
  assert.equal(match.gtinStatus('036000291452'), 'ok'); // UPC-A
  assert.equal(match.gtinStatus('75010554'), 'digit');
  assert.equal(match.gtinStatus('123456789'), 'length');
  assert.equal(match.gtinStatus('PLU-3001'), 'internal');
  assert.equal(match.gtinStatus(''), 'missing');
});

test('comparación de nombres: ignora acentos, medidas y palabras sueltas; detecta tamaño distinto', () => {
  assert.equal(match.sameProduct('Coca-Cola Original 600 ml', 'Coca-Cola Refresco de cola 355 ml'), true);
  assert.equal(match.sameProduct('Jabón Zote 400 g', 'Cable USB-C 1 m'), false);
  assert.equal(match.sameProduct('Galletas Marías Gamesa', 'Gamesa Galletas Marias'), true);
  assert.equal(match.sizeDiffers('Coca-Cola 600 ml', 'Coca-Cola 355 ml'), true);
  assert.equal(match.sizeDiffers('Coca-Cola 600 ml', 'Coca-Cola'), false);
});

test('dígito verificador que le toca a un código', () => {
  assert.equal(match.checkDigitOf('750105530007'), 5);
  assert.equal(match.checkDigitOf('7501055'), 3);
});

test('comparación estricta: una variante o una medida distinta no cuenta como el mismo producto', () => {
  assert.equal(match.sameProduct('Coca-Cola Original 600 ml', 'Coca-Cola Zero 600 ml'), false);
  assert.equal(match.sameProduct('Coca-Cola 600 ml', 'Coca-Cola Light'), false);
  assert.equal(match.sameProduct('Sabritas Sal 45 g', 'Sabritas'), true);
  assert.equal(match.sameProduct('Sabritas Sal 45 g', 'Gamesa Marías'), false);
  assert.equal(match.sameProduct('Coca-Cola Original 600 ml', 'Coca'), false, 'una sola palabra de coincidencia en un nombre largo no basta');
  // medidas pegadas, con decimales y en otra unidad
  assert.equal(match.sizeDiffers('Coca-Cola 600ml', 'Coca-Cola 600 ml'), false);
  assert.equal(match.sizeDiffers('Azúcar 1 kg', 'Azúcar 1000 g'), false);
  assert.equal(match.sizeDiffers('Azúcar 1 kg', 'Azúcar 500 g'), true);
  assert.equal(match.sizeDiffers('Aceite 1,5 l', 'Aceite 1500 ml'), false);
  assert.equal(match.sizeDiffers('Donitas 7p 52.5g', 'Donitas 4p 52.5g'), true);
});

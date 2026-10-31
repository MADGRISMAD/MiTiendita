const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanImages } = require('../controllers/ai.controller');

const img = (n = 10) => ({ imageBase64: 'A'.repeat(n), mimeType: 'image/jpeg' });

test('acepta varias fotos de una misma nota', () => {
  assert.equal(cleanImages({ images: [img(), img(), img()] }).length, 3);
});

test('sigue aceptando la foto única de antes', () => {
  const out = cleanImages({ imageBase64: 'AAAA', mimeType: 'image/png' });
  assert.deepEqual(out, [{ imageBase64: 'AAAA', mimeType: 'image/png' }]);
});

test('sin fotos devuelve lista vacía', () => {
  assert.deepEqual(cleanImages({ text: 'hola' }), []);
});

test('rechaza más de 4 fotos y tipos no permitidos', () => {
  assert.throws(() => cleanImages({ images: [img(), img(), img(), img(), img()] }), /Máximo 4/);
  assert.throws(() => cleanImages({ images: [{ imageBase64: 'AAAA', mimeType: 'application/pdf' }] }), /JPG, PNG o WebP/);
});

test('rechaza si el total es demasiado pesado', () => {
  const big = () => img(4_000_000);
  assert.throws(() => cleanImages({ images: [big(), big(), big()] }), /pesan demasiado/);
});

const { flagRepeats } = require('../services/gemini.service');
const row = (name, photo, extra = {}) => ({ name, photo, packs: 1, packSize: 1, cost: 0, price: 0, ...extra });

test('un producto igual en dos fotos se cuenta una vez y se avisa', () => {
  const out = flagRepeats([row('Coca Cola 600 ml', 1, { packs: 15 }), row('Sabritas', 1), row('coca cola 600ml', 2, { packs: 15 })]);
  assert.equal(out.items.length, 2);
  assert.deepEqual(out.repeats, [{ name: 'Coca Cola 600 ml', photos: [1, 2], packs: [15, 15], counted: 'once', differs: false }]);
});

test('el mismo producto en otra foto cuenta una vez aunque los datos varíen un poco', () => {
  const out = flagRepeats([row('Sabritas', 1, { packs: 8 }), row('Sabritas', 2, { packs: 3, packSize: 12 }), row('Sabritas', 3, { packs: 8 })]);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].packs, 8);
  assert.equal(out.repeats.length, 2);
  assert.equal(out.repeats[0].differs, true);
  assert.equal(out.repeats[1].differs, false);
});

test('misma presentación distinta dentro de la misma foto se deja en dos renglones', () => {
  const out = flagRepeats([row('Sabritas', 1, { packs: 8 }), row('Sabritas', 1, { packs: 3, packSize: 12 })]);
  assert.equal(out.items.length, 2);
  assert.equal(out.repeats[0].counted, 'both');
});

test('cuatro fotos de la misma nota dejan solo los productos de la nota', () => {
  const nota = (photo, drift = {}) => [row('Coca Cola 400 ml', photo, { packs: 2, cost: 100, ...drift }), row('Coca Cola 1.5 L', photo, { packs: 20 }), row('Coca Cola 3 L', photo, { packs: 4 })];
  const out = flagRepeats([...nota(1), ...nota(2), ...nota(3, { cost: 0 }), ...nota(4, { packs: 3 })]);
  assert.equal(out.items.length, 3);
});

test('el mismo renglón repetido en la misma foto se cuenta una vez', () => {
  const out = flagRepeats([row('Sabritas', 1), row('Sabritas', 1)]);
  assert.equal(out.items.length, 1);
  assert.equal(out.repeats[0].counted, 'once');
});

test('misma presentación con otra cantidad se suma en un solo renglón', () => {
  const out = flagRepeats([row('Coca Cola 600 ml', 1, { packs: 10 }), row('Coca Cola 600 ml', 1, { packs: 5 })]);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].packs, 15);
  assert.equal(out.repeats[0].counted, 'merged');
});

test('sin repetidos no avisa nada', () => {
  const out = flagRepeats([row('Sabritas', 1), row('Coca Cola 600 ml', 1), row('Jabón Zote', 1)]);
  assert.equal(out.items.length, 3);
  assert.deepEqual(out.repeats, []);
});

const gem = require('../services/gemini.service');
const inv = require('../services/magic-inventory.service');

test('"1 pet de 4" son 4 piezas y "2 pets de 6" son 12', () => {
  const a = gem.parseLooseLine('coca 3L 1 pet de 4');
  assert.deepEqual([a.name, a.packs, a.packSize], ['Coca Cola 3 L', 1, 4]);
  const b = gem.parseLooseLine('2 pets de 6 coca 2L');
  assert.deepEqual([b.name, b.packs, b.packSize], ['Coca Cola 2 L', 2, 6]);
  assert.equal(inv.enrichItem(b).stockIn, 12);
});

test('el importe del renglón manda sobre un costo mal leído', () => {
  // La IA puso el importe (300) en cost aunque son 3 pets: cada pet cuesta 100
  const e = inv.enrichItem({ name: 'Coca Cola 3 L pet', packs: 3, packSize: 4, cost: 300, lineTotal: 300 });
  assert.equal(e.lineCost, 100);
  assert.equal(e.cost, 25);
  assert.equal(e.cost * e.stockIn, 300);
  assert.equal(e.costFixed, true);
});

test('si cost y lineTotal cuadran no se toca nada', () => {
  const e = inv.enrichItem({ name: 'Sabritas', packs: 10, packSize: 1, cost: 12, lineTotal: 120 });
  assert.equal(e.cost, 12);
  assert.equal(e.costFixed, false);
});

test('reconoce PET6, PET 6, PED 6, TT4 y TT 4 como piezas por paquete', () => {
  const casos = [
    ['coca 3L PET6', 1, 6],
    ['coca 3L PET 6', 1, 6],
    ['coca 3L PED  6', 1, 6],
    ['Coca 600 TT4', 1, 4],
    ['Coca 600 TT 4', 1, 4],
    ['12 coca 600 tt 4', 12, 4],
    ['2 pets de 6 coca 2L', 2, 6],
  ];
  for (const [line, packs, packSize] of casos) {
    const r = gem.parseLooseLine(line);
    assert.deepEqual([r.packs, r.packSize], [packs, packSize], line);
  }
});

test('el renglón original manda sobre un nombre que la IA limpió', () => {
  const out = gem.parseItems(JSON.stringify({ items: [{ raw: 'COCA 600 TT4', name: 'Coca Cola 600 ml', packs: 5, packSize: 1, cost: 60 }] }));
  assert.equal(out[0].packSize, 4);
  assert.equal(out[0].packs, 5);
  assert.equal(inv.enrichItem(out[0]).stockIn, 20);
});

test('el nombre solo con PET6 también se entiende al meter la existencia', () => {
  assert.equal(inv.enrichItem({ name: 'Coca Cola 3 L PET6', packs: 2, packSize: 1 }).stockIn, 12);
});

const { reconcileLines, checkTotals } = require('../controllers/ai.controller');

test('si leer el monto como importe del renglón hace cuadrar la nota, se toma como importe', () => {
  const items = [
    { name: 'Sabritas', packs: 10, packSize: 1, cost: 120 }, // 120 es el importe, no el precio de una
    { name: 'Coca Cola 600 ml', packs: 5, packSize: 1, cost: 100 },
  ];
  const fixed = reconcileLines(items, { documentTotal: 220 });
  assert.equal(checkTotals(fixed, { documentTotal: 220 }).mismatch, false);
  // Sin total impreso no se toca nada
  assert.equal(reconcileLines(items, {}), items);
});

test('el subtotal impreso es contra lo que se compara, no el total con IVA', () => {
  const items = [{ name: 'Jabón', packs: 2, packSize: 1, cost: 50, lineTotal: 100 }];
  assert.equal(checkTotals(items, { documentTotal: 116, documentSubtotal: 100, documentTax: 16 }).mismatch, false);
  assert.equal(checkTotals(items, { documentTotal: 116, documentTax: 16 }).mismatch, false);
  const bad = checkTotals(items, { documentTotal: 300, documentSubtotal: 300 });
  assert.equal(bad.mismatch, true);
  assert.equal(bad.diff, -200);
  assert.equal(bad.lines[0].amount, 100);
});

test('cada renglón lleva la nota: renglón original, importe total y precio por unidad', () => {
  const e = inv.enrichItem({ raw: 'FRUTSI UVA 250 PET6', name: 'Frutsi Uva 250 ml', packs: 1, packSize: 6, cost: 0, lineTotal: 49.5 });
  assert.deepEqual(e.note, { raw: 'FRUTSI UVA 250 PET6', total: 49.5, unit: 49.5 });
  assert.equal(e.cost, 8.25);
  const m = inv.matchItems([{ raw: 'x', name: 'Producto raro', packs: 2, packSize: 1, cost: 10 }], []);
  assert.equal(m.unknown[0].note.total, 20);
});

test('un tamaño distinto no es el mismo producto (2 L contra 2.5 L, 1 L contra 1.25 L)', () => {
  assert.equal(inv.scoreName('Coca Cola 2 L', 'Coca-Cola Original NR 2.5 L'), 0);
  assert.equal(inv.scoreName('Coca Cola 1 L', 'Coca-Cola Original NR 1.25 L'), 0);
  assert.ok(inv.scoreName('Coca Cola 2 L', 'Coca-Cola Original 2 L') >= 0.55);
  assert.ok(inv.scoreName('Coca Cola 600 ml', 'Coca-Cola 600 ml NR') >= 0.55);
  assert.equal(inv.sizeOf('Jabón 1 kg').amount, 1000);
});

test('con código de la nota: mismo código = mismo producto aunque la IA lo lea con otro nombre; otro código = otro producto', () => {
  const r = (code, name, photo, extra = {}) => ({ code, name, photo, packs: 1, packSize: 24, cost: 0, price: 0, lineTotal: 256, ...extra });
  const out = flagRepeats([
    r('19', 'Coca Cola 2.5 L RP 8', 1, { packs: 4, packSize: 8, lineTotal: 1128.04 }),
    r('1220', 'Coca Cola 300 ml', 1),
    r('19', 'Coca-Cola 2.5L Retornable', 2, { packs: 4, packSize: 8, lineTotal: 1128.04 }),
    r('1220', 'Coca Cola 300ml PET', 2),
    r('2879', 'Santa Clara Choco 180 ml', 2),
    r('2880', 'Santa Clara Fresa 180 ml', 2),
  ]);
  assert.deepEqual(out.items.map((i) => i.code), ['19', '1220', '2879', '2880']);
  assert.equal(out.repeats.length, 2);
  const total = out.items.reduce((s, i) => s + i.lineTotal, 0);
  assert.equal(Math.round(total * 100) / 100, 1128.04 + 256 * 3);
});

test('"RP 8", "PET 24U" y "TT4" dan las piezas por caja', () => {
  const { parsePackNotation } = require('../utils/pack-notation');
  assert.equal(parsePackNotation('COCA-COLA 2.5L RP 8').packSize, 8);
  assert.equal(parsePackNotation('COCA COLA 450 ML PET 24U').packSize, 24);
  assert.equal(parsePackNotation('SANTA CLARA CHOCO 180ML TT4').packSize, 4);
  assert.equal(parsePackNotation('pasta la fina'), null);
});

test('factura de distribuidora: "N/M UNIDAD", "C/N" y "N PIEZAS" dan las piezas por caja; fracciones y fechas no', () => {
  const { parsePackNotation } = require('../utils/pack-notation');
  const piezas = (t) => parsePackNotation(t)?.packSize ?? null;
  assert.equal(piezas('CAFE NESCAFE CLASICO 16/42 GRS'), 16);
  assert.equal(piezas('SOPA KNORR LETRAS 12/95 GRS'), 12);
  assert.equal(piezas('HARINA DE MAIZ MASECA 10/1 KG'), 10);
  assert.equal(piezas('LIMPIADOR FABULOSO LAVANDA 12/1lt'), 12);
  assert.equal(piezas('FRIJOL BAYOS ISADORA (CAJA GDE) 24/430 GRS'), 24);
  assert.equal(piezas('PROMOCION SOPA RAMEN CAM/LIMM/HAB C/24'), 24);
  assert.equal(piezas('SALSA HABANERA ROJA CAJA C/24 PZ (CJA GRANDE)'), 24);
  assert.equal(piezas('CINCUENTA PIEZAS ENCENDEDOR REGULAR BIC (50 PIEZAS)'), 50);
  assert.equal(piezas('84 PIEZAS RASTRILLO EXHIBIDOR'), 84);
  assert.equal(piezas('TORNILLO 3/4'), null, 'una fracción de ferretería no son piezas');
  assert.equal(piezas('TUERCA 5/16'), null);
  assert.equal(piezas('HARINA 1 KG - Caducidad: 22/02/2027'), null, 'una fecha no son piezas');
});

test('nombre limpio: sin promociones, tipo de caja ni piezas por caja; deja lo que trae cada pieza', () => {
  const { cleanProductName: limpio } = require('../utils/product-name');
  assert.equal(limpio('PROMOCION SOPA RAMEN CAM/LIMM/HAB C/24'), 'SOPA RAMEN CAM/LIMM/HAB');
  assert.equal(limpio('CAFE NESCAFE CLASICO 16/42 GRS'), 'CAFE NESCAFE CLASICO 42 g');
  assert.equal(limpio('SALSA HABANERA ROJA CAJA C/24 PZ (CJA GRANDE)'), 'SALSA HABANERA ROJA');
  assert.equal(limpio('MOLE DONA MARIA (MEDIA CAJA)12/235 GRS'), 'MOLE DONA MARIA 235 g');
  assert.equal(limpio('FRIJOL REF. BAYOS ISADORA (CAJA GDE) 24/430 GRS'), 'FRIJOL REF. BAYOS ISADORA 430 g');
  assert.equal(limpio('CINCUENTA PIEZAS ENCENDEDOR REGULAR BIC (50 PIEZAS)'), 'ENCENDEDOR REGULAR BIC');
  assert.equal(limpio('84 PIEZAS RASTRILLO EXHIBIDOR'), 'RASTRILLO');
  assert.equal(limpio('PAPEL HIG. BIG FACIAL QUALITY (600+50 HD GRATIS) 8/6'), 'PAPEL HIG. BIG FACIAL QUALITY 8/6');
  assert.equal(limpio('HARINA DE MAIZ MASECA 10/1 KG'), 'HARINA DE MAIZ MASECA 1 kg');
  assert.equal(limpio('Gelatina oferta'), 'Gelatina');
  // lo que sí es del producto no se toca
  assert.equal(limpio('Coca Cola 600 ml'), 'Coca Cola 600 ml');
  assert.equal(limpio('Tornillo 3/4'), 'Tornillo 3/4');
  assert.equal(limpio('Promocional'), 'Promocional');
  assert.equal(limpio('Café con regalo'), 'Café con');
});

test('factura de distribuidora: aunque la IA lea 1 pieza, el renglón original manda y el nombre sale limpio', () => {
  const out = gem.parseItems(JSON.stringify({ items: [
    { raw: '220502 1 CAJA XBX 50191507 PROMOCION SOPA RAMEN CAM/LIMM/HAB C/24 $0.38', code: '220502', name: 'PROMOCION SOPA RAMEN CAM/LIMM/HAB C/24', packs: 1, packSize: 1, cost: 0.38, lineTotal: 0.38 },
    { raw: '232094 1 CAJA XBX 50201706 CAFE NESCAFE CLASICO 16/42 GRS $660.64', code: '232094', name: 'Café Nescafé Clásico 16/42 grs', packs: 1, packSize: 1, cost: 660.64, lineTotal: 660.64 },
    { raw: '230210 2 CAJA XBX 50191507 SOPA VASO MARUCHAN CON CAMARON C/12 $159.19 $318.38', code: '230210', name: 'Sopa Vaso Maruchan con Camarón', packs: 2, packSize: 12, cost: 159.19, lineTotal: 318.38 },
  ] }));
  assert.deepEqual(out.map((i) => [i.name, i.packs, i.packSize]), [
    ['SOPA RAMEN CAM/LIMM/HAB', 1, 24],
    ['Café Nescafé Clásico 42 g', 1, 16],
    ['Sopa Vaso Maruchan con Camarón', 2, 12],
  ]);
  assert.equal(inv.enrichItem(out[2]).stockIn, 24, '2 cajas de 12 son 24 piezas');
});

test('el prompt de la IA explica el formato de factura de distribuidora y pide un nombre limpio', () => {
  const src = require('fs').readFileSync(require.resolve('../services/gemini.service'), 'utf8');
  for (const frase of ['N/M UNIDAD', 'C/N', 'CLAVE / CANT / UNIDAD', 'NOMBRE LIMPIO', 'GRATIS']) assert.ok(src.includes(frase), frase);
});

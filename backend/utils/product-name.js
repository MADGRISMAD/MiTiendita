/**
 * Las facturas de distribuidora meten en la descripción cosas que no son el producto: promociones, «gratis», el tipo de caja,
 * «exhibidor», y el paquete escrito como 24/430 GRS. Esto deja solo el producto y lo que trae cada pieza («Café Nescafé Clásico 42 g»).
 */
const PROMO_WORD = '(?:gratis|promo(?:ci[oó]n(?:es)?)?|oferta|regalo|obsequio|descuento|bonificaci[oó]n)';
const NUMBER_WORD = '(?:diez|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien)';

const RULES = [
  // «(600+50 HD GRATIS)», «(PROMOCIÓN)»
  [new RegExp(`\\([^)]*${PROMO_WORD}[^)]*\\)`, 'gi'), ' '],
  // «PROMOCION», «OFERTA», «GRATIS» sueltos
  [new RegExp(`(?<![\\p{L}\\d])${PROMO_WORD}(?![\\p{L}\\d])`, 'giu'), ' '],
  // tipo de caja: «(CAJA GDE)», «(CJA GRANDE)», «(MEDIA CAJA)», «MED CAJ»
  [/\(\s*(?:caja|cja|cj)\s*(?:gde|grande|chica|ch)\.?\s*\)/gi, ' '],
  [/\(\s*(?:media|med)\.?\s*caj(?:a)?\s*\)/gi, ' '],
  [/(?<![\p{L}\d])(?:caja|cja)\s+(?:gde|grande)(?![\p{L}\d])/giu, ' '],
  // exhibidor
  [/(?<![\p{L}\d])exhib(?:idor(?:es)?)?\.?(?![\p{L}\d])/giu, ' '],
  // «84 PIEZAS» al inicio y «(50 PIEZAS)» entre paréntesis: son las piezas de la caja, no parte del nombre
  [new RegExp(`\\(\\s*(?:\\d+|${NUMBER_WORD})\\s*pi[eé]zas?\\s*\\)`, 'gi'), ' '],
  [new RegExp(`^\\s*(?:\\d+|${NUMBER_WORD})\\s+pi[eé]zas?\\s+`, 'i'), ''],
  // «CAJA C/24 PZ»
  [/(?<![\p{L}\d])(?:caja|cja|cj)\s*c\s*\/\s*\d{1,3}(?:\s*pzs?\.?|\s*pzas?\.?)?(?![\d/])/giu, ' '],
  // «C/24», «C/24 PZ»
  [/(?<![\p{L}\d])c\s*\/\s*\d{1,3}(?:\s*pzs?\.?|\s*pzas?\.?)?(?![\d/])/giu, ' '],
];

// «16/42 GRS» → «42 g»: queda lo que trae cada pieza (las piezas de la caja van en otro campo)
const SLASH_SIZE = /(?<![\d/.])\d{1,3}\s*\/\s*(\d+(?:[.,]\d+)?)\s*(grs?|gramos?|kgs?|kilos?|mls?|lts?|litros?|l)(?![a-z0-9/])/gi;
const UNIT = { gr: 'g', grs: 'g', g: 'g', gramo: 'g', gramos: 'g', kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', ml: 'ml', mls: 'ml', l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L' };

function cleanProductName(name) {
  const original = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
  let out = original.replace(SLASH_SIZE, (_all, size, unit) => `${size.replace(',', '.')} ${UNIT[unit.toLowerCase()] || unit}`);
  for (const [re, to] of RULES) out = out.replace(re, to);
  out = out.replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–,.;:+]+|[\s\-–,;:+]+$/g, '').trim();
  return out.length >= 2 ? out : original;
}

module.exports = { cleanProductName };

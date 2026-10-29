/**
 * Gemini Flash-Lite — Inventario Mágico y Precio Mágico.
 * REST directo para no agregar SDK. Modelo por defecto: gemini-3.5-flash-lite.
 */

const { parsePackNotation, mentionsPack, WORDS: PACK_WORDS } = require('../utils/pack-notation');
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TEXT_TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 120_000;

function geminiModel() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function hasGeminiConfig() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

const EXTRACT_PROMPT = `Eres el lector de notas de proveedor de una tienda de abarrotes o farmacia en México. Tu trabajo es COPIAR con exactitud lo que dice la nota, no interpretarla ni mejorarla. Un precio o una cantidad mal leída es dinero y mercancía perdidos.

La nota puede ser una factura impresa, un ticket, una remisión, una nota escrita a mano o una lista corta en texto, con o sin precios.

SALIDA: responde SOLO un JSON, sin texto antes ni después, con esta forma exacta:
{"supplier":{"name":"","contact":"","whatsapp":"","date":"","expiresAt":""},"documentTotal":0,"documentSubtotal":0,"documentTax":0,"documentDiscount":0,"items":[{"raw":"","code":"","name":"","cost":0,"lineTotal":0,"price":0,"barcode":"","packs":1,"packSize":1,"lot":"","expiresAt":""}]}

═══ FORMATO MUY COMÚN: notas de distribuidora (PRO / DESCRIPCION / CAJAS / IMPORTE) ═══
Cada producto ocupa DOS líneas impresas:
   línea 1:  <CÓDIGO> <DESCRIPCIÓN>            ej. "29 COCA-COLA 600 PET 24"
   línea 2:  <CAJAS (cantidad)>   <IMPORTE>    ej. "1        464.50"
- El PRIMER número de la línea 1 es el CÓDIGO del producto (columna PRO). NO es cantidad ni precio. Va en "code".
- La CANTIDAD es la columna CAJAS: el número chico de la línea 2 (1, 2, 4…). Va en "packs".
- El IMPORTE es el monto de la línea 2 y es el TOTAL del renglón (todas las cajas). Va en "lineTotal". Si la nota no trae precio unitario, cost = 0.
- El número al FINAL de la descripción son las PIEZAS por caja (packSize): "PET 24" → 24, "PET6" → 6, "PET 24U" → 24, "TT4" → 4, "LA 4" (lata) → 4, "RP 8" (retornable pack) → 8, "250 6" (250 ml, caja de 6) → 6.
- Ejemplo completo: "1220 COCA-COLA 300ML PET 24" / "1 256.00" → code "1220", name "Coca Cola 300 ml", packs 1, packSize 24, lineTotal 256, cost 0.
- Ejemplo con 2 cajas: "34 COCA-COLA 3L PET 6" / "2 635.00" → code "34", name "Coca Cola 3 L", packs 2, packSize 6, lineTotal 635 (cada caja cuesta 317.5, pero NO lo calcules: copia 635).
- El mismo CÓDIGO es el mismo producto. Un código no se repite dentro de una misma nota.
- Los renglones con código distinto son productos distintos aunque se parezcan (sabores, tamaños).

═══ CÓMO LEER (sigue este orden) ═══
1. Busca los ENCABEZADOS de columnas (Cant., Descripción, P. Unit., Importe, Precio, Total, Desc., IVA…). Cada número va con SU columna; no mezcles columnas ni renglones.
2. Lee renglón por renglón, de arriba abajo, sin saltarte ninguno. Un renglón de la nota = un item. No unas ni separes renglones.
3. En cada renglón identifica: cantidad, descripción, precio unitario e importe. Si la nota trae precio unitario e importe, copia AMBOS tal cual.
4. Al terminar, vuelve a revisar: ¿el número de items es igual al número de renglones de la nota? Si falta alguno, agrégalo.
5. Si un dato no se ve, está borroso o dudas, pon 0 o "" en ese campo. NUNCA lo adivines, lo redondees ni lo completes "por lógica".

═══ PROVEEDOR (solo si se ve; si no, strings vacíos) ═══
- name: razón social o nombre comercial impreso.
- contact: persona de contacto o correo, si aparece.
- whatsapp: teléfono o WhatsApp, solo dígitos.
- date: fecha de la nota en YYYY-MM-DD (DD/MM/AAAA → conviértela; DD/MM/AA → siglo 20xx).
- expiresAt: caducidad general SOLO si hay UNA para toda la nota; si no, "".

═══ TOTALES DE LA NOTA (fuera de items) ═══
- documentTotal: el TOTAL A PAGAR impreso (el monto final). Si no hay, 0.
- documentSubtotal: el SUBTOTAL impreso (antes de IVA/IEPS y de descuentos). Si no hay, 0.
- documentTax: suma de IVA/IEPS impresos. Si no hay, 0.
- documentDiscount: descuentos o bonificaciones impresos a nivel nota. Si no hay, 0.
- Cópialos de donde dicen "Total", "Subtotal", "IVA", "Descuento". NUNCA los sumes tú.
- No los pongas como productos.

═══ CAMPOS DE CADA PRODUCTO ═══
- code: el código/clave del producto si la nota lo trae (columna PRO, SKU, clave), solo el texto del código; si no hay, "".
- raw: el renglón COMPLETO copiado TAL CUAL está escrito (las dos líneas juntas si el producto ocupa dos) (con sus abreviaturas, números y errores de ortografía), ej. "12 COCA 600 TT4 $464.50". No lo limpies ni lo traduzcas.
- name: nombre normalizado: marca + producto + tamaño con unidad ("Coca Cola 600 ml", "Aceite 1 L", "Sabritas Original 45 g"). Conserva TODOS los tamaños y variantes del renglón (sabor, light, retornable, etc.). No inventes marcas ni tamaños que no estén.
- packs: CANTIDAD comprada = cuántas unidades de compra (piezas sueltas, o pets/packs/cajas si es mayoreo). Si no se ve, 1.
- packSize: cuántas PIEZAS trae cada unidad de compra. Pieza suelta = 1. Si es pack/pet/caja y no puedes saber cuántas piezas trae, 0.
- cost: precio de COMPRA de UNA unidad de compra (la columna "P. Unit."/"Precio"), tal como lo cobra el proveedor. Si la unidad de compra es un pet/pack/caja, es el precio de UN pet/pack/caja completo, NO por pieza. Si el renglón no trae precio, 0.
- lineTotal: el IMPORTE del renglón (la columna "Importe"/"Total" del renglón), antes de descuentos e impuestos de la nota. Cópialo tal cual; NO lo calcules multiplicando. Si la nota no trae columna de importe, 0.
- price: precio de VENTA al público por pieza, SOLO si la nota lo dice como precio de venta ("a 22", "venta 22", "PV"). En una factura de proveedor casi siempre es 0.
- barcode: código de barras si se ve (solo dígitos); si no, "".
- lot: lote si aparece; si no, "".
- expiresAt: caducidad del renglón en YYYY-MM-DD (CAD, Caducidad, Exp, Vence). Si no, "".

═══ REGLAS DE DINERO (las más importantes) ═══
- Cifras en pesos como número plano: sin "$", sin comas, sin separador de miles. "1,234.50" → 1234.5. "230.000" con tres decimales y sin centavos es 230000; "230.50" es 230.5. Cuenta bien los dígitos.
- Nunca confundas dinero con tamaño o cantidad: 600, 355, 500, 1.5, 2L, 3L, 24, 12 NO son dinero salvo que estén en una columna de precio/importe o lleven "$", "pesos", "c/u", "a".
- Nunca pongas el mismo monto en cost y en price. Nunca pongas el importe del renglón en cost si hay también precio unitario: cost es el unitario y lineTotal el importe.
- Si la nota solo trae UNA cifra de dinero por renglón: si hay columna de importe/total, va en lineTotal (y cost = 0); si es claramente el precio de una unidad, va en cost.
- Coherencia (revísala, pero NO corrijas la nota): cost × packs debería dar casi lineTotal. Si no cuadra, copia los dos números tal como están impresos y no los alteres.
- Un descuento en un renglón: copia el importe final que muestra la nota para ese renglón en lineTotal.

═══ CANTIDADES Y PAQUETES ═══
- "15 cocas de 600" → name "Coca Cola 600 ml", packs 15, packSize 1. El 15 son piezas; "de 600" es tamaño (ml), NO dinero.
- "8 sabritas" → name "Sabritas", packs 8, packSize 1.
- "2 aceites 1L" → name "Aceite 1 L", packs 2, packSize 1.
- "coca 600 a 22" → name "Coca Cola 600 ml", packs 1, price 22 ("a 22" sí es dinero de venta).
- "15 cocas de 600 a 18" → 15 piezas, price 18.
- PET / PED / PT / TT / PK / PACK / PAQ / CAJA / CJ / BULTO / DISPLAY / CHAROLA = paquete. TODAS significan lo mismo. El número pegado o después de la abreviatura son las PIEZAS por paquete (packSize); el número ANTES son los paquetes comprados (packs).
  · "coca 3L 1 pet de 4" → name "Coca Cola 3 L", packs 1, packSize 4 (4 cocas de 3 L).
  · "2 pets de 6 coca 2L" → name "Coca Cola 2 L", packs 2, packSize 6 (12 botellas).
  · "COCA 600 PET6", "COCA 600 PET 6", "COCA 600 PED 6", "COCA 600 TT4", "COCA 600 TT 4", "PT 8", "PK12", "c/24" → packSize = ese número.
  · "3 pack coca 12" → packs 3, packSize 12.
  · "caja de 24" → packSize 24.
- Revisa SIEMPRE si el renglón trae una de esas abreviaturas antes de decidir packSize. Si no trae ninguna, packSize = 1.
- No confundas tamaño del producto (600, 3L, 1.5) con piezas del paquete, ni paquetes comprados con piezas por paquete.
- Si la cantidad dice "2.5" o similar (kilos a granel), respétala en packs.

═══ QUÉ INCLUIR Y QUÉ NO ═══
- Incluye TODOS los productos, aunque no tengan precio o sean poco claros: un renglón con producto y/o cantidad es un item.
- No incluyas como producto: totales, subtotales, IVA, descuentos, RFC, folios, fechas, leyendas, datos del proveedor ni formas de pago.
- Si el mismo producto aparece en dos renglones distintos de la nota, devuélvelos como dos items (no los sumes).
- Nunca inventes productos, cantidades, precios, lotes ni fechas. Nunca "corrijas" ortografía de números.
- Si no lees nada, responde {"supplier":{"name":"","contact":"","whatsapp":"","date":"","expiresAt":""},"documentTotal":0,"documentSubtotal":0,"documentTax":0,"documentDiscount":0,"items":[]}.`;

function ymd(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || m > 12 || d > 31) return '';
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDocDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return ymd(iso[1], iso[2], iso[3]);
  const dmy = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return ymd(year, dmy[2], dmy[1]);
  }
  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime()) && dt.getUTCFullYear() > 2000) {
    return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return '';
}

function digitsPhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
}

function emptySupplier() {
  return { name: '', contact: '', whatsapp: '', date: '', expiresAt: '' };
}

function normalizeSupplier(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptySupplier();
  return {
    name: String(raw.name || raw.supplierName || '').trim().slice(0, 80),
    contact: String(raw.contact || '').trim().slice(0, 80),
    whatsapp: digitsPhone(raw.whatsapp || raw.phone || raw.telefono),
    date: parseDocDate(raw.date || raw.fecha),
    expiresAt: parseDocDate(raw.expiresAt || raw.caducidad),
  };
}

function stripJsonFence(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

function num(value) {
  const n = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : 0;
}

function intQty(value, fallback = 0) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(5000, n);
}

const SKIP_LINE = /^(total|subtotal|iva|ieps|cambio|efectivo|fecha|rfc|proveedor|gracias|factura|whatsapp)\b/i;
const BRANDS = [
  [/^(?:las?\s+)?cocas?(?:\s+colas?)?$/, 'Coca Cola'],
  [/^pepsis?$/, 'Pepsi'],
  [/^sabritas$/, 'Sabritas'],
  [/^galletas$/, 'Galletas'],
  [/^aguas$/, 'Agua'],
  [/^leches$/, 'Leche'],
  [/^aceites$/, 'Aceite'],
  [/^jugos$/, 'Jugo'],
  [/^(cervezas|chelas)$/, 'Cerveza'],
  [/^tortillas$/, 'Tortilla'],
  [/^huevos$/, 'Huevo'],
  [/^arroces$/, 'Arroz'],
  [/^frijoles$/, 'Frijol'],
  [/^(azucares|azucar)$/, 'Azúcar'],
  [/^refrescos$/, 'Refresco'],
];

function moneyToken(value) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : 0;
}

function unitOf(raw) {
  const u = String(raw || '').toLowerCase();
  if (u === 'ml') return 'ml';
  if (u === 'kg' || u.startsWith('kilo')) return 'kg';
  if (u === 'g' || u === 'gr' || u.startsWith('gram')) return 'g';
  return 'L';
}

function brandName(words) {
  const key = words
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, name] of BRANDS) {
    if (re.test(key)) return name;
  }
  return words
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b([a-záéíóúñ])/gi, (ch) => ch.toUpperCase());
}

const PACK_WORD = new RegExp(`(?:^|[^a-z0-9])(?:${PACK_WORDS})(?![a-z])`, 'i');

/** Nota suelta: "15 cocas de 600" = 15 piezas de Coca 600 ml, sin precio. */
function parseLooseLine(line) {
  let raw = String(line || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw.length > 180 || SKIP_LINE.test(raw)) return null;

  let price = 0;
  let cost = 0;
  raw = raw.replace(/\b(?:costo|compra)\s+(\d+(?:[.,]\d{1,2})?)\b/gi, (_, n) => {
    cost = moneyToken(n);
    return ' ';
  });
  raw = raw.replace(/\$\s*(\d+(?:[.,]\d{1,2})?)/g, (_, n) => {
    if (!price) price = moneyToken(n);
    return ' ';
  });
  raw = raw.replace(/\b(?:a|en|por)\s+(\d+(?:[.,]\d{1,2})?)\s*(?:pesos|mxn|varos)?\b/gi, (_, n) => {
    if (!price) price = moneyToken(n);
    return ' ';
  });
  raw = raw.replace(/\b(\d+(?:[.,]\d{1,2})?)\s*(?:pesos|mxn|varos)\b/gi, (_, n) => {
    if (!price) price = moneyToken(n);
    return ' ';
  });

  let explicitQty = false;
  let qty = 1;
  let petPacks = 0;
  // "PET6", "PET 6", "PED 6", "TT4", "2 pet de 6", "caja c/24": cuántos paquetes y cuántas piezas trae cada uno
  const notation = parsePackNotation(raw);
  if (notation) {
    petPacks = notation.packSize;
    if (notation.packs) {
      qty = notation.packs;
      explicitQty = true;
    }
    raw = notation.rest;
  }
  const lead = explicitQty ? null : raw.match(/^(\d{1,4})\s+(?=[a-záéíóúñ])/i);
  if (lead && Number(lead[1]) >= 1 && Number(lead[1]) <= 5000) {
    qty = Number(lead[1]);
    explicitQty = true;
    raw = raw.slice(lead[0].length);
  }
  const marked = raw.match(/\bx\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:pzas?|piezas|unidades|uds?)\b/i);
  if (marked) {
    const n = Number(marked[1] || marked[2]);
    if (PACK_WORD.test(line) && n >= 2 && n <= 200) petPacks = petPacks || n; // "caja de 25 pzas": son las piezas de cada caja
    else {
      qty = n;
      explicitQty = true;
    }
    raw = raw.replace(marked[0], ' ');
  }

  let size = '';
  let unit = '';
  const withUnit = raw.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|lts?|litros?|kg|kilos?|gramos|gr|g|l)\b/i);
  if (withUnit) {
    size = withUnit[1].replace(',', '.');
    unit = unitOf(withUnit[2]);
    raw = raw.replace(withUnit[0], ' ');
  } else {
    const deNum = raw.match(/\bde\s+(\d+(?:[.,]\d+)?)\b/i);
    if (deNum) {
      const n = Number(deNum[1].replace(',', '.'));
      if (n >= 50 && n <= 5000) {
        size = String(n);
        unit = 'ml';
        raw = raw.replace(deNum[0], ' ');
      } else if (/[.,]/.test(deNum[1]) && n > 0 && n <= 5) {
        size = String(n);
        unit = 'L';
        raw = raw.replace(deNum[0], ' ');
      }
    }
  }
  if (!size) {
    const trail = raw.match(/\b(\d{2,4})\b/);
    if (trail && Number(trail[1]) >= 50 && Number(trail[1]) <= 5000) {
      size = trail[1];
      unit = 'ml';
      raw = raw.replace(trail[0], ' ');
    }
  }

  const isPack = Boolean(petPacks) || mentionsPack(line);
  let packSize = isPack ? 0 : 1;
  if (petPacks) packSize = petPacks;
  if (isPack && !petPacks) {
    raw = raw.replace(new RegExp(`(?:^|[^a-z0-9])(?:${PACK_WORDS})(?![a-z])`, 'gi'), ' ');
    const ps = raw.match(/\b(\d{1,3})\b/);
    if (ps && Number(ps[1]) >= 2 && Number(ps[1]) <= 48) {
      packSize = Number(ps[1]);
      raw = raw.replace(ps[0], ' ');
    }
  }

  raw = raw.replace(/\bde\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!raw || !/[a-záéíóúñ]/i.test(raw)) return null;

  const name = `${brandName(raw)}${size ? ` ${size} ${unit}` : ''}`.replace(/\s+/g, ' ').trim();
  return {
    name,
    cost,
    price,
    barcode: '',
    packs: Math.max(1, qty),
    packSize,
    lot: '',
    expiresAt: '',
    explicitQty,
    fromLoose: true,
  };
}

function splitLooseLines(text) {
  return String(text || '')
    .split(/\n+|;+|\s*,\s*(?=\d)/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseLooseList(text) {
  const lines = splitLooseLines(text);
  const items = [];
  let missed = 0;
  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;
    const item = parseLooseLine(line);
    if (item) items.push(item);
    else missed += 1;
  }
  return { items: items.slice(0, 80), complete: lines.length > 0 && missed === 0 && items.length > 0 };
}

function photoNo(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 && n <= 9 ? n : 0;
}

/** Si el renglón original trae PET6 / TT4 / PED 6…, esas piezas por paquete mandan sobre lo que haya leído la IA. */
function withRawPack(out, row) {
  const n = parsePackNotation(row?.raw);
  if (!n) return out;
  return { ...out, packSize: n.packSize, packs: n.packs || out.packs };
}

function absorbLoose(row) {
  return withRawPack(absorbLooseRow(row), row);
}

function absorbLooseRow(row) {
  const lot = String(row?.lot || row?.lote || '').trim().slice(0, 60);
  const expiresAt = parseDocDate(row?.expiresAt || row?.caducidad || row?.expiry);
  const loose = parseLooseLine(row?.name);
  if (!loose) {
    return {
      name: String(row?.name || '').trim(),
      cost: num(row?.cost),
      price: num(row?.price),
      barcode: String(row?.barcode || '').replace(/\s/g, ''),
      packs: intQty(row?.packs, 1) || 1,
      packSize: intQty(row?.packSize, 0),
      lot,
      expiresAt,
      lineTotal: num(row?.lineTotal),
      raw: String(row?.raw || '').trim().slice(0, 160),
      code: String(row?.code || '').trim().slice(0, 40),
      photo: photoNo(row?.photo),
      fromLoose: false,
    };
  }
  let price = num(row?.price) || loose.price || 0;
  let cost = num(row?.cost) || loose.cost || 0;
  const sizeNum = Number(String(loose.name).match(/(\d+(?:\.\d+)?)\s*(ml|L|kg|g)\b/)?.[1] || 0);
  if (sizeNum && (price === sizeNum || cost === sizeNum)) {
    price = loose.price || 0;
    cost = loose.cost || 0;
  }
  return {
    name: loose.name,
    cost,
    price,
    barcode: String(row?.barcode || '').replace(/\s/g, ''),
    packs: loose.explicitQty ? loose.packs : intQty(row?.packs, loose.packs) || loose.packs,
    packSize: loose.explicitQty || loose.packSize !== 1
      ? loose.packSize
      : intQty(row?.packSize, loose.packSize),
    lot: lot || loose.lot || '',
    expiresAt: expiresAt || loose.expiresAt || '',
    lineTotal: num(row?.lineTotal),
    raw: String(row?.raw || '').trim().slice(0, 160),
    code: String(row?.code || '').trim().slice(0, 40),
    fromLoose: true,
  };
}

function parsePayload(text) {
  const parsed = JSON.parse(stripJsonFence(text));
  const list = Array.isArray(parsed) ? parsed : parsed?.items;
  const items = Array.isArray(list)
    ? list
        .map((row) => absorbLoose(row))
        .filter((row) => row.name && (row.cost > 0 || row.lineTotal > 0 || row.price > 0 || row.packs > 1 || row.packSize !== 1 || row.fromLoose))
        .slice(0, 80)
    : [];
  const supplier = normalizeSupplier(Array.isArray(parsed) ? null : parsed?.supplier);
  return { items, supplier, documentTotal: num(Array.isArray(parsed) ? 0 : parsed?.documentTotal),
    documentSubtotal: num(Array.isArray(parsed) ? 0 : parsed?.documentSubtotal),
    documentTax: num(Array.isArray(parsed) ? 0 : parsed?.documentTax),
    documentDiscount: num(Array.isArray(parsed) ? 0 : parsed?.documentDiscount) };
}

function parseItems(text) {
  return parsePayload(text).items;
}

function itemKey(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameItem(a, b) {
  const ka = itemKey(a);
  const kb = itemKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  const nums = (value) => (value.match(/\d+(?:\.\d+)?/g) || []).join(',');
  if (nums(ka) !== nums(kb)) return false;
  if (ka.includes(kb) || kb.includes(ka)) return true;
  const [ca, cb] = [ka.replace(/ /g, ''), kb.replace(/ /g, '')];
  return ca.includes(cb) || cb.includes(ca);
}

function mergeItems(local, ai) {
  const out = local.map((row) => ({ ...row }));
  for (const item of ai) {
    if (out.some((have) => sameItem(have.name, item.name))) continue;
    out.push(item);
  }
  return out.slice(0, 80);
}

function isTimeoutError(err) {
  return (
    err?.name === 'TimeoutError' ||
    err?.name === 'AbortError' ||
    /aborted due to timeout|timeout/i.test(String(err?.message || ''))
  );
}

function looksLikeInvoice(text) {
  return /\b(factura|proveedor|rfc|remisi[oó]n|caducidad|lote|fecha|iva|subtotal)\b/i.test(String(text || ''));
}

async function extractPrices({ text, images = [] }) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    const err = new Error('Falta GEMINI_API_KEY en el servidor.');
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }

  // Varias fotos: cada una se lee por separado (en paralelo) para saber con certeza de cuál salió cada renglón
  if (images.length > 1) {
    const reads = await Promise.all(images.map((img, i) => extractPrices({ text: i === 0 ? text : '', images: [img] })));
    const items = reads.flatMap((r, i) => r.items.map((it) => ({ ...it, photo: i + 1 })));
    const supplier = reads.map((r) => r.supplier).find((sup) => sup && sup.name) || reads[0].supplier || emptySupplier();
    // El total impreso sale en una sola foto (normalmente la última): se toma el más grande que se haya leído
    const documentTotal = Math.max(0, ...reads.map((r) => Number(r.documentTotal) || 0));
    const top = (k) => Math.max(0, ...reads.map((r) => Number(r[k]) || 0));
    return { items: items.slice(0, 80), supplier, documentTotal, documentSubtotal: top('documentSubtotal'), documentTax: top('documentTax'), documentDiscount: top('documentDiscount') };
  }

  const hasImage = images.length > 0;
  const loose = parseLooseList(text);
  if (!hasImage && loose.complete && !looksLikeInvoice(text)) {
    return { items: loose.items.map(publicItem), supplier: emptySupplier() };
  }

  const parts = [
    {
      text: `${EXTRACT_PROMPT}\n\nTexto del usuario:\n${text || '(sin texto, usa la imagen)'}`,
    },
  ];
  images.forEach((img) => {
    parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.imageBase64 } });
  });

  const model = geminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              supplier: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  contact: { type: 'STRING' },
                  whatsapp: { type: 'STRING' },
                  date: { type: 'STRING' },
                  expiresAt: { type: 'STRING' },
                },
              },
              documentTotal: { type: 'NUMBER' },
              documentSubtotal: { type: 'NUMBER' },
              documentTax: { type: 'NUMBER' },
              documentDiscount: { type: 'NUMBER' },
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING' },
                    cost: { type: 'NUMBER' },
                    lineTotal: { type: 'NUMBER' },
                    price: { type: 'NUMBER' },
                    barcode: { type: 'STRING' },
                    packs: { type: 'NUMBER' },
                    packSize: { type: 'NUMBER' },
                    lot: { type: 'STRING' },
                    expiresAt: { type: 'STRING' },
                    raw: { type: 'STRING' },
                    code: { type: 'STRING' },
                    photo: { type: 'NUMBER' },
                  },
                  required: ['name'],
                },
              },
            },
            required: ['items'],
          },
        },
      }),
      signal: AbortSignal.timeout(hasImage ? IMAGE_TIMEOUT_MS : TEXT_TIMEOUT_MS),
    });
  } catch (err) {
    if (loose.items.length && !hasImage) {
      return { items: loose.items.map(publicItem), supplier: emptySupplier() };
    }
    if (isTimeoutError(err)) {
      const soft = new Error(
        'La foto tardó demasiado. Toma otra más cerca y con buena luz, o pega la lista como texto.'
      );
      soft.code = 'GEMINI_TIMEOUT';
      soft.status = 504;
      throw soft;
    }
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (loose.items.length && !hasImage) {
      return { items: loose.items.map(publicItem), supplier: emptySupplier() };
    }
    const apiMsg = data?.error?.message || '';
    const err = new Error(apiMsg || 'Gemini no pudo leer la lista.');
    err.code = 'GEMINI_ERROR';
    err.status = res.status;
    throw err;
  }

  const reply = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  let payload = { items: [], supplier: emptySupplier() };
  try {
    payload = parsePayload(reply);
  } catch {
    if (loose.items.length) {
      return { items: loose.items.map(publicItem), supplier: emptySupplier() };
    }
    const parseErr = new Error('La respuesta de la IA no se pudo leer.');
    parseErr.code = 'GEMINI_PARSE';
    throw parseErr;
  }
  return {
    items: mergeItems(loose.items, payload.items).map(publicItem),
    supplier: payload.supplier || emptySupplier(),
    documentTotal: payload.documentTotal || 0,
    documentSubtotal: payload.documentSubtotal || 0,
    documentTax: payload.documentTax || 0,
    documentDiscount: payload.documentDiscount || 0,
  };
}

// ───────────── Identificar un producto y completar sus datos ─────────────
const IDENTIFY_TIMEOUT_MS = 30_000;
const UNITS = ['pz', 'kg', 'g', 'l'];
const tidy = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

function identifyPrompt({ code, name, categories, search }) {
  const cats = categories.length ? categories.map((c) => `- ${c}`).join('\n') : '(la tienda todavía no tiene categorías)';
  const task = search
    ? `Busca en internet a qué producto corresponde el código de barras ${code}. Solo da una respuesta si lo encuentras en una página que lo muestre con ese código; si no estás seguro, responde found=false. NO adivines ni te bases en el prefijo del código.`
    : `El producto se llama «${name}»${code ? ` (código ${code})` : ''}. No lo busques: completa sus datos a partir del nombre.`;
  return `Eres el asistente de catálogo de una tienda en México (abarrotes, limpieza, farmacia, ferretería, electrónica). ${task}

Responde SOLO un JSON, sin texto antes ni después, con esta forma:
{"found":true,"name":"","brand":"","presentation":"","unit":"pz","category":"","confidence":"alta"}

- name: marca y producto como se vende, sin la presentación (ej. "Coca-Cola Sabor Original"). ${search ? '' : 'Déjalo vacío: el nombre ya lo escribió el usuario.'}
- presentation: contenido o medida (ej. "600 ml", "1 kg", "4 pzas"). Vacío si no se sabe.
- unit: cómo se vende: "pz" (pieza, lo normal), "kg", "g" o "l" (solo si se vende a granel o por peso o volumen).
- category: elige EXACTAMENTE una de estas categorías de la tienda si alguna encaja:
${cats}
  Si ninguna encaja, escribe una categoría general nueva y corta (ej. "Limpieza", "Electrónica", "Ferretería", "Papelería").
- confidence: "alta" solo si estás seguro; "media" o "baja" si dudas.
- found: false si no pudiste identificar el producto.`;
}

/** Lee el JSON que devuelve la IA (aunque venga con texto o con ```json alrededor) y lo deja limpio. */
function parseIdentify(text, { categories = [] } = {}) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw Object.assign(new Error('La respuesta de la IA no se pudo leer.'), { code: 'GEMINI_PARSE' });
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw Object.assign(new Error('La respuesta de la IA no se pudo leer.'), { code: 'GEMINI_PARSE' });
  }
  const unit = String(data.unit || 'pz').trim().toLowerCase();
  const asked = tidy(data.category, 40);
  // Si eligió una categoría de la tienda, se usa tal cual está escrita en la tienda
  const exact = categories.find((c) => c.toLowerCase() === asked.toLowerCase());
  const confidence = ['alta', 'media', 'baja'].includes(String(data.confidence).toLowerCase()) ? String(data.confidence).toLowerCase() : 'baja';
  return {
    found: data.found !== false,
    name: tidy(data.name, 120),
    brand: tidy(data.brand, 60),
    presentation: tidy(data.presentation, 40),
    unit: UNITS.includes(unit) ? unit : 'pz',
    category: exact || asked,
    categoryExists: Boolean(exact),
    confidence,
  };
}

/**
 * Último recurso para un producto que las bases gratuitas no conocen.
 *  - con código y sin nombre: la IA lo busca en Google (hace falta que la búsqueda respalde la respuesta);
 *  - con nombre: solo completa presentación, unidad y categoría (no cambia el nombre).
 */
async function identifyProduct({ code = '', name = '', categories = [] }) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw Object.assign(new Error('Falta GEMINI_API_KEY en el servidor.'), { code: 'GEMINI_NOT_CONFIGURED' });
  const search = Boolean(code) && !name;
  const model = geminiModel();
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: identifyPrompt({ code, name, categories, search }) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        ...(search ? { tools: [{ google_search: {} }] } : {}),
      }),
      signal: AbortSignal.timeout(IDENTIFY_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) throw Object.assign(new Error('La IA tardó demasiado. Intenta de nuevo.'), { code: 'GEMINI_TIMEOUT', status: 504 });
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'La IA no pudo buscar el producto.'), { code: 'GEMINI_ERROR', status: res.status });
  if (!data?.candidates?.length) throw Object.assign(new Error(`La IA no respondió${data?.promptFeedback?.blockReason ? ` (${data.promptFeedback.blockReason})` : ''}.`), { code: 'GEMINI_EMPTY' });
  const candidate = data?.candidates?.[0];
  const reply = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  const debug = {
    model,
    finishReason: candidate?.finishReason || data?.promptFeedback?.blockReason || '',
    queries: candidate?.groundingMetadata?.webSearchQueries || [],
    sources: (candidate?.groundingMetadata?.groundingChunks || []).map((c) => c?.web?.uri).filter(Boolean).slice(0, 5),
    reply: reply.slice(0, 600),
  };
  if (!reply.trim()) {
    throw Object.assign(new Error(`La IA no devolvió texto${debug.finishReason ? ` (${debug.finishReason})` : ''}.`), { code: 'GEMINI_EMPTY', debug });
  }
  const out = parseIdentify(reply, { categories });
  const grounded = debug.sources.length > 0;
  let reason = '';
  if (search) {
    // Con dudas no se ofrece. Sin búsqueda que lo respalde sí se ofrece, pero marcado para que se verifique contra el producto en mano
    if (!out.found || !out.name) reason = 'not_found';
    else if (out.confidence === 'baja') reason = 'low_confidence';
    out.found = !reason;
  } else {
    out.name = '';
    out.found = true;
  }
  console.log('[ia producto]', JSON.stringify({ code, search, found: out.found, reason, confidence: out.confidence, grounded, queries: debug.queries.length }));
  return { ...out, grounded, search, reason, debug };
}

const BARCODE_TIMEOUT_MS = 25_000;

function barcodePrompt(name) {
  return `Busca en internet el código de barras (EAN-13, EAN-8 o UPC) del producto «${name}», que se vende en México.

Reglas estrictas:
- Responde un código SOLO si lo ves escrito junto a ESE producto en una página: misma marca, misma variante o sabor y misma presentación.
- Si el código que encuentras es de otra presentación, otro sabor u otro producto parecido, responde found=false.
- NO adivines, NO armes un código, NO te bases en el prefijo del país.
- Si dudas, found=false.

Responde SOLO un JSON, sin texto antes ni después:
{"found":true,"code":"","name":"","presentation":"","confidence":"alta"}
- code: solo los dígitos del código.
- name: marca y producto como lo muestra la página, sin la presentación.
- presentation: contenido o medida tal como la muestra la página (ej. "600 ml").
- confidence: "alta" solo si la página muestra ese código junto a ese producto exacto; si no, "media" o "baja".`;
}

/** Lee la respuesta de la IA a barcodePrompt: código solo con dígitos, texto limpio y confianza válida. */
function parseBarcodeAnswer(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw Object.assign(new Error('La respuesta de la IA no se pudo leer.'), { code: 'GEMINI_PARSE' });
  let data;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw Object.assign(new Error('La respuesta de la IA no se pudo leer.'), { code: 'GEMINI_PARSE' });
  }
  const confidence = ['alta', 'media', 'baja'].includes(String(data.confidence).toLowerCase()) ? String(data.confidence).toLowerCase() : 'baja';
  const code = String(data.code == null ? '' : data.code).replace(/\D/g, '');
  return { found: data.found !== false && Boolean(code), code, name: tidy(data.name, 120), presentation: tidy(data.presentation, 40), confidence };
}

/**
 * Busca en Google el código de barras de un producto por su nombre. No decide nada: devuelve lo que dijo la IA
 * junto con las páginas que la respaldan (`sources`) para que quien la use lo compruebe contra otra fuente.
 */
async function findBarcode({ name = '' }) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw Object.assign(new Error('Falta GEMINI_API_KEY en el servidor.'), { code: 'GEMINI_NOT_CONFIGURED' });
  const product = tidy(name, 160);
  if (!product) return { found: false, code: '', name: '', presentation: '', confidence: 'baja', grounded: false, sources: [] };
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: barcodePrompt(product) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(BARCODE_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) throw Object.assign(new Error('La IA tardó demasiado.'), { code: 'GEMINI_TIMEOUT', status: 504 });
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'La IA no pudo buscar el código.'), { code: 'GEMINI_ERROR', status: res.status });
  const candidate = data?.candidates?.[0];
  const reply = candidate?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!reply.trim()) throw Object.assign(new Error('La IA no devolvió texto.'), { code: 'GEMINI_EMPTY' });
  const sources = (candidate?.groundingMetadata?.groundingChunks || []).map((c) => c?.web?.uri).filter(Boolean).slice(0, 5);
  return { ...parseBarcodeAnswer(reply), grounded: sources.length > 0, sources };
}

function publicItem(row) {
  return {
    name: row.name,
    cost: Number(row.cost) || 0,
    price: Number(row.price) || 0,
    barcode: row.barcode || '',
    packs: Math.max(1, Number(row.packs) || 1),
    packSize: row.packSize == null ? 1 : Number(row.packSize),
    lot: String(row.lot || '').trim().slice(0, 60),
    expiresAt: parseDocDate(row.expiresAt),
    lineTotal: Number(row.lineTotal) > 0 ? Number(row.lineTotal) : 0,
    raw: String(row.raw || '').trim().slice(0, 160),
    code: String(row.code || '').trim().slice(0, 40),
    photo: photoNo(row.photo),
  };
}

/**
 * Un mismo producto no debe entrar dos veces a la lista (ni por traslape entre fotos ni porque la IA repitió un renglón):
 *  - mismos datos → se cuenta una sola vez;
 *  - misma presentación y costo pero otra cantidad → se suman las cantidades en un solo renglón;
 *  - presentación o costo distintos → se dejan los dos y se avisa.
 * Siempre devuelve qué encontró para avisarlo en pantalla.
 */
function flagRepeats(items) {
  const kept = [];
  const repeats = [];
  for (const item of items) {
    // Con el código de la nota (columna PRO) basta: mismo código = mismo producto, código distinto = otro producto
    const first = kept.find((k) => (k.code && item.code ? k.code === item.code : sameItem(k.name, item.name)));
    if (!first) {
      kept.push({ ...item });
      continue;
    }
    const photos = [first.photo || 0, item.photo || 0];
    // Otra foto de la misma nota: el mismo producto es el mismo renglón visto dos veces (las fotos se traslapan o
    // se subió la misma). Se queda la lectura más completa y, si no coinciden los datos, se avisa.
    if (first.photo && item.photo && first.photo !== item.photo) {
      const same = ['packs', 'packSize', 'cost', 'price', 'lineTotal'].every((k) => (first[k] || 0) === (item[k] || 0));
      const richer = (r) => (r.lineTotal > 0 ? 2 : 0) + (r.cost > 0 ? 1 : 0);
      if (richer(item) > richer(first)) Object.assign(first, item, { photo: first.photo });
      repeats.push({ name: first.name, photos, packs: [first.packs, item.packs], counted: 'once', differs: !same });
      continue;
    }
    const samePack = first.packSize === item.packSize && first.cost === item.cost && first.price === item.price;
    const sameQty = first.packs === item.packs;
    const info = { name: first.name, photos, packs: [first.packs, item.packs] };
    if (samePack && sameQty) {
      repeats.push({ ...info, counted: 'once' });
    } else if (samePack) {
      first.packs += item.packs;
      if (first.lineTotal || item.lineTotal) first.lineTotal = (first.lineTotal || 0) + (item.lineTotal || 0);
      repeats.push({ ...info, counted: 'merged', total: first.packs });
    } else {
      kept.push({ ...item });
      repeats.push({ ...info, counted: 'both' });
    }
  }
  return { items: kept, repeats };
}

module.exports = {
  identifyProduct,
  findBarcode,
  parseBarcodeAnswer,
  parseIdentify,
  geminiModel,
  hasGeminiConfig,
  extractPrices,
  flagRepeats,
  parseItems,
  parsePayload,
  parseLooseList,
  parseLooseLine,
};

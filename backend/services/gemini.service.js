/**
 * Gemini Flash-Lite — Inventario Mágico y Precio Mágico.
 * REST directo para no agregar SDK. Modelo por defecto: gemini-3.5-flash-lite.
 */

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const TEXT_TIMEOUT_MS = 60_000;
const IMAGE_TIMEOUT_MS = 120_000;

function geminiModel() {
  return String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

function hasGeminiConfig() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim());
}

const EXTRACT_PROMPT = `Eres el ayudante de una tienda de abarrotes o farmacia en México.
Del texto o de la foto, saca cada producto y, si es factura/nota de proveedor, los datos del proveedor.
La lista NO siempre es una factura: a veces es una nota escrita a mano, corta y sin precios.
Responde solo JSON:
{"supplier":{"name":"","contact":"","whatsapp":"","date":"","expiresAt":""},"items":[{"name":"","cost":0,"price":0,"barcode":"","packs":1,"packSize":1,"lot":"","expiresAt":""}]}

Proveedor (solo si se ve en la nota/factura; si no, strings vacíos):
- name: razón social o nombre comercial del proveedor.
- contact: persona de contacto o correo, si aparece.
- whatsapp: teléfono o WhatsApp (solo dígitos si puedes).
- date: fecha de la factura/nota en YYYY-MM-DD. Si está en DD/MM/AAAA, conviértela.
- expiresAt: caducidad general del documento si hay UNA sola para toda la nota; si no, "".

Significado de campos de producto:
- name: producto (marca y tamaño si aparecen). Si dice PACK/PAQUETE/CAJA, déjalo en el nombre.
- cost: precio de COMPRA del renglón. Si no hay dinero, 0.
- price: precio de VENTA al cliente por pieza. Si no hay dinero, 0.
- barcode: código de barras si se ve; si no, "".
- packs: cuántas piezas (o packs, si es mayoreo) entran. Si no se ve, 1.
- packSize: cuántas PIEZAS trae cada pack. Si es pieza suelta, 1.
  Si no puedes saber las piezas del pack, packSize = 0.
- lot: lote / número de lote si aparece; si no, "".
- expiresAt: caducidad del renglón en YYYY-MM-DD si aparece (a veces dice CAD, Caducidad, Exp). Si no, "".

Cómo leen los dueños (imítalo):
- "15 cocas de 600" → name "Coca Cola 600 ml", packs 15, packSize 1, cost 0, price 0.
  El 15 son PIEZAS. "de 600" es el tamaño en mililitros, NO es dinero.
- "8 sabritas" → name "Sabritas", packs 8, packSize 1, cost 0, price 0.
- "2 aceites 1L" → name "Aceite 1 L", packs 2, packSize 1, cost 0, price 0.
- "coca 600 a 22" → name "Coca Cola 600 ml", packs 1, price 22. El "a 22" sí es dinero.
- "3 pack coca 12" → es PACK, packs 3, packSize 12.
- "15 cocas de 600 a 18" → 15 piezas de Coca 600 ml, price 18.

Reglas:
- Un renglón SIN precio igual se incluye si dice producto y/o cantidad.
- Nunca conviertas el tamaño (600, 355, 500, 1.5, 2L, 3L) en cost ni en price.
- "de 600", "600ml", "1.5 L" son tamaño. Dinero solo si dice $, "a 18", "pesos", "c/u" o es una columna de precio en factura.
- PACK / PAQUETE / CAJA = mayoreo: packSize = piezas del pack.
- Factura de proveedor: el monto va en cost. Lista de venta ("a 22"): el monto va en price.
- Números en pesos, sin $ ni comas.
- No incluyas totales, IVA ni RFC como productos.
- SÍ extrae proveedor, fecha, lote y caducidad cuando existan.
- Si no lees nada, {"supplier":{"name":"","contact":"","whatsapp":"","date":"","expiresAt":""},"items":[]}.`;

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
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
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
  const lead = raw.match(/^(\d{1,4})\s+(?=[a-záéíóúñ])/i);
  if (lead && Number(lead[1]) >= 1 && Number(lead[1]) <= 5000) {
    qty = Number(lead[1]);
    explicitQty = true;
    raw = raw.slice(lead[0].length);
  }
  const marked = raw.match(/\bx\s*(\d{1,4})\b|\b(\d{1,4})\s*(?:pzas?|piezas|unidades|uds?)\b/i);
  if (marked) {
    qty = Number(marked[1] || marked[2]);
    explicitQty = true;
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

  const isPack = /\b(packs?|paq\.?|paquetes?|cjs?|cajas?|bultos?|displays?)\b/i.test(line);
  let packSize = isPack ? 0 : 1;
  if (isPack) {
    raw = raw.replace(/\b(packs?|paq\.?|paquetes?|cjs?|cajas?|bultos?|displays?)\b/gi, ' ');
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

function absorbLoose(row) {
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
    fromLoose: true,
  };
}

function parsePayload(text) {
  const parsed = JSON.parse(stripJsonFence(text));
  const list = Array.isArray(parsed) ? parsed : parsed?.items;
  const items = Array.isArray(list)
    ? list
        .map((row) => absorbLoose(row))
        .filter((row) => row.name && (row.cost > 0 || row.price > 0 || row.packs > 1 || row.packSize !== 1 || row.fromLoose))
        .slice(0, 80)
    : [];
  const supplier = normalizeSupplier(Array.isArray(parsed) ? null : parsed?.supplier);
  return { items, supplier };
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
  return ka.includes(kb) || kb.includes(ka);
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

async function extractPrices({ text, imageBase64, mimeType }) {
  const key = String(process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    const err = new Error('Falta GEMINI_API_KEY en el servidor.');
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }

  const hasImage = Boolean(imageBase64);
  const loose = parseLooseList(text);
  if (!hasImage && loose.complete && !looksLikeInvoice(text)) {
    return { items: loose.items.map(publicItem), supplier: emptySupplier() };
  }

  const parts = [
    {
      text: `${EXTRACT_PROMPT}\n\nTexto del usuario:\n${text || '(sin texto, usa la imagen)'}`,
    },
  ];
  if (hasImage) {
    parts.push({
      inlineData: {
        mimeType: mimeType || 'image/jpeg',
        data: imageBase64,
      },
    });
  }

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
          maxOutputTokens: 4096,
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
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING' },
                    cost: { type: 'NUMBER' },
                    price: { type: 'NUMBER' },
                    barcode: { type: 'STRING' },
                    packs: { type: 'NUMBER' },
                    packSize: { type: 'NUMBER' },
                    lot: { type: 'STRING' },
                    expiresAt: { type: 'STRING' },
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
  } catch (err) {
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
  };
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
  };
}

module.exports = {
  geminiModel,
  hasGeminiConfig,
  extractPrices,
  parseItems,
  parsePayload,
  parseLooseList,
  parseLooseLine,
};

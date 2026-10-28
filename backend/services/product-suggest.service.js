/**
 * Sugerencia automática al registrar un producto nuevo, para que solo falte el precio:
 *  1. busca el código en las bases gratuitas (nombre y presentación);
 *  2. con la IA completa lo que falta (categoría de la tienda, unidad de venta, marca) o, si ninguna base lo conoce, lo busca en Google.
 * No gasta los usos de IA del plan (la IA la paga la plataforma), por eso tiene un tope diario por tienda y recuerda lo ya buscado.
 */
const barcodeLookup = require('./barcode-lookup.service');
const gemini = require('./gemini.service');
const { hasAiFeatures } = require('./plans.catalog');

const DAILY_LIMIT = () => Math.max(0, Number(process.env.AI_AUTO_DAILY_LIMIT) || 60);
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHE = 1000;

const usage = new Map(); // tenantId → { day, n }
const searched = new Map(); // código → resultado de la búsqueda con IA

const today = () => new Date().toISOString().slice(0, 10);

/** true si la tienda todavía puede usar la IA hoy (y lo anota). */
function takeDaily(tenantId) {
  const limit = DAILY_LIMIT();
  const row = usage.get(tenantId);
  const n = row && row.day === today() ? row.n : 0;
  if (n >= limit) return false;
  usage.set(tenantId, { day: today(), n: n + 1 });
  return true;
}

const empty = () => ({ found: false, name: '', brand: '', presentation: '', unit: 'pz', category: '', categoryExists: false, source: '', ai: false });

async function suggest({ tenantId, plan, code: codeInput, name: nameInput, categories = [] }) {
  const code = String(codeInput || '').replace(/\D/g, '');
  const validCode = code.length >= 8 && code.length <= 14 ? code : '';
  const known = String(nameInput || '').replace(/\s+/g, ' ').trim();
  const out = empty();

  // 1) bases gratuitas (solo si hay código y todavía no hay nombre)
  if (validCode && !known) {
    const free = await barcodeLookup.lookup(validCode);
    if (free.found) Object.assign(out, { found: true, name: free.name, presentation: free.quantity || '', source: free.source });
  }

  // 2) IA: completa categoría, unidad y marca, o busca el código si nadie lo conoce
  if (!gemini.hasGeminiConfig() || !hasAiFeatures(plan)) return { ...out, aiSkipped: 'off' };
  const name = known || [out.name, out.presentation].filter(Boolean).join(' ');
  if (!name && !validCode) return out;
  const cached = !name && searched.get(validCode);
  let ai = cached && cached.until > Date.now() ? cached.value : null;
  if (!ai) {
    if (!takeDaily(String(tenantId))) return { ...out, aiSkipped: 'limit' };
    try {
      ai = await gemini.identifyProduct({ code: validCode, name, categories });
    } catch (err) {
      console.warn('[sugerencia IA]', err.code || '', err.message);
      return { ...out, aiSkipped: 'error', aiError: String(err.message || '').slice(0, 200) };
    }
    if (!name && ai.found) {
      if (searched.size >= MAX_CACHE) searched.delete(searched.keys().next().value);
      searched.set(validCode, { value: ai, until: Date.now() + CACHE_TTL_MS });
    }
  }
  if (!ai.found) return { ...out, aiSkipped: ai.reason || 'not_found' };
  if (!out.name) out.name = ai.name;
  if (!out.presentation) out.presentation = ai.presentation;
  const exact = categories.find((c) => c.toLowerCase() === String(ai.category).toLowerCase());
  Object.assign(out, {
    found: true,
    ai: true,
    brand: ai.brand,
    unit: ai.unit,
    category: exact || ai.category,
    categoryExists: Boolean(exact),
    source: out.source || 'IA con búsqueda en Google',
    confidence: ai.confidence,
    grounded: ai.search ? ai.grounded : undefined,
  });
  return out;
}

module.exports = { suggest, clearState: () => { usage.clear(); searched.clear(); } };

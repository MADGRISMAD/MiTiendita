/**
 * Busca un código de barras en bases gratuitas para sugerir el nombre al registrar un producto o revisar el catálogo.
 * Primero las bases abiertas «Open * Facts» (alimentos, cuidado personal, hogar, mascotas) y, si ninguna lo tiene,
 * UPCitemdb (productos generales; su modo gratuito tiene tope diario, por eso va al final).
 * Lo que no encuentra simplemente no sugiere nada.
 */
const FACTS = [
  { source: 'Open Food Facts', host: 'world.openfoodfacts.org' },
  { source: 'Open Products Facts', host: 'world.openproductsfacts.org' },
  { source: 'Open Beauty Facts', host: 'world.openbeautyfacts.org' },
  { source: 'Open Pet Food Facts', host: 'world.openpetfoodfacts.org' },
];
const UPC_URL = 'https://api.upcitemdb.com/prod/trial/lookup';
const UA = 'MiTiendita/1.0 (punto de venta; soporte@mitiendita.software)';
const TIMEOUT_MS = 4000;
const TTL_FOUND_MS = 24 * 60 * 60 * 1000;
const TTL_MISSING_MS = 60 * 60 * 1000;
const UPC_PAUSE_MS = 60 * 60 * 1000; // al topar con el límite diario no se insiste por una hora
const MAX_CACHE = 1000;

const cache = new Map();
let upcPausedUntil = 0;

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/** Nombre listo para el formulario: «Marca producto» sin repetir la marca. */
function suggestedName(product) {
  const name = clean(product.product_name_es || product.product_name);
  if (!name) return '';
  const brand = clean(String(product.brands || '').split(',')[0]);
  return brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name;
}

/** Una base «Open * Facts». Devuelve el hallazgo, null si no lo tiene; lanza si no respondió. */
async function askFacts({ source, host }, code) {
  const res = await fetch(`https://${host}/api/v2/product/${code}.json?fields=product_name,product_name_es,brands,quantity`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok && res.status !== 404) throw new Error(`${host} ${res.status}`);
  const data = await res.json().catch(() => ({}));
  const name = data.status === 1 && data.product ? suggestedName(data.product) : '';
  return name ? { found: true, name, quantity: clean(data.product.quantity), source } : null;
}

/** UPCitemdb. null si no lo tiene o está en pausa por el límite; lanza si no respondió. */
async function askUpc(code) {
  if (Date.now() < upcPausedUntil) return null;
  const res = await fetch(`${UPC_URL}?upc=${code}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 429) {
    upcPausedUntil = Date.now() + UPC_PAUSE_MS;
    return null;
  }
  if (!res.ok && res.status !== 404) throw new Error(`upcitemdb ${res.status}`);
  const data = await res.json().catch(() => ({}));
  const item = Array.isArray(data.items) ? data.items[0] : null;
  const title = clean(item?.title);
  return title ? { found: true, name: title.slice(0, 120), quantity: '', source: 'UPCitemdb' } : null;
}

async function lookup(codeInput) {
  const code = String(codeInput || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return { found: false };
  const hit = cache.get(code);
  if (hit && hit.until > Date.now()) return hit.value;

  // Las bases abiertas se preguntan a la vez; gana la primera de la lista que lo tenga
  const answers = await Promise.allSettled(FACTS.map((f) => askFacts(f, code)));
  let found = answers.map((a) => (a.status === 'fulfilled' ? a.value : null)).find(Boolean) || null;
  let failed = answers.some((a) => a.status === 'rejected');
  if (!found) {
    try {
      found = await askUpc(code);
    } catch {
      failed = true;
    }
  }
  if (!found && failed) return { found: false, unavailable: true }; // alguna no respondió: no se guarda como «no existe»
  const value = found || { found: false };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(code, { value, until: Date.now() + (found ? TTL_FOUND_MS : TTL_MISSING_MS) });
  return value;
}

module.exports = { lookup, suggestedName, clearCache: () => { cache.clear(); upcPausedUntil = 0; } };

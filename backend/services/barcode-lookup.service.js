/**
 * Busca un código de barras en Open Food Facts (base abierta y gratuita) para sugerir el nombre al registrar un producto.
 * Cubre sobre todo alimentos y bebidas de marca; lo que no encuentra simplemente no sugiere nada.
 */
const URL_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const TIMEOUT_MS = 4000;
const TTL_FOUND_MS = 24 * 60 * 60 * 1000;
const TTL_MISSING_MS = 60 * 60 * 1000;
const MAX_CACHE = 500;

const cache = new Map();

const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

/** Nombre listo para el formulario: «Marca producto» sin repetir la marca. */
function suggestedName(product) {
  const name = clean(product.product_name_es || product.product_name);
  if (!name) return '';
  const brand = clean(String(product.brands || '').split(',')[0]);
  return brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name;
}

async function lookup(codeInput) {
  const code = String(codeInput || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return { found: false };
  const hit = cache.get(code);
  if (hit && hit.until > Date.now()) return hit.value;

  let value;
  let ttl = TTL_MISSING_MS;
  try {
    const res = await fetch(`${URL_BASE}/${code}.json?fields=product_name,product_name_es,brands,quantity`, {
      headers: { 'User-Agent': 'MiTiendita/1.0 (punto de venta; soporte@mitiendita.software)' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok && res.status !== 404) return { found: false, unavailable: true }; // caído o con límite: no se guarda
    const data = await res.json().catch(() => ({}));
    const name = data.status === 1 && data.product ? suggestedName(data.product) : '';
    value = name ? { found: true, name, quantity: clean(data.product.quantity) } : { found: false };
    if (name) ttl = TTL_FOUND_MS;
  } catch {
    return { found: false, unavailable: true };
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(code, { value, until: Date.now() + ttl });
  return value;
}

module.exports = { lookup, suggestedName, clearCache: () => cache.clear() };

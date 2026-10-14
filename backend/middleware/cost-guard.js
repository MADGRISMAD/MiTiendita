/**
 * El cajero no debe ver cuánto le cuestan los productos a la tienda (ni el margen).
 * La pantalla ya lo oculta, pero la API devolvía el documento completo. Este filtro quita `cost` y `unitCost`
 * de toda respuesta JSON cuando la sesión es de cajero; el administrador recibe todo.
 */
const COST_KEYS = new Set(['cost', 'unitCost']);

const isPlain = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

/** Copia del valor sin `cost` ni `unitCost` (recorre objetos simples y listas; fechas e ids se dejan igual). */
function stripCosts(value) {
  if (Array.isArray(value)) return value.map(stripCosts);
  if (!isPlain(value)) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (!COST_KEYS.has(k)) out[k] = stripCosts(v);
  }
  return out;
}

/** Middleware para `router.use`: decide al responder, cuando `req.user` ya existe. */
function hideCostsFromCashiers(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => json(req.user?.role === 'cashier' ? stripCosts(body) : body);
  next();
}

module.exports = { stripCosts, hideCostsFromCashiers };

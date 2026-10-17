/**
 * Carga masiva de precios (catálogo maestro): el dueño captura precio (y costo) de muchos productos de una vez.
 * Aquí solo se valida y se limpia lo que manda el cliente; guardar y registrar en bitácora lo hace el controlador.
 */
const { ObjectId } = require('../database/sqlite-store');

const MAX_ROWS = 300;
const MAX_PRICE = 1000000;

/** Devuelve { rows: [{id, price, cost?}], rejected: [{id, reason}] }. Un id repetido se queda con el último. */
function sanitizePriceRows(raw) {
  const byId = new Map();
  const rejected = [];
  if (!Array.isArray(raw)) return { rows: [], rejected };
  for (const r of raw.slice(0, MAX_ROWS)) {
    const id = String(r?.id ?? '').trim();
    if (!ObjectId.isValid(id)) {
      rejected.push({ id, reason: 'Producto inválido' });
      continue;
    }
    const price = Math.round(Number(r?.price) * 100) / 100;
    if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
      rejected.push({ id, reason: 'El precio debe ser mayor a 0' });
      continue;
    }
    const row = { id, price };
    if (r?.cost !== undefined && r?.cost !== null && r?.cost !== '') {
      const cost = Math.round(Number(r.cost) * 100) / 100;
      if (!Number.isFinite(cost) || cost < 0 || cost > MAX_PRICE) {
        rejected.push({ id, reason: 'Costo inválido' });
        continue;
      }
      row.cost = cost;
    }
    byId.set(id, row);
  }
  return { rows: [...byId.values()], rejected };
}

module.exports = { sanitizePriceRows, MAX_ROWS };

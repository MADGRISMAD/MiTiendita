// Unidades de venta (igual que frontend/src/bulk.js → SALE_UNITS).
const SALE_UNITS = ['pz', 'kg', 'g', 'l'];

function saleUnitOf(value) {
  return SALE_UNITS.includes(value) ? value : 'pz';
}

/** Cantidad a 3 decimales (gramos en kg, mililitros en litros). */
function roundQty(value) {
  const n = Number(value) || 0;
  return Math.round(Number((n * 1000).toPrecision(12))) / 1000;
}

module.exports = { SALE_UNITS, saleUnitOf, roundQty };

/**
 * Escalera de comisiones de los vendedores (referidos).
 *
 * El nivel se decide por las «ventas cerradas»: tiendas referidas que ya pagaron al menos una vez.
 * Cada cobro de una tienda referida paga la comisión del nivel que tenga el vendedor en ese momento,
 * y esa tasa se guarda en el registro del cobro (subir de nivel no cambia comisiones ya generadas).
 */
const LADDER = [
  { from: 0, rate: 0.1 },
  { from: 5, rate: 0.12 },
  { from: 10, rate: 0.14 },
  { from: 20, rate: 0.16 },
  { from: 35, rate: 0.18 },
  { from: 50, rate: 0.2 },
];

const MIN_RATE = LADDER[0].rate;
const MAX_RATE = LADDER[LADDER.length - 1].rate;

/** Nivel (índice) que corresponde a esa cantidad de ventas cerradas. */
function tierIndexFor(closed) {
  const n = Math.max(0, Math.floor(Number(closed) || 0));
  let index = 0;
  LADDER.forEach((tier, i) => {
    if (n >= tier.from) index = i;
  });
  return index;
}

function rateFor(closed) {
  return LADDER[tierIndexFor(closed)].rate;
}

/** Siguiente nivel y cuántas ventas faltan. null si ya está en el máximo. */
function nextTierFor(closed) {
  const next = LADDER[tierIndexFor(closed) + 1];
  if (!next) return null;
  return { from: next.from, rate: next.rate, missing: next.from - Math.max(0, Math.floor(Number(closed) || 0)) };
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function commissionFor(amount, closed) {
  const rate = rateFor(closed);
  return { rate, commission: round2(Number(amount) * rate) };
}

module.exports = { LADDER, MIN_RATE, MAX_RATE, tierIndexFor, rateFor, nextTierFor, commissionFor, round2 };

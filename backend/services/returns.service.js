/**
 * Devoluciones parciales: el cliente regresa uno o varios productos de un ticket ya cobrado.
 *
 * Convención: la venta conserva su detalle y baja su `total` (y su IVA) por lo devuelto, y `originalTotal`
 * guarda lo que se cobró. Así el corte de caja, el tablero y los reportes —que suman `total` de las ventas
 * cobradas— quedan cuadrados sin tocar cada uno. Cada devolución queda en `order.returns`.
 *
 * Funciones puras: reciben la venta y regresan el plan; guardar y mover dinero lo hace el controlador.
 */
const { lineBreakdown, round2 } = require('../utils/tax');

const qty3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

function httpError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/** Cuánto de cada renglón ya se devolvió (por posición en `items`). */
function returnedByIndex(order) {
  const out = {};
  for (const r of order.returns || []) {
    for (const l of r.lines || []) out[l.index] = qty3((out[l.index] || 0) + (Number(l.quantity) || 0));
  }
  return out;
}

/** Por qué una venta no se puede devolver por partes (null si sí se puede). */
function blockReason(order) {
  if (!order) return 'Pedido no encontrado';
  if (order.paymentStatus !== 'paid' || order.status === 'cancelled') return 'Solo se devuelven ventas cobradas.';
  if (order.pointChargeId) return 'Este cobro fue con la terminal. Usa «Devolver venta» para regresar el dinero completo.';
  if ((order.paymentMethod || 'cash') === 'credit') return 'Las ventas a fiado se devuelven completas con «Devolver venta».';
  if (order.invoice) return 'Esta venta ya tiene factura solicitada; no se puede devolver por partes.';
  return null;
}

/**
 * Plan de una devolución. `requested`: [{ index, quantity, restock }].
 * Devuelve { lines, amount, tax, cardFee, completes } o lanza un error 400 con el motivo.
 */
function planReturn(order, requested) {
  const blocked = blockReason(order);
  if (blocked) throw httpError(400, blocked, 'return_blocked');
  if (!Array.isArray(requested) || !requested.length) throw httpError(400, 'Elige qué productos se devuelven.');

  const items = order.items || [];
  const done = returnedByIndex(order);
  const d = Math.min(100, Math.max(0, Number(order.discountPercent) || 0)) / 100;
  const orderPayable = Math.max(0, round2(Number(order.subtotal || 0) - Number(order.discountAmount || 0)));
  const seen = new Set();
  const lines = [];
  let amount = 0;
  let tax = 0;

  for (const r of requested) {
    const index = Number(r?.index);
    const item = items[index];
    if (!Number.isInteger(index) || !item) throw httpError(400, 'Producto inválido en la devolución.');
    if (seen.has(index)) throw httpError(400, 'Un producto aparece dos veces en la devolución.');
    seen.add(index);
    const quantity = qty3(r.quantity);
    const left = qty3(item.quantity - (done[index] || 0));
    if (!(quantity > 0)) throw httpError(400, `Indica cuántas piezas de «${item.name}» se devuelven.`);
    if (quantity > left) throw httpError(400, `De «${item.name}» solo quedan ${left} por devolver.`);

    const b = lineBreakdown(item.price, item.quantity, item.priceIncludesTax, order.taxRate);
    const share = quantity / item.quantity;
    const lineAmount = round2(b.gross * share * (1 - d));
    const lineTax = round2(b.tax * share * (1 - d));
    amount += lineAmount;
    tax += lineTax;
    lines.push({
      index,
      name: item.name,
      foodId: item.foodId || null,
      quantity,
      amount: lineAmount,
      restock: r.restock !== false, // por omisión regresa al inventario; el cajero marca «merma» si no
    });
  }

  // La comisión de tarjeta se devuelve en la misma proporción que lo devuelto de la venta
  const cardFee = orderPayable > 0 && Number(order.cardExtraTax) > 0 ? round2((Number(order.cardExtraTax) * amount) / orderPayable) : 0;
  amount = round2(amount + cardFee);

  // Si con esto no queda nada por devolver, se regresa exactamente lo que falta (sin centavos de diferencia)
  const completes = items.every((it, i) => qty3(it.quantity - (done[i] || 0) - (lines.find((l) => l.index === i)?.quantity || 0)) <= 0);
  if (completes) {
    amount = round2(Number(order.total) || 0);
    tax = round2(Number(order.tax) || 0);
  }
  amount = Math.min(amount, round2(Number(order.total) || 0));
  return { lines, amount, tax: Math.min(tax, round2(Number(order.tax) || 0)), cardFee, completes };
}

/**
 * Cómo se devuelve el dinero según cómo pagó: efectivo sale de la caja; lo demás (tarjeta, transferencia…)
 * se devuelve fuera del sistema y aquí solo queda registrado.
 */
function refundSplit(order, amount) {
  const method = order.paymentMethod || 'cash';
  if (method === 'cash') return { cash: amount, manual: 0, method };
  if (method === 'split') {
    const original = Number(order.originalTotal ?? order.total) || 0;
    const cardPart = Math.min(original, Math.max(0, Number(order.originalCardAmount ?? order.cardAmount) || 0));
    const cash = original > 0 ? round2((amount * (original - cardPart)) / original) : 0;
    return { cash, manual: round2(amount - cash), method };
  }
  return { cash: 0, manual: amount, method };
}

/** Lotes (caducidad) a regresar para `quantity` piezas de un renglón, sin repetir lo que ya se regresó antes. */
function allocationsToRestore(item, alreadyRestocked, quantity) {
  let skip = qty3(alreadyRestocked);
  let left = qty3(quantity);
  const out = [];
  for (const a of item.lotAllocations || []) {
    let take = Number(a.qty) || 0;
    if (skip > 0) {
      const s = Math.min(skip, take);
      skip = qty3(skip - s);
      take = qty3(take - s);
    }
    if (take <= 0 || left <= 0) continue;
    const use = Math.min(take, left);
    out.push({ lotId: a.lotId, qty: use });
    left = qty3(left - use);
  }
  return out;
}

module.exports = { planReturn, refundSplit, blockReason, returnedByIndex, allocationsToRestore, qty3 };

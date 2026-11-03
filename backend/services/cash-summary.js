/**
 * backend/services/cash-summary.js
 * Totales de ventas de una caja por forma de pago (los comparten el corte final y el Corte X).
 */
function summarizeOrders(orders) {
  const totals = { cash: 0, card: 0, transfer: 0, other: 0, credit: 0, total: 0, usd: 0, usdPesos: 0, count: orders.length };
  for (const o of orders) {
    if (o.paymentStatus !== 'paid') continue;
    const method = o.paymentMethod || 'other';
    const amount = Number(o.total || 0);

    if (method === 'split') {
      // Mixto: la parte de tarjeta va a card, el resto se queda en efectivo
      const cardPart = Math.min(amount, Math.max(0, Number(o.cardAmount || 0)));
      totals.card += cardPart;
      totals.cash += Number((amount - cardPart).toFixed(2));
    } else if (method === 'credit') {
      // Fiado: lo que quedó a deber no es dinero en caja; el anticipo sí es efectivo
      const down = Math.min(amount, Math.max(0, Number(o.downPayment || 0)));
      totals.cash += down;
      totals.credit += Number((amount - down).toFixed(2));
    } else if (totals[method] != null) {
      totals[method] += amount;
      // Lo pagado en dólares no son pesos en el cajón: se cuenta aparte (dólares y lo que valen en pesos)
      if (method === 'cash' && Number(o.usdPesos) > 0) {
        totals.cash -= Number(o.usdPesos);
        totals.usd += Number(o.usdReceived || 0);
        totals.usdPesos += Number(o.usdPesos);
      }
    } else {
      totals.other += amount;
    }
    totals.total += amount;
  }
  totals.cash = Number(totals.cash.toFixed(2));
  totals.card = Number(totals.card.toFixed(2));
  totals.credit = Number(totals.credit.toFixed(2));
  totals.usd = Number(totals.usd.toFixed(2));
  totals.usdPesos = Number(totals.usdPesos.toFixed(2));
  totals.total = Number(totals.total.toFixed(2));
  return totals;
}

module.exports = { summarizeOrders };

/**
 * Ingresos reales y parte de cada socio (solo para los dueños del software).
 * Lo cobrado sale del registro de cobros (`billing_events`, tipo `payment`), no de una estimación por plan.
 * Funciones puras: reciben lo que ya leyó la base.
 */
const { round2 } = require('../utils/tax');

const MP_NOTE = 'Cobro de la suscripción'; // la misma nota que pone el aviso de Mercado Pago

/** Rango [from, to] de un mes «AAAA-MM» en la zona del negocio (la misma de los números del panel). */
function monthRange(month, zonedToInstant) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  if (!m) return null;
  const [y, mo] = [Number(m[1]), Number(m[2])];
  const tz = 'America/Mexico_City';
  const from = zonedToInstant(y, mo, 1, 0, 0, 0, 0, tz);
  const next = zonedToInstant(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, 1, 0, 0, 0, 0, tz);
  return { from, to: new Date(next.getTime() - 1) };
}

/**
 * @param events   cobros del mes (billing_events tipo payment)
 * @param names    Map tenantId → { businessName, planName }
 * @param partners cuántos socios se reparten (partes iguales)
 * @param costs    { ai, expenses } del mismo mes
 */
function summarizePayments({ events, names = new Map(), partners = 3, costs = {} }) {
  const n = Math.max(1, Math.floor(Number(partners)) || 1);
  const payments = events
    .filter((e) => Number(e.amount) > 0)
    .map((e) => ({
      id: String(e.id),
      at: e.at,
      tenantId: String(e.tenantId),
      businessName: names.get(String(e.tenantId))?.businessName || 'Tienda eliminada',
      planName: names.get(String(e.tenantId))?.planName || e.plan || '',
      interval: e.interval === 'year' ? 'year' : 'month',
      amount: round2(e.amount),
      // Los cobros viejos (antes de guardar el id del pago) se reconocen por su nota
      source: e.mpPaymentId || e.note === MP_NOTE ? 'mercado_pago' : 'manual',
      note: e.note || '',
    }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  const collected = round2(payments.reduce((a, p) => a + p.amount, 0));
  const ai = round2(costs.ai);
  const expenses = round2(costs.expenses);
  const profit = round2(collected - ai - expenses);
  return {
    payments,
    count: payments.length,
    collected,
    costs: { ai, expenses },
    profit,
    // Parte de cada socio: partes iguales de lo cobrado y de la utilidad
    partners: n,
    perPartner: round2(collected / n),
    profitPerPartner: round2(profit / n),
  };
}

function csvOf(summary) {
  const cell = (v) => {
    const t = String(v ?? '');
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = summary.payments.map((p) =>
    [new Date(p.at).toISOString().slice(0, 10), p.businessName, p.planName, p.interval === 'year' ? 'Anual' : 'Mensual', p.amount.toFixed(2), p.source === 'mercado_pago' ? 'Mercado Pago' : 'Manual', p.note]
      .map(cell)
      .join(',')
  );
  return '﻿' + ['Fecha,Tienda,Plan,Cobro,Monto,Origen,Nota', ...rows].join('\n');
}

module.exports = { monthRange, summarizePayments, csvOf };

// Mantener idéntico a backend/utils/tax.js (lo comprueba backend/test/tax.test.js).
// Convención única: precios al cliente con IVA incluido. Cada renglón es «precio c/u con IVA
// (a centavos) × cantidad», el subtotal es la suma de renglones, el descuento se resta del
// subtotal y el IVA se desglosa del total («IVA incluido»).
// Sin anotaciones de tipo: la prueba del backend lo carga como JavaScript.

export const TAX_RATE = 0.16;

/** Redondea a centavos sin el error de flotantes (1.005 → 1.01). */
export function round2(value) {
  const n = Number(value) || 0;
  return Math.round(Number((n * 100).toPrecision(12))) / 100;
}

/** Tasa de IVA válida (0 a 1). 0% es una tasa real; solo sin dato se usa 16%. */
export function rateOf(value, fallback = TAX_RATE) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

/**
 * Desglosa una línea de venta.
 * - neto (priceIncludesTax=false): price es base; IVA se suma al cobrar
 * - bruto (priceIncludesTax=true): price ya incluye IVA; se desglosa
 * unitGross es el precio c/u que ve el cliente; gross = unitGross × cantidad (a centavos).
 */
export function lineBreakdown(price, quantity, priceIncludesTax, taxRate = TAX_RATE) {
  const qty = Number(quantity) || 0;
  const unit = Number(price) || 0;
  const rate = Number(taxRate) || 0;
  const includes = Boolean(priceIncludesTax);

  const unitGross = includes ? round2(unit) : round2(unit * (1 + rate));
  const gross = round2(unitGross * qty);
  const net = includes ? (rate > 0 ? gross / (1 + rate) : gross) : unit * qty;
  const tax = gross - net;
  return { net, tax, gross, unitGross };
}

/** Porcentaje de comisión por tarjeta de la tienda (0 a 30) como fracción. */
export function cardFeeRateOf(percent) {
  const n = Number(percent);
  return Number.isFinite(n) ? Math.min(30, Math.max(0, n)) / 100 : 0.04;
}

/**
 * cardExtraIva: se cobra la comisión por pago con tarjeta.
 * cardFeeRate: su porcentaje (0 a 0.3); sin dato usa la tasa de IVA, como antes.
 * Siempre se cumple: subtotal − discountAmount = payable = net + tax, y payable + cardExtraTax = total.
 */
export function cartTotals(items = [], { discountPercent = 0, taxRate = TAX_RATE, cardExtraIva = false, cardFeeRate = null } = {}) {
  let subtotal = 0;
  let subtotalNet = 0;

  for (const item of items) {
    const b = lineBreakdown(item.price, item.quantity, item.priceIncludesTax, taxRate);
    subtotal += b.gross;
    subtotalNet += b.net;
  }

  subtotal = round2(subtotal);
  subtotalNet = round2(subtotalNet);
  const subtotalTax = round2(subtotal - subtotalNet);

  const d = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountAmount = round2((subtotal * d) / 100);
  const payable = round2(subtotal - discountAmount);
  const scale = subtotal > 0 ? payable / subtotal : 1;
  const tax = round2(subtotalTax * scale);
  const net = round2(payable - tax);

  const feeRate = cardFeeRate == null ? taxRate : Math.min(0.3, Math.max(0, Number(cardFeeRate) || 0));
  const cardExtraTax = cardExtraIva ? round2(payable * feeRate) : 0;
  const total = round2(payable + cardExtraTax);

  return {
    taxRate,
    subtotalNet,
    subtotalTax,
    subtotal,
    discountPercent: d,
    discountAmount,
    payable,
    net,
    tax,
    cardExtraTax,
    cardExtraIva: Boolean(cardExtraIva),
    total,
  };
}

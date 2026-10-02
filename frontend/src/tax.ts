export const TAX_RATE = 0.16;

/** Tasa de IVA válida (0 a 1). 0% es una tasa real; solo sin dato se usa 16%. */
export function rateOf(value, fallback = TAX_RATE) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export function lineBreakdown(price, quantity, priceIncludesTax, taxRate = TAX_RATE) {
  const qty = Number(quantity) || 0;
  const unit = Number(price) || 0;
  const rate = Number(taxRate) || 0;
  const includes = Boolean(priceIncludesTax);

  if (includes) {
    const gross = unit * qty;
    const net = rate > 0 ? gross / (1 + rate) : gross;
    const tax = gross - net;
    return { net, tax, gross };
  }

  const net = unit * qty;
  const tax = net * rate;
  const gross = net + tax;
  return { net, tax, gross };
}

/** Porcentaje de comisión por tarjeta de la tienda (0 a 30) como fracción. */
export function cardFeeRateOf(percent) {
  const n = Number(percent);
  return Number.isFinite(n) ? Math.min(30, Math.max(0, n)) / 100 : 0.04;
}

/**
 * cardExtraIva: se cobra la comisión por pago con tarjeta.
 * cardFeeRate: su porcentaje (0 a 0.3); sin dato usa la tasa de IVA, como antes.
 */
export function cartTotals(items = [], { discountPercent = 0, taxRate = TAX_RATE, cardExtraIva = false, cardFeeRate = null } = {}) {
  let subtotalNet = 0;
  let subtotalTax = 0;
  let subtotalGross = 0;

  for (const item of items) {
    const b = lineBreakdown(item.price, item.quantity, item.priceIncludesTax, taxRate);
    subtotalNet += b.net;
    subtotalTax += b.tax;
    subtotalGross += b.gross;
  }

  const d = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountAmount = (subtotalGross * d) / 100;
  const scale = subtotalGross > 0 ? (subtotalGross - discountAmount) / subtotalGross : 1;
  const net = subtotalNet * scale;
  const tax = subtotalTax * scale;
  const payable = subtotalGross - discountAmount;
  const feeRate = cardFeeRate == null ? taxRate : Math.min(0.3, Math.max(0, Number(cardFeeRate) || 0));
  const cardExtraTax = cardExtraIva ? Math.round(payable * feeRate * 100) / 100 : 0;
  const total = payable + cardExtraTax;

  return {
    taxRate,
    subtotalNet,
    subtotalTax,
    subtotal: subtotalGross,
    discountPercent: d,
    discountAmount,
    net,
    tax,
    cardExtraTax,
    total,
  };
}

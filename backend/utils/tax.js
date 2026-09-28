const DEFAULT_TAX_RATE = 0.16;

/**
 * Desglosa una línea de venta.
 * - neto (priceIncludesTax=false): price es base; IVA se suma al cobrar
 * - bruto (priceIncludesTax=true): price ya incluye IVA; se desglosa
 */
function lineBreakdown(price, quantity, priceIncludesTax, taxRate = DEFAULT_TAX_RATE) {
  const qty = Number(quantity) || 0;
  const unit = Number(price) || 0;
  const rate = Number(taxRate) || 0;
  const includes = Boolean(priceIncludesTax);

  if (includes) {
    const gross = Number((unit * qty).toFixed(4));
    const net = rate > 0 ? Number((gross / (1 + rate)).toFixed(4)) : gross;
    const tax = Number((gross - net).toFixed(4));
    return { net, tax, gross, unitNet: qty ? net / qty : 0, unitGross: unit };
  }

  const net = Number((unit * qty).toFixed(4));
  const tax = Number((net * rate).toFixed(4));
  const gross = Number((net + tax).toFixed(4));
  return { net, tax, gross, unitNet: unit, unitGross: qty ? gross / qty : 0 };
}

function cartTotals(items = [], { discountPercent = 0, taxRate = DEFAULT_TAX_RATE, cardExtraIva = false } = {}) {
  let subtotalNet = 0;
  let subtotalTax = 0;
  let subtotalGross = 0;

  for (const item of items) {
    const b = lineBreakdown(item.price, item.quantity, item.priceIncludesTax, taxRate);
    subtotalNet += b.net;
    subtotalTax += b.tax;
    subtotalGross += b.gross;
  }

  subtotalNet = Number(subtotalNet.toFixed(2));
  subtotalTax = Number(subtotalTax.toFixed(2));
  subtotalGross = Number(subtotalGross.toFixed(2));

  const d = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountAmount = Number(((subtotalGross * d) / 100).toFixed(2));
  const scale = subtotalGross > 0 ? (subtotalGross - discountAmount) / subtotalGross : 1;
  const net = Number((subtotalNet * scale).toFixed(2));
  const tax = Number((subtotalTax * scale).toFixed(2));
  const payable = Number((subtotalGross - discountAmount).toFixed(2));

  const cardExtraTax = cardExtraIva ? Number((payable * taxRate).toFixed(2)) : 0;
  const total = Number((payable + cardExtraTax).toFixed(2));

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
    cardExtraIva: Boolean(cardExtraIva),
    total,
  };
}

module.exports = {
  DEFAULT_TAX_RATE,
  lineBreakdown,
  cartTotals,
};

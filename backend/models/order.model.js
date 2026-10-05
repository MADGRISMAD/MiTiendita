const crypto = require('crypto');
const { cartTotals, rateOf } = require('../utils/tax');
const { roundQty, saleUnitOf } = require('../utils/units');

const orderStatuses = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
const paymentMethods = ['cash', 'card', 'transfer', 'split', 'other'];

function normalizeOrder(body = {}) {
  const items = Array.isArray(body.items)
    ? body.items.map((item) => ({
        foodId: item.foodId || item.food || item.id || null,
        name: item.name || 'Producto',
        price: Number(item.price || 0),
        quantity: roundQty(item.quantity || 1),
        saleUnit: saleUnitOf(item.saleUnit),
        priceIncludesTax: Boolean(item.priceIncludesTax),
        notes: item.notes || '',
        // Cafetería: tamaño y extras (los valida y pone el servidor)
        ...(item.recipe
          ? {
              recipe: true,
              prep: Boolean(item.prep),
              sizeId: item.sizeId || null,
              sizeName: item.sizeName || '',
              modifierIds: Array.isArray(item.modifierIds) ? item.modifierIds.slice(0, 20) : [],
              modifiers: Array.isArray(item.modifiers) ? item.modifiers.slice(0, 20) : [],
            }
          : {}),
      }))
    : [];

  const modality =
    body.modality === 'takeaway'
      ? 'takeaway'
      : body.modality === 'dine-in'
        ? 'dine-in'
        : 'retail';
  const deliveryFee =
    modality === 'takeaway' ? Number(body.deliveryFee ?? 0) : 0;

  const taxRate = rateOf(body.taxRate);

  const totals = cartTotals(items, {
    discountPercent: body.discountPercent,
    taxRate,
    cardExtraIva: false,
  });

  const total = Number((totals.total + deliveryFee).toFixed(2));

  return {
    tableId: body.tableId || null,
    tableName: body.tableName || body.mesa || (modality === 'retail' ? 'Mostrador' : 'Sin mesa'),
    items,
    modality,
    status: orderStatuses.includes(body.status) ? body.status : 'pending',
    paymentStatus: body.paymentStatus === 'paid' ? 'paid' : 'unpaid',
    paymentMethod: paymentMethods.includes(body.paymentMethod) ? body.paymentMethod : null,
    taxRate: totals.taxRate,
    subtotal: totals.subtotal,
    subtotalNet: totals.subtotalNet,
    discountPercent: totals.discountPercent,
    discountAmount: totals.discountAmount,
    tax: totals.tax,
    cardExtraTax: 0,
    cardExtraIva: false,
    deliveryFee,
    total,
    notes: body.notes || body.description || '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

module.exports = {
  orderStatuses,
  paymentMethods,
  normalizeOrder,
  newToken: () => crypto.randomBytes(24).toString('hex'),
};

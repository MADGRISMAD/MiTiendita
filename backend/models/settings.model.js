const Joi = require('joi');

const settingsSchema = Joi.object({
  businessName: Joi.string().min(2).max(80).required(),
  businessType: Joi.string()
    .valid('abarrotes', 'convenience', 'pharmacy', 'hardware', 'other', 'restaurant', 'cafe', 'bar', 'hotel')
    .default('abarrotes'),
  address: Joi.string().allow('').max(200).optional(),
  phone: Joi.string().allow('').max(30).optional(),
  logoUrl: Joi.string().allow('').max(8_000_000).optional(),
  primaryColor: Joi.string()
    .pattern(/^#([0-9A-Fa-f]{6})$/)
    .default('#1F4D3A'),
  accentColor: Joi.string()
    .pattern(/^#([0-9A-Fa-f]{6})$/)
    .default('#C4A574'),
  timezone: Joi.string().default('America/Mexico_City'),
  initialTables: Joi.number().integer().min(0).max(100).default(0),
  /** Si true, todas las ventas restan existencias de cada producto */
  inventoryEnabled: Joi.boolean().default(false),
  /** Con inventario: si false, no se cobra una venta con más piezas de las que hay (responde 409) */
  allowNegativeStock: Joi.boolean().default(false),
  /** Cómo actualizar el costo al confirmar una compra: último o promedio ponderado */
  costMethod: Joi.string().valid('last', 'average').default('last'),
  /** Tasa de IVA configurable por tenant (default 0.16 = 16% México) */
  taxRate: Joi.number().min(0).max(1).default(0.16),
  /** Comisión que la tienda le suma al cliente cuando paga con tarjeta (compensa lo que cobra la terminal) */
  cardFeeEnabled: Joi.boolean().default(false),
  cardFeePercent: Joi.number().min(0).max(30).default(4),
  setupCompleted: Joi.boolean().default(true),
  updatedAt: Joi.date().optional(),
  createdAt: Joi.date().optional(),
});

module.exports = settingsSchema;

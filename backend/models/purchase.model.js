const Joi = require('joi');

const purchaseItemSchema = Joi.object({
  foodId: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(1_000_000).required(),
  unitCost: Joi.number().min(0).max(1_000_000).required(),
  lot: Joi.string().allow('').max(60).optional(),
  expiresAt: Joi.date().allow(null, '').optional(),
});

const purchaseSchema = Joi.object({
  supplierId: Joi.string().required(),
  date: Joi.date().required(),
  notes: Joi.string().allow('').max(400).optional(),
  items: Joi.array().items(purchaseItemSchema).min(1).max(200).required(),
});

module.exports = { purchaseSchema, purchaseItemSchema };

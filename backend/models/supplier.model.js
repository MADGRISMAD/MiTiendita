const Joi = require('joi');

const visitDay = Joi.number().integer().min(0).max(6);

const supplierSchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  contact: Joi.string().allow('').max(80).optional(),
  whatsapp: Joi.string().allow('').max(30).optional(),
  visitDays: Joi.array().items(visitDay).max(7).default([]),
  notes: Joi.string().allow('').max(400).optional(),
});

module.exports = { supplierSchema, visitDay };

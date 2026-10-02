const Joi = require('joi');
const { TENANT_ROLES } = require('./tenant.model');

const userSchema = Joi.object({
  name: Joi.string().required(),
  lastName: Joi.string().required(),
  email: Joi.string().email().required(),
  username: Joi.string().required(),
  password: Joi.string().required(),
  cellphone: Joi.string().min(10).max(10).required().pattern(/^\d{10}$/),
  role: Joi.string()
    .optional()
    .valid(...TENANT_ROLES)
    .default('admin'),
  businessName: Joi.string().optional().allow(''),
});

module.exports = userSchema;

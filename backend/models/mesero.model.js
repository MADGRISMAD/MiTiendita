const Joi = require('joi');
const meseroSchema = Joi.object({
    name: Joi.string().required(),
    lastName: Joi.string().required(),
    birthDate: Joi.date().optional().default(() => new Date()),
    startDate: Joi.date().optional().default(() => new Date()),
    cellphone: Joi.string().min(10).max(10).required().pattern(/^\d{10}$/),
    mesa: Joi.array().optional().default([]),
    role: Joi.string().valid('waiter').default('waiter'),
    workSchedule: Joi.string().optional().valid('morning', 'afternoon', 'evening').default('morning'),
    status: Joi.string().valid('active', 'rest').default('rest'),
    email: Joi.string().email().optional().allow(''),
});
module.exports = meseroSchema;

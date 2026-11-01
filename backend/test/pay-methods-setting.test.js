const test = require('node:test');
const assert = require('node:assert/strict');
const schema = require('../models/settings.model');

const base = { businessName: 'Abarrotes Lupe' };

test('se pueden apagar formas de pago: lista de las apagadas, sin repetir', () => {
  const ok = schema.validate({ ...base, disabledPayMethods: ['card', 'transfer', 'split', 'other'] });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.value.disabledPayMethods, ['card', 'transfer', 'split', 'other']);
  assert.ok(schema.validate({ ...base, disabledPayMethods: ['card', 'card'] }).error, 'repetidas no');
});

test('no deja apagar todas ni inventar formas de pago', () => {
  assert.ok(schema.validate({ ...base, disabledPayMethods: ['cash', 'card', 'transfer', 'split', 'credit', 'other'] }).error);
  assert.ok(schema.validate({ ...base, disabledPayMethods: ['bitcoin'] }).error);
});

test('guardar otros ajustes sin mandar la lista no la vuelve a encender (no hay valor por defecto)', () => {
  const { value } = schema.validate(base);
  assert.equal('disabledPayMethods' in value, false);
});

/**
 * backend/services/registers.service.js
 * Cajas de la tienda (hasta 4 según el plan). La caja se identifica por su NÚMERO (1–4).
 *
 * - La Caja 1 siempre existe. Las demás se crean al subir `count` y se desactivan (sin borrarse) al bajarlo,
 *   para conservar su terminal ligada.
 * - Al bajar de plan, las cajas por encima del límite se ocultan (`isOverPlan`) aunque sigan activas.
 *
 * Toda la lógica pasa por `store` para probarla sin base de datos (ver database/registers.db.js).
 */
const { httpError } = require('../utils/http-error');
const { registerLimitOf } = require('./plans.catalog');
const { assertRegisterCount } = require('./plan-limits.service');

const MAX_NAME = 30;
const defaultName = (n) => `Caja ${n}`;

function isOverPlan(register, plan) {
  return register.number > registerLimitOf(plan);
}

async function listRegisters(store, tenantId, plan) {
  const rows = await store.ListRegisters(tenantId);
  const visible = rows.filter((r) => r.active && !isOverPlan(r, plan));
  if (!visible.some((r) => r.number === 1)) {
    const one = rows.find((r) => r.number === 1);
    visible.unshift(one ? { ...one, active: true } : { number: 1, name: defaultName(1), terminalId: null, terminalLabel: null, active: true });
  }
  return visible.sort((a, b) => a.number - b.number);
}

async function saveRegisters(store, tenantId, plan, { count, names = [] }) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) throw httpError(400, 'Indica cuántas cajas quieres (mínimo 1).');
  assertRegisterCount(plan, n);
  const existing = await store.ListRegisters(tenantId);
  const byNumber = new Map(existing.map((r) => [r.number, r]));
  const rows = [];
  for (let i = 1; i <= n; i++) {
    const name = String((names || [])[i - 1] ?? '').trim() || defaultName(i);
    if (name.length > MAX_NAME) throw httpError(400, `El nombre de la caja debe tener máximo ${MAX_NAME} caracteres.`);
    const prev = byNumber.get(i);
    rows.push({ number: i, name, terminalId: prev?.terminalId || null, terminalLabel: prev?.terminalLabel || null, active: true });
  }
  for (const prev of existing) {
    if (prev.number > n) rows.push({ ...prev, active: false });
  }
  await store.ReplaceRegisters(tenantId, rows);
  return listRegisters(store, tenantId, plan);
}

module.exports = { listRegisters, saveRegisters, isOverPlan };

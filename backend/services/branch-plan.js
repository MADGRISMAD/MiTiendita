/**
 * Qué sucursales cubre el plan de la matriz. La matriz siempre cuenta; el resto se acomoda por antigüedad hasta
 * llenar el límite del plan (las dadas de baja a mano no ocupan lugar). Las que sobran quedan SIN ACCESO, pero
 * no se borra nada: si la matriz vuelve a un plan con más sucursales, recuperan el acceso solas.
 */
const { branchLimitOf } = require('./plans.catalog');

/** @param branches tiendas hijas de la organización: { id, createdAt, branchSuspendedAt } */
function blockedByPlan(branches, matrixPlan) {
  const room = Math.max(0, branchLimitOf(matrixPlan) - 1); // lugares para sucursales (la matriz ocupa uno)
  const inService = (branches || [])
    .filter((b) => !b.branchSuspendedAt)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || String(a.id).localeCompare(String(b.id)));
  return new Set(inService.slice(room).map((b) => String(b.id)));
}

module.exports = { blockedByPlan };

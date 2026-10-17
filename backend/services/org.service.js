/**
 * backend/services/org.service.js
 * Sucursales: varias tiendas bajo un mismo dueño, con cambio de una a otra y reporte consolidado.
 *
 * MODELO (ver docs/SUCURSALES.md)
 *  - Una sucursal ES una tienda (tenant): inventario, caja, clientes y equipo son propios y todo sigue
 *    aislándose por tenantId. La organización solo las agrupa.
 *  - La matriz es la tienda donde el dueño fundó la organización. El dueño es su administrador activo más antiguo.
 *  - Cada sucursal tiene una cuenta técnica de administrador, ligada al dueño (`linkedOwner`), sin correo y con una
 *    contraseña aleatoria que nadie conoce. Solo se entra con "cambiar de sucursal", que re-verifica al dueño.
 *  - Una sola suscripción: la de la matriz (ver overlayMatrix en database/mongodb.js).
 *
 * Toda la lógica pasa por `store` para probarla sin base de datos.
 */
const { branchLimitOf } = require('./plans.catalog');
const { isSubscriptionActive } = require('../models/tenant.model');
const { blockedByPlan } = require('./branch-plan');
const { httpError } = require('../utils/http-error');

const errNotOwner = () => httpError(403, 'Solo el dueño de la organización puede hacer esto.', 'NOT_ORG_OWNER');
const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim();

/**
 * Principal = quien hace la petición: { username, role, tenantId, linkedOwner }.
 * Devuelve { org, ownerUsername } si el principal ES el dueño de una organización (directamente o desde una
 * sucursal suya) y todo se verifica contra la base en esta petición; si no, null.
 */
async function resolveOrg(store, principal) {
  if (!principal || principal.role !== 'admin' || !principal.tenantId) return null;
  const ownerUsername = principal.linkedOwner || principal.username;
  const org = await store.getOrgByOwner(ownerUsername);
  if (!org) return null;
  const tenants = await store.listOrgTenants(org.id);
  if (!tenants.some((t) => String(t.id) === String(principal.tenantId))) return null;
  // El dueño debe seguir siendo administrador activo de la matriz
  const owner = await store.getUser(ownerUsername);
  if (!owner || owner.disabled || owner.role !== 'admin' || String(owner.tenantId) !== String(org.matrixTenantId)) return null;
  return { org, ownerUsername, tenants };
}

function planOf(matrix) {
  return branchLimitOf(matrix?.plan);
}
const inService = (t) => !t.branchSuspendedAt;

/** Lo que ve la pantalla de Sucursales. */
async function overview(store, principal) {
  const found = await resolveOrg(store, principal);
  if (found) {
    const { org, tenants } = found;
    const matrix = await store.getEffectiveTenant(org.matrixTenantId);
    const limit = planOf(matrix);
    const over = blockedByPlan(tenants.filter((t) => String(t.id) !== String(org.matrixTenantId)), matrix?.plan);
    const active = tenants.filter((t) => inService(t) && !over.has(String(t.id))).length;
    return {
      organization: { id: org.id, name: org.name },
      isOwner: true,
      currentTenantId: String(principal.tenantId),
      limit,
      active,
      canCreate: active < limit,
      plan: matrix?.plan || 'basic',
      branches: tenants.map((t) => ({
        id: String(t.id),
        name: t.name,
        isMatrix: String(t.id) === String(org.matrixTenantId),
        suspended: Boolean(t.branchSuspendedAt),
        overPlan: over.has(String(t.id)),
        current: String(t.id) === String(principal.tenantId),
      })),
    };
  }
  // Sin organización todavía: ¿puede fundarla?
  const tenant = principal?.tenantId ? await store.getEffectiveTenant(principal.tenantId) : null;
  const limit = planOf(tenant);
  let canFound = false;
  if (principal?.role === 'admin' && tenant && !tenant.isBranch && !tenant.organizationId && !principal.linkedOwner) {
    const oldest = await store.oldestActiveAdmin(principal.tenantId);
    canFound = Boolean(oldest && oldest.username === principal.username);
  }
  return { organization: null, isOwner: canFound, currentTenantId: String(principal?.tenantId || ''), limit, active: 1, canCreate: canFound && limit > 1, plan: tenant?.plan || 'basic', branches: [] };
}

/**
 * Crea una sucursal. La primera vez también funda la organización con la tienda actual como matriz.
 */
async function createBranch(store, principal, { name }) {
  const branchName = cleanName(name);
  if (branchName.length < 2 || branchName.length > 60) throw httpError(400, 'El nombre de la sucursal debe tener entre 2 y 60 letras.');
  if (!principal || principal.role !== 'admin') throw errNotOwner();

  let found = await resolveOrg(store, principal);
  let founding = false;
  let matrixId;
  let ownerUsername;
  if (found) {
    matrixId = found.org.matrixTenantId;
    ownerUsername = found.ownerUsername;
  } else {
    const here = await store.getEffectiveTenant(principal.tenantId);
    if (!here || here.isBranch || here.organizationId || principal.linkedOwner) throw errNotOwner();
    const oldest = await store.oldestActiveAdmin(principal.tenantId);
    if (!oldest || oldest.username !== principal.username) throw errNotOwner();
    founding = true;
    matrixId = principal.tenantId;
    ownerUsername = principal.username;
  }

  const matrix = await store.getEffectiveTenant(matrixId);
  if (!isSubscriptionActive(matrix)) throw httpError(403, 'Tu suscripción no está activa. Ve a Facturación.', 'SUBSCRIPTION_REQUIRED');
  const limit = planOf(matrix);
  const tenants = found ? found.tenants : [await store.getRawTenant(matrixId)];
  const active = tenants.filter(inService).length;
  if (active >= limit) {
    throw httpError(409, limit <= 1 ? 'Tu plan incluye una sola tienda. Cámbiate al plan Pro para abrir sucursales.' : `Tu plan permite hasta ${limit} sucursales (contando la matriz). Da de baja una o cambia de plan.`, 'BRANCH_LIMIT');
  }
  if (tenants.some((t) => cleanName(t.name).toLowerCase() === branchName.toLowerCase())) {
    throw httpError(409, 'Ya tienes una sucursal con ese nombre.', 'DUPLICATE_NAME');
  }

  // Si algo falla a mitad, se deshace lo creado para no dejar una sucursal sin acceso
  const undo = [];
  try {
    let org = found?.org;
    if (founding) {
      org = await store.createOrg({ name: cleanName(matrix.name) || 'Mi organización', ownerUsername, matrixTenantId: String(matrixId), createdAt: new Date() });
      undo.push(() => store.deleteOrg(org.id));
      await store.updateRawTenant(matrixId, { organizationId: org.id });
      undo.push(() => store.updateRawTenant(matrixId, { organizationId: null }));
    }
    const branch = await store.createBranchTenant({ name: branchName, organizationId: org.id, matrixTenantId: String(matrixId) });
    undo.push(() => store.deleteRawTenant(branch.id));
    await store.seedBranch({ matrixTenantId: String(matrixId), branchTenantId: String(branch.id), name: branchName });
    const linked = await store.createLinkedUser({ tenantId: String(branch.id), ownerUsername, branchName });
    undo.push(() => store.deleteUser(linked._id));
    await store.log(String(matrixId), { type: founding ? 'org_created' : 'branch_created', message: founding ? `Se creó la organización con la sucursal «${branchName}»` : `Nueva sucursal «${branchName}»`, meta: { branchId: String(branch.id) }, user: principal.username });
    return { branch: { id: String(branch.id), name: branchName }, organizationId: org.id, founded: founding };
  } catch (err) {
    for (const fn of undo.reverse()) await Promise.resolve(fn()).catch(() => {});
    throw err;
  }
}

async function rename(store, principal, name) {
  const found = await resolveOrg(store, principal);
  if (!found) throw errNotOwner();
  const n = cleanName(name);
  if (n.length < 2 || n.length > 60) throw httpError(400, 'El nombre debe tener entre 2 y 60 letras.');
  await store.updateOrg(found.org.id, { name: n });
  return { id: found.org.id, name: n };
}

/** Baja lógica (no se borra nada) y reactivación. */
async function setSuspended(store, principal, branchId, suspended) {
  const found = await resolveOrg(store, principal);
  if (!found) throw errNotOwner();
  const target = found.tenants.find((t) => String(t.id) === String(branchId));
  if (!target) throw httpError(404, 'Sucursal no encontrada.');
  if (String(target.id) === String(found.org.matrixTenantId)) throw httpError(400, 'La matriz no se puede dar de baja.');
  if (suspended) {
    if (String(target.id) === String(principal.tenantId)) throw httpError(400, 'No puedes dar de baja la sucursal en la que estás. Cámbiate a otra primero.');
    if (target.branchSuspendedAt) return { id: String(target.id), suspended: true };
    await store.updateRawTenant(target.id, { branchSuspendedAt: new Date() });
  } else {
    if (!target.branchSuspendedAt) return { id: String(target.id), suspended: false };
    const matrix = await store.getEffectiveTenant(found.org.matrixTenantId);
    if (found.tenants.filter(inService).length >= planOf(matrix)) {
      throw httpError(409, `Tu plan permite hasta ${planOf(matrix)} sucursales en servicio. Da de baja otra o cambia de plan.`, 'BRANCH_LIMIT');
    }
    await store.updateRawTenant(target.id, { branchSuspendedAt: null });
  }
  await store.log(String(found.org.matrixTenantId), { type: suspended ? 'branch_suspended' : 'branch_reactivated', message: `${suspended ? 'Baja' : 'Reactivación'} de la sucursal «${target.name}»`, meta: { branchId: String(target.id) }, user: principal.username });
  return { id: String(target.id), suspended: Boolean(suspended) };
}

/**
 * Cambiar de sucursal: devuelve la cuenta con la que hay que abrir la sesión nueva. Todo se re-verifica aquí:
 * que quien pide sea el dueño, que la sucursal sea de su organización y esté en servicio.
 */
async function switchTarget(store, principal, branchId) {
  const found = await resolveOrg(store, principal);
  if (!found) throw errNotOwner();
  const target = found.tenants.find((t) => String(t.id) === String(branchId));
  if (!target) throw httpError(404, 'Sucursal no encontrada.');
  if (target.branchSuspendedAt) throw httpError(409, 'Esta sucursal está dada de baja. Reactívala para entrar.', 'BRANCH_SUSPENDED');
  const isMatrix = String(target.id) === String(found.org.matrixTenantId);
  if (!isMatrix) {
    const matrix = await store.getEffectiveTenant(found.org.matrixTenantId);
    if (blockedByPlan(found.tenants.filter((t) => String(t.id) !== String(found.org.matrixTenantId)), matrix?.plan).has(String(target.id))) {
      throw httpError(409, 'El plan actual ya no incluye esta sucursal. Pasa a un plan con más sucursales para volver a usarla; tus datos se conservan.', 'BRANCH_OVER_PLAN');
    }
  }
  const user = isMatrix ? await store.getUser(found.ownerUsername) : await store.findLinkedUser(target.id, found.ownerUsername);
  if (!user || user.disabled) throw httpError(409, 'Esta sucursal no tiene cuenta de acceso. Contacta a soporte.', 'NO_BRANCH_ACCOUNT');
  await store.log(String(target.id), { type: 'branch_switch', message: `${found.ownerUsername} entró a «${target.name}»`, meta: { from: String(principal.tenantId) }, user: found.ownerUsername });
  return { user, tenant: target, isMatrix };
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Reporte consolidado: por sucursal y total. Los ids salen de la organización, nunca del cliente. */
async function consolidatedSummary(store, principal, { from, to }) {
  const found = await resolveOrg(store, principal);
  if (!found) throw errNotOwner();
  // El reporte consolidado es de los planes con sucursales, y solo cuenta las que el plan cubre
  const matrix = await store.getEffectiveTenant(found.org.matrixTenantId);
  if (planOf(matrix) <= 1) throw httpError(403, 'Tu plan actual no incluye sucursales ni el reporte consolidado. Pasa al plan Pro para volver a usarlo.', 'BRANCH_OVER_PLAN');
  const over = blockedByPlan(found.tenants.filter((x) => String(x.id) !== String(found.org.matrixTenantId)), matrix?.plan);
  found.tenants = found.tenants.filter((x) => !over.has(String(x.id)));
  const f = new Date(from);
  const t = new Date(to);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime()) || f > t) throw httpError(400, 'Rango de fechas inválido.');
  if (t - f > 2 * 366 * 86400000) throw httpError(400, 'El rango máximo es de 2 años.');
  // La matriz va primero: su zona horaria es la que se usa para partir los días
  const ids = [String(found.org.matrixTenantId), ...found.tenants.map((x) => String(x.id)).filter((i) => i !== String(found.org.matrixTenantId))];
  const [sales, daily, owed] = await Promise.all([store.salesByTenant(ids, f, t), store.dailySales(ids, f, t), store.balanceByTenant(ids)]);
  const byId = new Map(sales.map((r) => [r.tenantId, r]));
  const branches = found.tenants.map((x) => {
    const r = byId.get(String(x.id)) || {};
    const tickets = r.tickets || 0;
    return {
      id: String(x.id),
      name: x.name,
      isMatrix: String(x.id) === String(found.org.matrixTenantId),
      suspended: Boolean(x.branchSuspendedAt),
      sales: round2(r.sales),
      tickets,
      average: tickets ? round2((r.sales || 0) / tickets) : 0,
      refunded: r.refunded || 0,
      refundedTotal: round2(r.refundedTotal),
      credit: round2(r.credit),
      owed: round2(owed.get(String(x.id))),
    };
  });
  const total = branches.reduce(
    (a, b) => ({ sales: round2(a.sales + b.sales), tickets: a.tickets + b.tickets, refunded: a.refunded + b.refunded, refundedTotal: round2(a.refundedTotal + b.refundedTotal), credit: round2(a.credit + b.credit), owed: round2(a.owed + b.owed) }),
    { sales: 0, tickets: 0, refunded: 0, refundedTotal: 0, credit: 0, owed: 0 }
  );
  total.average = total.tickets ? round2(total.sales / total.tickets) : 0;
  const series = new Map();
  for (const d of daily) series.set(d.day, round2((series.get(d.day) || 0) + d.sales));
  return { from: f.toISOString(), to: t.toISOString(), branches, total, daily: [...series.entries()].map(([day, sales]) => ({ day, sales })) };
}

function toCsv(summary) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Sucursal', 'Ventas', 'Tickets', 'Ticket promedio', 'Devoluciones', 'Monto devuelto', 'Fiado en el periodo', 'Por cobrar hoy'];
  const row = (n, r) => [n, r.sales, r.tickets, r.average, r.refunded, r.refundedTotal, r.credit, r.owed];
  const rows = [...summary.branches.map((b) => row(b.name + (b.suspended ? ' (de baja)' : ''), b)), row('Total', summary.total)];
  return '﻿' + [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

module.exports = { resolveOrg, overview, createBranch, rename, setSuspended, switchTarget, consolidatedSummary, toCsv, httpError, errNotOwner };

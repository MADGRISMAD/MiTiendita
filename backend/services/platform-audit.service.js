/**
 * Bitácora de lo que hace el equipo de Mi Tiendita sobre los clientes y sobre sí mismo.
 * Vive en su propia colección (platform_audit): el dueño de una tienda nunca la ve.
 * Registrar nunca debe romper la acción que se está haciendo.
 */
const db = require('../database/db');

/**
 * @param req    petición (de ahí sale quién lo hizo)
 * @param entry  { tenantId?, type, message, meta? }
 */
async function record(req, { tenantId = null, type, message, meta = {} }) {
  try {
    await db.CreatePlatformAudit({
      tenantId: tenantId ? String(tenantId) : null,
      type: String(type || 'event'),
      message: String(message || '').slice(0, 300),
      meta,
      actor: req?.user?.username || '',
      actorRole: req?.user?.role || '',
      createdAt: new Date(),
    });
  } catch (err) {
    console.warn('[platform-audit] no se pudo guardar:', err.message);
  }
}

/** Lista legible de lo que cambió entre dos fotos de la tienda. */
function describeChanges(before = {}, after = {}, names = {}) {
  const out = [];
  const label = (map, key) => (map && map[key]) || key;
  if (before.plan !== after.plan && after.plan) {
    out.push(`plan ${label(names.plan, before.plan)} → ${label(names.plan, after.plan)}`);
  }
  if (before.billingStatus !== after.billingStatus && after.billingStatus) {
    out.push(`estado ${label(names.status, before.billingStatus)} → ${label(names.status, after.billingStatus)}`);
  }
  if (before.name !== after.name && after.name) out.push(`nombre «${before.name}» → «${after.name}»`);
  const trialBefore = before.trialEndsAt ? new Date(before.trialEndsAt).toISOString().slice(0, 10) : '';
  const trialAfter = after.trialEndsAt ? new Date(after.trialEndsAt).toISOString().slice(0, 10) : '';
  if (trialAfter && trialBefore !== trialAfter) out.push(`fin de prueba ${trialBefore || '—'} → ${trialAfter}`);
  return out;
}

module.exports = { record, describeChanges };

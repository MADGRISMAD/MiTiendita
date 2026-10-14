/**
 * Avisos cuando falla el cobro de la suscripción (dunning). La tienda sigue operando durante el periodo de gracia
 * (GRACE_DAYS, ver models/tenant.model.js) y recibe un correo el día 0, el 3 y el 6 con la liga para actualizar su tarjeta.
 * Cada aviso se guarda en `dunningSent` para no repetirse; se revisa varias veces al día.
 */
const { graceEndsAt, GRACE_DAYS } = require('../models/tenant.model');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTICE_DAYS = [0, 3, 6];

/** Qué aviso toca hoy (día 0, 3 o 6 del atraso) o null si ninguno / ya se mandó / la gracia terminó. */
function noticeDue(tenant, now = new Date()) {
  if ((tenant?.billingStatus || '') !== 'past_due' || !tenant.pastDueSince) return null;
  const elapsed = Math.floor((now.getTime() - new Date(tenant.pastDueSince).getTime()) / DAY_MS);
  if (elapsed < 0 || elapsed >= GRACE_DAYS) return null;
  const sent = new Set(tenant.dunningSent || []);
  // El más reciente que ya toca y no se ha mandado (si el servidor estuvo caído un día, se manda el vigente)
  const day = NOTICE_DAYS.filter((d) => d <= elapsed && !sent.has(d)).pop();
  return day === undefined ? null : { day, daysLeft: GRACE_DAYS - elapsed };
}

/** Manda los avisos que toquen. `deps.emailFor(tenant)` da el correo del dueño. Devuelve cuántos salieron. */
async function sendDue(db, mail, { emailFor, appUrl = process.env.APP_URL || 'https://www.mitiendita.software', now = new Date() }) {
  let sent = 0;
  for (const tenant of await db.ListTenants({ includeBranches: false })) {
    const due = noticeDue(tenant, now);
    if (!due) continue;
    // Se reserva el aviso ANTES de enviar: con dos instancias solo una lo manda
    if (!(await db.ClaimDunningNotice(tenant.id, due.day))) continue;
    try {
      const to = await emailFor(tenant);
      if (!to) throw new Error('la tienda no tiene correo');
      const settings = await db.GetSettings(tenant.id);
      const res = await mail.sendPaymentFailedEmail({
        to,
        businessName: settings?.businessName || tenant.name,
        daysLeft: due.daysLeft,
        graceEndsAt: graceEndsAt(tenant).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
        appUrl: appUrl.replace(/\/$/, ''),
      });
      if (res?.sent === false) throw new Error(res.error || 'no se envió');
      sent += 1;
    } catch (err) {
      console.warn('[dunning] aviso no enviado, se reintenta:', err.message);
      await db.ReleaseDunningNotice(tenant.id, due.day).catch(() => {});
    }
  }
  return sent;
}

module.exports = { noticeDue, sendDue, NOTICE_DAYS };

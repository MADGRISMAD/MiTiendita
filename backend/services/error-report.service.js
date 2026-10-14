/**
 * Registro de errores (Sentry). Sin SENTRY_DSN no hace nada: se puede llamar desde cualquier lado sin riesgo.
 * Nunca lanza: reportar un error no debe causar otro. Los datos que se mandan se limitan a tienda, usuario y ruta.
 */
let sentry = null;
let started = false;

function init() {
  if (started) return Boolean(sentry);
  started = true;
  const dsn = String(process.env.SENTRY_DSN || '').trim();
  if (!dsn) return false;
  try {
    sentry = require('@sentry/node');
    sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'production',
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
    return true;
  } catch (err) {
    console.warn('[sentry] no se pudo iniciar:', err.message);
    sentry = null;
    return false;
  }
}

function scoped(ctx, fn) {
  if (!sentry) return;
  try {
    sentry.withScope((scope) => {
      if (ctx.tenantId) scope.setTag('tenantId', String(ctx.tenantId));
      if (ctx.where) scope.setTag('where', String(ctx.where));
      if (ctx.user) scope.setUser({ username: String(ctx.user) });
      if (ctx.extra) scope.setExtras(ctx.extra);
      fn();
    });
  } catch {
    /* reportar nunca debe fallar */
  }
}

/** Un error (excepción) con su contexto. */
function captureError(err, ctx = {}) {
  scoped(ctx, () => sentry.captureException(err));
}

/** Algo grave que no es una excepción (p. ej. un webhook rechazado). */
function captureMessage(message, ctx = {}) {
  scoped(ctx, () => sentry.captureMessage(String(message).slice(0, 300), ctx.level || 'error'));
}

/** Contexto a partir de la petición de Express. */
function fromReq(req, where) {
  return { tenantId: req?.tenantId, user: req?.user?.username, where: where || `${req?.method} ${req?.baseUrl || ''}${req?.route?.path || ''}` };
}

module.exports = { init, captureError, captureMessage, fromReq };

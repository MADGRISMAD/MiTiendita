/**
 * «Última vez que entraron»: cuenta tanto el inicio de sesión (lastLoginAt) como la actividad con la sesión ya abierta (lastSeenAt).
 * Sin esto, quien se queda con la sesión abierta días enteros aparecía con la fecha de su último inicio de sesión.
 */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
const lastTouch = new Map();

/** Fecha más reciente entre el último inicio de sesión y la última actividad (null si nunca). */
function lastActive(user) {
  const a = user?.lastSeenAt ? new Date(user.lastSeenAt) : null;
  const b = user?.lastLoginAt ? new Date(user.lastLoginAt) : null;
  if (a && b) return a > b ? a : b;
  return a || b || null;
}

/** true si toca anotar la actividad de este usuario (como mucho una vez cada 5 minutos). */
function shouldTouch(userId, now = Date.now()) {
  const key = String(userId || '');
  if (!key) return false;
  const prev = lastTouch.get(key) || 0;
  if (now - prev < TOUCH_EVERY_MS) return false;
  if (lastTouch.size > 5000) lastTouch.clear();
  lastTouch.set(key, now);
  return true;
}

module.exports = { lastActive, shouldTouch, TOUCH_EVERY_MS };

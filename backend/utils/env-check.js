/**
 * Revisión de variables de entorno al arrancar.
 *  - Falta SECRET_KEY o DATABASE_URI → error (el servidor no debe arrancar a medias).
 *  - Clave débil (corta, de ejemplo) o falta una llave de la terminal Mercado Pago → aviso fuerte; solo detiene el arranque si REQUIRE_STRONG_SECRETS=1,
 *    para no tumbar un servidor que hoy funciona con una clave vieja. Cambiar la clave cierra todas las sesiones.
 */
const WEAK = new Set(['change-me-in-production', 'cambia-esta-clave', 'changeme', 'secret', 'password', 'timber']);
const MIN_LENGTH = 32;

function isWeakSecret(value) {
  const v = String(value ?? '').trim();
  return v.length < MIN_LENGTH || WEAK.has(v.toLowerCase());
}

/** Devuelve { errors, warnings } sin lanzar ni imprimir (se puede probar). */
function checkEnv(env = process.env) {
  const errors = [];
  const warnings = [];
  if (!String(env.SECRET_KEY || '').trim()) {
    errors.push('Falta SECRET_KEY: sin ella no se pueden firmar las sesiones.');
  } else if (isWeakSecret(env.SECRET_KEY)) {
    warnings.push(`SECRET_KEY es débil (usa al menos ${MIN_LENGTH} caracteres al azar: «openssl rand -hex 32»).`);
  }
  if (!String(env.DATABASE_URI || '').trim()) errors.push('Falta DATABASE_URI.');
  // Terminal Mercado Pago: guarda tokens de cada tienda cifrados con estas llaves
  if (String(env.MP_CLIENT_ID || '').trim()) {
    for (const key of ['TOKEN_ENC_KEY', 'OAUTH_STATE_SECRET']) {
      if (!String(env[key] || '').trim()) warnings.push(`Falta ${key}: la terminal Mercado Pago no podrá guardar las cuentas de las tiendas.`);
    }
  }
  return { errors, warnings };
}

/** Para app.js: en producción aborta si faltan variables y avisa de las débiles. */
function assertEnv(env = process.env, log = console) {
  if (env.NODE_ENV !== 'production') return;
  const { errors, warnings } = checkEnv(env);
  for (const w of warnings) log.warn(`[env] ⚠ ${w}`);
  const strict = env.REQUIRE_STRONG_SECRETS === '1' && warnings.length;
  if (errors.length || strict) {
    for (const e of errors) log.error(`[env] ✖ ${e}`);
    if (strict) log.error('[env] ✖ REQUIRE_STRONG_SECRETS=1: se detiene el arranque por la clave débil.');
    throw new Error('Configuración del servidor incompleta o insegura');
  }
}

module.exports = { checkEnv, assertEnv, isWeakSecret, MIN_LENGTH };

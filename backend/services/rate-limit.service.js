/**
 * Límite de peticiones por ventana fija.
 * El conteo vive en MongoDB (colección rate_limits con TTL) para que valga entre varias
 * instancias o funciones serverless; si la base falla, usa memoria y no bloquea a nadie por error.
 */

function memoryStore() {
  const hits = new Map();
  return {
    async hit(id, expiresAt) {
      const now = Date.now();
      for (const [k, v] of hits) if (v.expiresAt <= now) hits.delete(k);
      const row = hits.get(id) || { count: 0, expiresAt };
      row.count += 1;
      hits.set(id, row);
      return row.count;
    },
  };
}

function mongoStore(getCollection) {
  let indexed = false;
  return {
    async hit(id, expiresAt) {
      const col = getCollection();
      if (!col) throw new Error('sin base de datos');
      if (!indexed) {
        indexed = true;
        col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {});
      }
      const doc = await col.findOneAndUpdate(
        { _id: id },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(expiresAt) } },
        { upsert: true, returnDocument: 'after' }
      );
      const row = doc && doc.value !== undefined ? doc.value : doc;
      return Number(row?.count) || 1;
    },
  };
}

const fallback = memoryStore();

/**
 * @param {object} opts
 * @param {string} opts.name      nombre del límite (parte de la llave)
 * @param {number} opts.windowMs  tamaño de la ventana
 * @param {number} opts.max       peticiones permitidas por ventana
 * @param {(req) => string} [opts.key] de quién se cuenta (por omisión la IP)
 * @param {object} [opts.store]   { hit(id, expiresAt) → count }
 * @param {string} [opts.message]
 */
function rateLimit({ name, windowMs, max, key, store, message } = {}) {
  const keyOf = key || ((req) => req.ip || req.headers?.['x-forwarded-for'] || 'unknown');
  const text = message || 'Demasiados intentos. Espera un momento y vuelve a intentar.';
  return async function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetAt = windowStart + windowMs;
    const who = String(keyOf(req) || 'unknown').slice(0, 200);
    const id = `${name}:${who}:${windowStart}`;
    let count;
    try {
      count = await (store || defaultStore()).hit(id, resetAt);
    } catch {
      count = await fallback.hit(id, resetAt);
    }
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((resetAt - now) / 1000)));
    if (count > max) {
      res.setHeader('Retry-After', String(Math.ceil((resetAt - now) / 1000)));
      return res.status(429).send(text);
    }
    return next();
  };
}

let shared = null;
function defaultStore() {
  if (!shared) {
    // Se carga tarde para no abrir la base al importar (pruebas)
    const db = require('../database/mongodb');
    shared = mongoStore(() => db.getCollection?.('rate_limits'));
  }
  return shared;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** Límites de la app (por IP salvo que se indique). */
const limits = {
  global: () => rateLimit({ name: 'global', windowMs: 5 * MIN, max: 1500 }),
  login: () =>
    rateLimit({ name: 'login', windowMs: 15 * MIN, max: 20, message: 'Demasiados intentos de entrar. Espera 15 minutos.' }),
  register: () =>
    rateLimit({ name: 'register', windowMs: HOUR, max: 5, message: 'Demasiadas cuentas creadas desde esta red. Intenta en una hora.' }),
  referral: () =>
    rateLimit({ name: 'referral', windowMs: 10 * 60 * 1000, max: 30, message: 'Demasiadas consultas. Espera un momento.' }),
  forgot: () =>
    rateLimit({ name: 'forgot', windowMs: HOUR, max: 5, message: 'Ya pediste varios enlaces. Revisa tu correo o intenta en una hora.' }),
  reset: () => rateLimit({ name: 'reset', windowMs: HOUR, max: 10 }),
  mfa: () => rateLimit({ name: 'mfa', windowMs: 15 * MIN, max: 15, message: 'Demasiados códigos. Espera 15 minutos.' }),
  refresh: () => rateLimit({ name: 'refresh', windowMs: 5 * MIN, max: 120 }),
  publicRead: () => rateLimit({ name: 'public-read', windowMs: 10 * MIN, max: 120 }),
  publicWrite: () => rateLimit({ name: 'public-write', windowMs: HOUR, max: 15 }),
};

module.exports = { rateLimit, memoryStore, mongoStore, limits };

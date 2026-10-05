/**
 * Sesiones: access token corto (JWT, 15 min) + refresh token en cookie HttpOnly.
 * - El refresh se guarda solo como hash en la colección `sessions` y rota en cada uso.
 * - Si alguien usa un refresh ya rotado (robado), se revocan todas las sesiones de esa persona.
 * - Cambiar o restablecer la contraseña sube `tokenVersion`: los access tokens viejos dejan de servir.
 */
const crypto = require('crypto');
const db = require('../database/mongodb');
const { generateJWT } = require('../utils/jwt.utils');
const { normalizeRole } = require('../models/tenant.model');

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Dos pestañas que refrescan casi a la vez: la segunda llega con el token recién rotado
const ROTATION_GRACE_MS = 30 * 1000;
const COOKIE = 'mt_rt';

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

function cookieFlags(req) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(req?.secure);
  return `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function setRefreshCookie(req, res, token) {
  res.append(
    'Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; ${cookieFlags(req)}; Max-Age=${Math.floor(REFRESH_TTL_MS / 1000)}`
  );
}

function clearRefreshCookie(req, res) {
  res.append('Set-Cookie', `${COOKIE}=; ${cookieFlags(req)}; Max-Age=0`);
}

function readRefreshCookie(req) {
  return parseCookies(req.headers?.cookie)[COOKIE] || '';
}

function profileOf(user) {
  return {
    role: normalizeRole(user.role),
    tenantId: user.tenantId || null,
    partnerId: user.partnerId || null,
    username: user.username,
    email: String(user.email || '').trim().toLowerCase(),
  };
}

function accessTokenFor(user) {
  return generateJWT(
    {
      userId: user.username,
      userRole: normalizeRole(user.role),
      tenantId: user.tenantId || null,
      partnerId: user.partnerId || null,
      email: String(user.email || '').trim().toLowerCase(),
      tv: Number(user.tokenVersion) || 0,
    },
    ACCESS_TTL
  );
}

/** Abre una sesión: guarda el refresh, pone la cookie y devuelve el cuerpo de la respuesta. */
async function startSession(req, res, user) {
  const refresh = crypto.randomBytes(32).toString('base64url');
  await db.CreateSession({
    userId: String(user._id),
    username: user.username,
    tokenHash: hashToken(refresh),
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
    ip: String(req.ip || '').slice(0, 60),
    revokedAt: null,
  });
  setRefreshCookie(req, res, refresh);
  return { token: accessTokenFor(user), ...profileOf(user) };
}

function sessionError(message = 'Tu sesión terminó. Vuelve a entrar.') {
  const err = new Error(message);
  err.status = 401;
  return err;
}

/** Cambia el refresh de la cookie por uno nuevo y entrega un access token. */
async function refreshSession(req, res) {
  const token = readRefreshCookie(req);
  if (!token) throw sessionError();
  const session = await db.FindSessionByHash(hashToken(token));
  if (!session) throw sessionError();

  if (session.revokedAt) {
    const recent = session.replacedAt && Date.now() - new Date(session.replacedAt).getTime() < ROTATION_GRACE_MS;
    if (!recent) {
      // Refresh viejo usado otra vez: posible robo. Se cierran todas sus sesiones.
      await db.RevokeUserSessions(session.userId, 'reuse');
      clearRefreshCookie(req, res);
      throw sessionError();
    }
  } else if (new Date(session.expiresAt).getTime() <= Date.now()) {
    clearRefreshCookie(req, res);
    throw sessionError();
  }

  const user = await db.FindUserById(session.userId);
  if (!user || user.disabled) {
    await db.RevokeUserSessions(session.userId, 'disabled');
    clearRefreshCookie(req, res);
    throw sessionError();
  }

  if (session.revokedAt) {
    // Dentro de la gracia: la otra pestaña ya rotó y su cookie nueva es la del navegador
    return { token: accessTokenFor(user), ...profileOf(user) };
  }
  const rotated = await db.RevokeSession(session._id, { replacedAt: new Date(), revokedReason: 'rotated' });
  if (!rotated) return { token: accessTokenFor(user), ...profileOf(user) };
  return startSession(req, res, user);
}

async function endSession(req, res) {
  const token = readRefreshCookie(req);
  if (token) {
    const session = await db.FindSessionByHash(hashToken(token));
    if (session) await db.RevokeSession(session._id, { revokedReason: 'logout' });
  }
  clearRefreshCookie(req, res);
}

/** Cierra todas las sesiones de la persona (cambio de contraseña, baja). */
async function revokeAll(user, reason) {
  await db.RevokeUserSessions(String(user._id), reason);
  const updated = await db.BumpUserTokenVersion(String(user._id));
  forgetUser(user.username);
  return updated || user;
}

// —— Validación del access token (versión y estado) con caché corta por instancia ——
const CACHE_MS = 30 * 1000;
const cache = new Map();
function forgetUser(username) {
  cache.delete(String(username || ''));
}
async function currentUserState(username) {
  const key = String(username || '');
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CACHE_MS) return hit.state;
  const user = await db.FindUserByUsername(key);
  const state = user
    ? {
        exists: true,
        tokenVersion: Number(user.tokenVersion) || 0,
        role: normalizeRole(user.role),
        disabled: Boolean(user.disabled),
        mfaEnabled: Boolean(user.mfaEnabled),
        partnerId: user.partnerId || null,
      }
    : { exists: false };
  cache.set(key, { at: Date.now(), state });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return state;
}

module.exports = {
  ACCESS_TTL,
  COOKIE,
  hashToken,
  parseCookies,
  startSession,
  refreshSession,
  endSession,
  revokeAll,
  forgetUser,
  currentUserState,
  accessTokenFor,
  profileOf,
};

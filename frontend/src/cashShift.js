// Cuánto lleva abierta la caja y qué se puede hacer:
//  - antes de 12 h: todo normal;
//  - a las 12 h sale la alerta: hacer el corte ahora o elegir una hora para hacerlo (se puede posponer UNA sola vez por turno);
//  - mientras está pospuesto se puede seguir vendiendo, pero solo hasta la hora elegida y nunca más allá de las 15 h de turno;
//  - pasado ese límite (o si ya se pospuso una vez) la venta queda bloqueada hasta hacer el corte.
// Lo pospuesto se guarda en este dispositivo (el servidor no bloquea ventas por tiempo).
import { reactive } from "vue";

export const LIMIT_HOURS = 12;
export const MAX_HOURS = 15;
const HOUR = 3600000;
const STEP = 15 * 60000;
const KEY = "timber_cash_postpone";

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    return { sessionId: String(raw.sessionId || ""), until: Number(raw.until) || 0 };
  } catch {
    return { sessionId: "", until: 0 };
  }
}

export const postponeState = reactive(read());

export function openedMs(session) {
  const d = session?.openedAt || session?.createdAt;
  const t = d ? new Date(d).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
}

export function sessionKey(session) {
  return String(session?.id || session?._id || session?.openedAt || session?.createdAt || "");
}

const postponedUntil = (session) => (postponeState.sessionId && postponeState.sessionId === sessionKey(session) ? postponeState.until : 0);

/**
 * state: 'ok' | 'ask' (pasó de 12 h y falta decidir) | 'postponed' (se puede vender hasta `until`) | 'blocked' (hay que hacer el corte).
 * `postponed` en true = ya se usó la única prórroga de este turno.
 */
export function shiftStatus(session, now = Date.now()) {
  const opened = openedMs(session);
  if (opened == null) return { state: "ok", hours: 0, postponed: false };
  const hours = Math.max(0, now - opened) / HOUR;
  const limitAt = opened + LIMIT_HOURS * HOUR;
  const maxAt = opened + MAX_HOURS * HOUR;
  const until = Math.min(postponedUntil(session), maxAt);
  const base = { hours, opened, limitAt, maxAt, until, postponed: Boolean(postponedUntil(session)) };
  if (now < limitAt) return { ...base, state: "ok" };
  if (now >= maxAt) return { ...base, state: "blocked" };
  if (base.postponed) return { ...base, state: now < until ? "postponed" : "blocked" };
  return { ...base, state: "ask" };
}

export const isBlocking = (status) => status.state === "ask" || status.state === "blocked";

/** Horas que se pueden elegir para hacer el corte: cada 15 min desde ahora hasta las 15 h de turno (esa última cuenta). */
export function postponeOptions(session, now = Date.now()) {
  const opened = openedMs(session);
  if (opened == null) return [];
  const maxAt = opened + MAX_HOURS * HOUR;
  const out = [];
  for (let t = Math.ceil((now + 1) / STEP) * STEP; t < maxAt; t += STEP) out.push(t);
  if (maxAt > now) out.push(maxAt);
  return out;
}

/** Pospone el corte a la hora `until`. Solo una vez por turno, hacia el futuro y sin pasar de las 15 h. Devuelve true si se guardó. */
export function postponeCut(session, until, now = Date.now()) {
  const opened = openedMs(session);
  const key = sessionKey(session);
  const t = Number(until);
  if (opened == null || !key || postponedUntil(session) || !(t > now) || t > opened + MAX_HOURS * HOUR) return false;
  postponeState.sessionId = key;
  postponeState.until = t;
  try {
    localStorage.setItem(KEY, JSON.stringify({ sessionId: key, until: t }));
  } catch {
    /* sin almacenamiento: vale mientras la pestaña siga abierta */
  }
  return true;
}

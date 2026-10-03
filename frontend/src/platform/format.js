// Formato y etiquetas del área de plataforma (soporte y administración de Mi Tiendita).
// Sin imports: la prueba del backend lo carga como módulo (backend/test/platform-ui.test.js).

export const PLAN_NAMES = { basic: "Básico", growth: "Crecimiento", pro: "Pro", perpetual: "Perpetua" };

export const STATUS = {
  trialing: { label: "Prueba", tone: "info" },
  active: { label: "Activo", tone: "good" },
  past_due: { label: "Pago atrasado", tone: "warn" },
  suspended: { label: "Suspendido", tone: "bad" },
};

const moneyFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const moneyFmtCents = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

export function money(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? moneyFmt.format(v) : moneyFmtCents.format(v);
}

export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** «hace 5 min», «hace 3 h», «ayer», «hace 4 días», «hace 2 meses». */
export function ago(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return "—";
  const diff = now - d.getTime();
  if (diff < 0) return "ahora";
  if (diff < MIN) return "justo ahora";
  if (diff < HOUR) return `hace ${Math.floor(diff / MIN)} min`;
  if (diff < DAY) return `hace ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
  return `hace ${Math.floor(months / 12)} ${Math.floor(months / 12) === 1 ? "año" : "años"}`;
}

/** Días completos que faltan (negativo si ya pasó). null si no hay fecha. */
export function daysUntil(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return null;
  return Math.ceil((d.getTime() - now) / DAY);
}

/** Cuánto lleva esperando algo: sirve para pintar de rojo lo que ya es tarde. */
export function waitTone(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return "";
  const hours = (now - d.getTime()) / HOUR;
  if (hours >= 24) return "bad";
  if (hours >= 4) return "warn";
  return "";
}

export function shortDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function dateTime(value) {
  const d = toDate(value);
  return d
    ? d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}

export function hueOf(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Estado legible de una tienda (la perpetua activa se muestra como «Perpetua»). */
export function statusOf(client) {
  if (client?.isPerpetual && client.billingStatus === "active") return { label: "Perpetua", tone: "info" };
  return STATUS[client?.billingStatus] || STATUS.trialing;
}

/** Texto de salud de una tienda: cuánto hace que alguien entró. */
export function lastSeen(client, now = Date.now()) {
  const d = toDate(client?.lastSeenAt);
  return d ? ago(d, now) : "nunca ha entrado";
}

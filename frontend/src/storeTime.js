// Fechas y horas en la zona de la tienda (Configuración → zona horaria), no la del equipo.
// Mantener idéntico a backend/utils/store-time.js (lo comprueba backend/test/store-time.test.js).
// Sin imports: la prueba del backend lo carga como módulo.

export const DEFAULT_TZ = "America/Mexico_City";

const partsFormatters = new Map();
function partsFormatter(tz) {
  let fmt = partsFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, fmt);
  }
  return fmt;
}

/** Zona válida; si la guardada no existe, la de México. */
export function validTz(tz) {
  const zone = String(tz || "").trim() || DEFAULT_TZ;
  try {
    partsFormatter(zone);
    return zone;
  } catch {
    return DEFAULT_TZ;
  }
}

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Año, mes (1-12), día, hora, minuto, segundo y día de la semana (0 = domingo) en la tienda. */
export function storeParts(value, tz) {
  const d = toDate(value);
  if (!d) return null;
  const out = {};
  for (const p of partsFormatter(validTz(tz)).formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  const parts = {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second,
  };
  parts.weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return parts;
}

/** Formatea con Intl en la zona de la tienda. */
export function formatStoreDate(value, tz, options = { dateStyle: "medium", timeStyle: "short" }) {
  const d = toDate(value);
  if (!d) return "";
  return new Intl.DateTimeFormat("es-MX", { ...options, timeZone: validTz(tz) }).format(d);
}

const pad = (n) => String(n).padStart(2, "0");

/** «HH:MM» en la tienda. */
export function storeClock(value, tz) {
  const p = storeParts(value, tz);
  return p ? `${pad(p.hour)}:${pad(p.minute)}` : "";
}

/** «AAAA-MM-DD» del día en la tienda. */
export function storeDayKey(value, tz) {
  const p = storeParts(value, tz);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : "";
}

/**
 * «Hora de pared»: un Date cuyos getHours()/getDate()… dan la hora de la tienda.
 * Sirve para hacer cuentas de calendario (inicio del día, sumar días) sin importar la zona del equipo.
 * No mandarlo al servidor: para eso está fromStoreWall().
 */
export function toStoreWall(value, tz) {
  const p = storeParts(value, tz);
  if (!p) return null;
  const d = toDate(value);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, d.getMilliseconds());
}

/** Instante real que corresponde a una hora de pared de la tienda (inversa de toStoreWall). */
export function fromStoreWall(wall, tz) {
  const w = toDate(wall);
  if (!w) return null;
  return zonedToInstant(
    w.getFullYear(), w.getMonth() + 1, w.getDate(), w.getHours(), w.getMinutes(), w.getSeconds(), w.getMilliseconds(), tz
  );
}

/** Instante de una fecha y hora dadas en la tienda (mes 1-12). */
export function zonedToInstant(year, month, day, hour = 0, minute = 0, second = 0, ms = 0, tz) {
  const zone = validTz(tz);
  const target = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p = storeParts(new Date(guess), zone);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, ms);
    const diff = target - seen;
    if (!diff) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Inicio y fin (incluido) del día «AAAA-MM-DD» en la tienda. */
export function storeDayRange(dayKey, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ""));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const from = zonedToInstant(y, mo, d, 0, 0, 0, 0, tz);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const to = new Date(
    zonedToInstant(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, 0, tz).getTime() - 1
  );
  return { from, to };
}

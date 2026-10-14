/**
 * Corre una tarea programada con candado: con varias instancias del servidor solo una la ejecuta,
 * y queda anotado cuándo corrió la última vez (colección `job_runs`) y si salió bien.
 * Nunca lanza: una tarea que falla no debe tumbar el proceso.
 */
const errorReport = require('./error-report.service');

/** @returns {Promise<{ran: boolean, ok?: boolean, result?: any}>} */
async function runJob(db, name, ttlMs, fn, log = console) {
  let locked = false;
  try {
    locked = await db.AcquireJobLock(name, ttlMs);
    if (!locked) return { ran: false };
  } catch (err) {
    log.warn(`[tarea ${name}] no se pudo tomar el candado:`, err.message);
    return { ran: false };
  }
  const started = Date.now();
  try {
    const result = await fn();
    await db.FinishJob(name, { ok: true, ms: Date.now() - started }).catch(() => {});
    return { ran: true, ok: true, result };
  } catch (err) {
    log.warn(`[tarea ${name}] falló:`, err.message);
    errorReport.captureError(err, { where: `tarea ${name}` });
    await db.FinishJob(name, { ok: false, error: String(err.message).slice(0, 300), ms: Date.now() - started }).catch(() => {});
    return { ran: true, ok: false };
  }
}

/** Cada cuánto debería haber corrido como mínimo cada tarea (con margen) antes de considerarla detenida. */
const MAX_AGE_MS = { promociones: 36 * 60 * 60 * 1000, 'resumen-diario': 2 * 60 * 60 * 1000, 'avisos-de-pago': 3 * 60 * 60 * 1000 };

/** Estado de salud de las tareas: una que nunca ha corrido (p. ej. sin correo configurado) no cuenta como detenida. */
function jobsHealth(runs, now = new Date()) {
  const jobs = runs.map((r) => {
    const age = r.lastRunAt ? now.getTime() - new Date(r.lastRunAt).getTime() : null;
    const stale = age != null && MAX_AGE_MS[r.name] != null && age > MAX_AGE_MS[r.name];
    return { name: r.name, lastRunAt: r.lastRunAt, lastOk: r.lastOk, lastError: r.lastError, stale };
  });
  return { ok: jobs.every((j) => !j.stale && j.lastOk !== false), jobs };
}

module.exports = { runJob, jobsHealth, MAX_AGE_MS };

const test = require('node:test');
const assert = require('node:assert/strict');
const { runJob, jobsHealth } = require('../services/job-runner.service');

const quiet = { warn() {} };

/** Base falsa con el mismo contrato del candado: solo uno lo toma hasta que lo liberan. */
function fakeDb() {
  const state = { locked: new Set(), finished: [] };
  return {
    state,
    async AcquireJobLock(name) { if (state.locked.has(name)) return false; state.locked.add(name); return true; },
    async FinishJob(name, info) { state.locked.delete(name); state.finished.push({ name, ...info }); },
  };
}

test('una tarea corre, se anota y libera el candado', async () => {
  const db = fakeDb();
  const r = await runJob(db, 'resumen-diario', 1000, async () => '2 correos', quiet);
  assert.deepEqual([r.ran, r.ok, r.result], [true, true, '2 correos']);
  assert.equal(db.state.finished[0].ok, true);
  assert.equal(db.state.locked.size, 0);
});

test('dos instancias a la vez: solo una ejecuta la tarea', async () => {
  const db = fakeDb();
  let runs = 0;
  const work = async () => { runs += 1; await new Promise((r) => setTimeout(r, 15)); };
  const [a, b] = await Promise.all([runJob(db, 'avisos-de-pago', 1000, work, quiet), runJob(db, 'avisos-de-pago', 1000, work, quiet)]);
  assert.equal(runs, 1);
  assert.deepEqual([a.ran, b.ran].sort(), [false, true]);
});

test('si la tarea falla: no lanza, anota el error y libera el candado', async () => {
  const db = fakeDb();
  const r = await runJob(db, 'promociones', 1000, async () => { throw new Error('se cayó'); }, quiet);
  assert.deepEqual([r.ran, r.ok], [true, false]);
  assert.equal(db.state.finished[0].error, 'se cayó');
  assert.equal(db.state.locked.size, 0);
  assert.equal((await runJob(db, 'promociones', 1000, async () => 'ok', quiet)).ok, true); // se puede volver a correr
});

test('si no se puede tomar el candado (base caída) no lanza', async () => {
  const db = { async AcquireJobLock() { throw new Error('sin base'); } };
  assert.deepEqual(await runJob(db, 'x', 1000, async () => 1, quiet), { ran: false });
});

test('salud de tareas: detenida, fallida o sin correr aún', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const ago = (h) => new Date(now.getTime() - h * 3600 * 1000);
  assert.equal(jobsHealth([{ name: 'resumen-diario', lastRunAt: ago(0.2), lastOk: true }], now).ok, true);
  assert.equal(jobsHealth([{ name: 'resumen-diario', lastRunAt: ago(5), lastOk: true }], now).ok, false); // detenida
  assert.equal(jobsHealth([{ name: 'promociones', lastRunAt: ago(5), lastOk: false, lastError: 'x' }], now).ok, false); // falló
  assert.equal(jobsHealth([{ name: 'promociones', lastRunAt: ago(30), lastOk: true }], now).ok, true); // diaria: 30 h todavía vale
  assert.equal(jobsHealth([], now).ok, true); // nunca ha corrido (p. ej. sin correo configurado)
});

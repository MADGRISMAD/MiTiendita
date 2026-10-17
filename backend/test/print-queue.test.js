const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../services/print-queue.service');

const T = 't1';

/** Base falsa con la misma semántica que las funciones reales de la cola (toma atómica, caducidad, rescate). */
function fakeDb() {
  const st = { jobs: [], stations: new Map(), orders: new Map(), seq: 1 };
  return {
    st,
    async GetOrderById(id) { return st.orders.get(String(id)) || null; },
    async CreatePrintJob(d) { const j = { ...d, id: String(st.seq++) }; st.jobs.push(j); return { ...j }; },
    async ClaimPrintJob(tenantId, stationId, { ttlMs, claimTimeoutMs, now }) {
      const j = st.jobs
        .filter((x) => x.tenantId === tenantId && x.createdAt.getTime() >= now.getTime() - ttlMs &&
          (x.status === 'pending' || (x.status === 'printing' && x.claimedAt.getTime() < now.getTime() - claimTimeoutMs)))
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!j) return null;
      Object.assign(j, { status: 'printing', stationId, claimedAt: now, attempts: (j.attempts || 0) + 1 });
      return { ...j };
    },
    async FinishPrintJob(id, tenantId, stationId, { ok, error }) {
      const j = st.jobs.find((x) => x.id === id && x.tenantId === tenantId && x.status === 'printing' && x.stationId === stationId);
      if (!j) return false;
      Object.assign(j, { status: ok ? 'done' : 'failed', error: ok ? null : error });
      return true;
    },
    async TouchPrintStation(tenantId, stationId, name) { st.stations.set(tenantId, { stationId, name, lastSeenAt: new Date() }); },
    async GetPrintStation(tenantId) { return st.stations.get(tenantId) || null; },
  };
}
const paid = (id) => ({ id, paymentStatus: 'paid', total: 40, items: [] });
const noSleep = () => Promise.resolve();

async function withStation(db) {
  await q.claimNext(db, { tenantId: T, stationId: 'pc', stationName: 'Caja', waitMs: 0, sleep: noSleep });
}

test('no se puede mandar un ticket si la computadora de la caja no está conectada', async () => {
  const db = fakeDb();
  db.st.orders.set('o1', paid('o1'));
  await assert.rejects(q.enqueue(db, { tenantId: T, orderId: 'o1' }), (e) => e.status === 409 && e.code === 'STATION_OFFLINE');
  assert.equal(db.st.jobs.length, 0);
});

test('solo se mandan ventas cobradas que existen', async () => {
  const db = fakeDb();
  await withStation(db);
  db.st.orders.set('o2', { id: 'o2', paymentStatus: 'unpaid' });
  await assert.rejects(q.enqueue(db, { tenantId: T, orderId: 'nada' }), { status: 404 });
  await assert.rejects(q.enqueue(db, { tenantId: T, orderId: 'o2' }), { status: 400 });
  await assert.rejects(q.enqueue(db, { tenantId: T, orderId: 'o2', kind: 'otra' }), { status: 400 });
});

test('la estación recibe el ticket con la venta y lo marca como impreso', async () => {
  const db = fakeDb();
  await withStation(db);
  db.st.orders.set('o1', paid('o1'));
  const sent = await q.enqueue(db, { tenantId: T, orderId: 'o1', openDrawer: true, user: 'celular' });
  assert.equal(sent.status, 'pending');
  const job = await q.claimNext(db, { tenantId: T, stationId: 'pc', waitMs: 0, sleep: noSleep });
  assert.equal(job.order.id, 'o1');
  assert.equal(job.openDrawer, true);
  await q.report(db, { tenantId: T, jobId: job.id, stationId: 'pc', ok: true });
  assert.equal(db.st.jobs[0].status, 'done');
  assert.equal(await q.claimNext(db, { tenantId: T, stationId: 'pc', waitMs: 0, sleep: noSleep }), null); // ya no hay nada
});

test('dos estaciones: un ticket lo imprime solo una', async () => {
  const db = fakeDb();
  await withStation(db);
  db.st.orders.set('o1', paid('o1'));
  await q.enqueue(db, { tenantId: T, orderId: 'o1' });
  const [a, b] = await Promise.all([
    q.claimNext(db, { tenantId: T, stationId: 'pc1', waitMs: 0, sleep: noSleep }),
    q.claimNext(db, { tenantId: T, stationId: 'pc2', waitMs: 0, sleep: noSleep }),
  ]);
  assert.equal([a, b].filter(Boolean).length, 1);
  const winner = a ? 'pc1' : 'pc2';
  const loser = a ? 'pc2' : 'pc1';
  await assert.rejects(q.report(db, { tenantId: T, jobId: '1', stationId: loser, ok: true }), { status: 409 });
  await q.report(db, { tenantId: T, jobId: '1', stationId: winner, ok: true });
});

test('petición larga: si el ticket llega mientras la estación espera, lo recibe sin esperar al final', async () => {
  const db = fakeDb();
  await withStation(db);
  db.st.orders.set('o1', paid('o1'));
  const waiting = q.claimNext(db, { tenantId: T, stationId: 'pc', waitMs: 2000, intervalMs: 5 });
  setTimeout(() => q.enqueue(db, { tenantId: T, orderId: 'o1' }), 30);
  const t0 = Date.now();
  const job = await waiting;
  assert.equal(job.order.id, 'o1');
  assert.ok(Date.now() - t0 < 1000, 'respondió pronto');
});

test('sin tickets, la espera termina en null', async () => {
  const db = fakeDb();
  const t0 = Date.now();
  assert.equal(await q.claimNext(db, { tenantId: T, stationId: 'pc', waitMs: 40, intervalMs: 10 }), null);
  assert.ok(Date.now() - t0 >= 30);
});

test('un ticket viejo (más de 10 min) ya no se imprime', async () => {
  const db = fakeDb();
  await withStation(db);
  db.st.orders.set('o1', paid('o1'));
  await q.enqueue(db, { tenantId: T, orderId: 'o1' });
  db.st.jobs[0].createdAt = new Date(Date.now() - 11 * 60 * 1000);
  assert.equal(await q.claimNext(db, { tenantId: T, stationId: 'pc', waitMs: 0, sleep: noSleep }), null);
});

test('si la estación se cae a media impresión, otro intento rescata el ticket a los 30 s', async () => {
  const db = fakeDb();
  await withStation(db);
  db.st.orders.set('o1', paid('o1'));
  await q.enqueue(db, { tenantId: T, orderId: 'o1' });
  await q.claimNext(db, { tenantId: T, stationId: 'pc1', waitMs: 0, sleep: noSleep }); // la toma y se cae
  assert.equal(await q.claimNext(db, { tenantId: T, stationId: 'pc2', waitMs: 0, sleep: noSleep }), null); // aún está en proceso
  const later = () => new Date(Date.now() + 31 * 1000);
  const again = await q.claimNext(db, { tenantId: T, stationId: 'pc2', waitMs: 0, sleep: noSleep, now: later });
  assert.equal(again.order.id, 'o1');
});

test('si la venta ya no existe, el trabajo se cierra como fallido y se sigue con el siguiente', async () => {
  const db = fakeDb();
  await withStation(db);
  db.st.orders.set('o1', paid('o1'));
  db.st.orders.set('o2', paid('o2'));
  await q.enqueue(db, { tenantId: T, orderId: 'o1' });
  await q.enqueue(db, { tenantId: T, orderId: 'o2' });
  db.st.orders.delete('o1');
  const job = await q.claimNext(db, { tenantId: T, stationId: 'pc', waitMs: 0, sleep: noSleep });
  assert.equal(job.order.id, 'o2');
  assert.equal(db.st.jobs[0].status, 'failed');
});

test('estado de la estación: conectada solo si dio señal hace poco', async () => {
  const db = fakeDb();
  assert.equal((await q.stationStatus(db, T)).online, false);
  await withStation(db);
  assert.equal((await q.stationStatus(db, T)).online, true);
  assert.equal((await q.stationStatus(db, T, Date.now() + 60 * 1000)).online, false);
});

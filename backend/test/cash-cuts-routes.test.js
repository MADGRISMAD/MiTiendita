process.env.SECRET_KEY = process.env.SECRET_KEY || 'clave-de-prueba-para-tests';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, saleBody } = require('./helpers/money-harness');

const USERS = [
  { username: 'ana', name: 'Ana', lastName: 'Ruiz', role: 'cashier', disabled: false },
  { username: 'beto', name: 'Beto', lastName: '', role: 'cashier', disabled: false },
  { username: 'dueno', name: 'Dueño', lastName: '', role: 'admin', disabled: false },
];
const as = (user, role = 'cashier', device = 'A') => ({ 'x-user': user, 'x-role': role, 'x-device': device });
const COKE = { name: 'Coca', price: 20, quantity: 5 };

test('Corte X: crear, el receptor lo ve pendiente, confirma y desaparece; el cajero no lista el historial', async () => {
  const w = await start({ users: USERS });
  try {
    assert.equal((await w.call('POST', '/api/cash/session/open', { openingFloat: 500 }, as('ana'))).status, 201);
    assert.equal((await w.call('POST', '/api/orders/sale', saleBody([COKE]), as('ana'))).status, 200);

    const exp = await w.call('GET', '/api/cash/cuts/expected', null, as('ana'));
    assert.equal(exp.body.expected, 600);

    const team = await w.call('GET', '/api/cash/cuts/team', null, as('ana'));
    assert.deepEqual(team.body.map((u) => u.username).sort(), ['beto', 'dueno']);
    assert.equal(team.body.find((u) => u.username === 'beto').name, 'Beto');

    const made = await w.call('POST', '/api/cash/cuts', { toUser: 'beto', countedCash: 600 }, as('ana'));
    assert.equal(made.status, 201);
    assert.equal(made.body.status, 'pending');
    assert.equal(made.body.difference, 0);

    // El receptor entra desde otro navegador: confirmar no lleva candado
    const pending = await w.call('GET', '/api/cash/cuts/pending', null, as('beto', 'cashier', 'OTRO'));
    assert.equal(pending.body.length, 1);
    const ok = await w.call('POST', `/api/cash/cuts/${made.body.id}/confirm`, {}, as('beto', 'cashier', 'OTRO'));
    assert.equal(ok.status, 200);
    assert.equal(ok.body.status, 'confirmed');
    assert.equal((await w.call('GET', '/api/cash/cuts/pending', null, as('beto'))).body.length, 0);

    assert.equal((await w.call('GET', '/api/cash/cuts', null, as('ana'))).status, 403);
    const hist = await w.call('GET', '/api/cash/cuts?status=confirmed&from=2020-01-01', null, as('dueno', 'admin'));
    assert.equal(hist.status, 200);
    assert.equal(hist.body.length, 1);

    assert.deepEqual(w.w.log.map((l) => l.type), ['cash_opened', 'cash_cut', 'cash_cut_confirmed']);
  } finally { await w.stop(); }
});

test('Corte X: una confirmación con otro monto queda en disputa y la bitácora lo distingue', async () => {
  const w = await start({ users: USERS });
  try {
    await w.call('POST', '/api/cash/session/open', { openingFloat: 500 }, as('ana'));
    const made = await w.call('POST', '/api/cash/cuts', { toUser: 'beto', countedCash: 500 }, as('ana'));
    const r = await w.call('POST', `/api/cash/cuts/${made.body.id}/confirm`, { confirmedCash: 450 }, as('beto'));
    assert.equal(r.body.status, 'disputed');
    assert.equal(w.w.log.at(-1).type, 'cash_cut_disputed');
    assert.equal((await w.call('POST', `/api/cash/cuts/${made.body.id}/confirm`, {}, as('beto'))).status, 409);
    assert.equal((await w.call('POST', `/api/cash/cuts/${made.body.id}/confirm`, {}, as('ana'))).status, 403);
  } finally { await w.stop(); }
});

test('Corte X: sin sesión abierta devuelve 400 cash_closed; otro navegador no crea cortes', async () => {
  const w = await start({ users: USERS });
  try {
    const r = await w.call('POST', '/api/cash/cuts', { toUser: 'beto', countedCash: 0 }, as('ana'));
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'cash_closed');
    assert.equal((await w.call('GET', '/api/cash/cuts/expected', null, as('ana'))).status, 400);

    await w.call('POST', '/api/cash/session/open', { openingFloat: 100 }, as('ana', 'cashier', 'A'));
    const locked = await w.call('POST', '/api/cash/cuts', { toUser: 'beto', countedCash: 100 }, as('beto', 'cashier', 'B'));
    assert.equal(locked.status, 409);
    assert.equal(locked.body.code, 'register_in_use');
  } finally { await w.stop(); }
});

test('el cierre y el detalle traen segments (una fila por cajero) y cuts', async () => {
  const w = await start({ users: USERS });
  try {
    const open = await w.call('POST', '/api/cash/session/open', { openingFloat: 500 }, as('ana'));
    await w.call('POST', '/api/orders/sale', saleBody([COKE]), as('ana'));
    await w.call('POST', '/api/cash/cuts', { toUser: 'beto', countedCash: 600 }, as('ana'));
    // Beto cobra después del corte (en el navegador de la caja)
    await w.call('POST', '/api/orders/sale', saleBody([{ ...COKE, quantity: 1 }]), as('beto', 'cashier', 'A'));

    const detail = await w.call('GET', `/api/cash/session/${open.body.id}`, null, as('ana'));
    assert.equal(detail.body.cuts.length, 1);
    assert.deepEqual(detail.body.segments.map((s) => s.user).sort(), ['ana', 'beto']);

    const closed = await w.call('POST', '/api/cash/session/close', { countedCash: 620 }, as('ana'));
    assert.equal(closed.status, 200);
    assert.equal(closed.body.segments.length, 2);
    assert.equal(closed.body.cuts.length, 1);
    assert.equal(closed.body.segments.reduce((a, s) => a + s.total, 0), 120);
  } finally { await w.stop(); }
});

test('Corte X: el historial ignora filtros que no son texto simple o número entero', async () => {
  const w = await start({ users: USERS });
  try {
    await w.call('POST', '/api/cash/session/open', { openingFloat: 500 }, as('ana'));
    await w.call('POST', '/api/cash/cuts', { toUser: 'beto', countedCash: 500 }, as('ana'));
    const hist = await w.call('GET', '/api/cash/cuts?status[$ne]=x&user[$ne]=x&registerId=abc', null, as('dueno', 'admin'));
    assert.equal(hist.status, 200);
    assert.equal(hist.body.length, 1);
    const none = await w.call('GET', '/api/cash/cuts?registerId=7', null, as('dueno', 'admin'));
    assert.equal(none.body.length, 0);
  } finally { await w.stop(); }
});

test('Corte final: con cortes X la diferencia se juzga por el tramo del último cajero', async () => {
  const w = await start({ users: USERS });
  try {
    const open = await w.call('POST', '/api/cash/session/open', { openingFloat: 500 }, as('ana'));
    await w.call('POST', '/api/orders/sale', saleBody([COKE]), as('ana'));
    // Ana entrega con 50 de menos (esperado 600)
    assert.equal((await w.call('POST', '/api/cash/cuts', { toUser: 'beto', countedCash: 550 }, as('ana'))).status, 201);
    await w.call('POST', '/api/orders/sale', saleBody([COKE]), as('beto'));
    const cur = await w.call('GET', '/api/cash/session', null, as('beto'));
    assert.equal(cur.body.lastSegment.expected, 650);
    const closed = await w.call('POST', '/api/cash/session/close', { countedCash: 650 }, as('beto'));
    assert.equal(closed.status, 200);
    assert.equal(closed.body.session.difference, -50);
    assert.equal(closed.body.lastSegment.baseline, 550);
    assert.equal(closed.body.lastSegment.expected, 650);
    assert.equal(closed.body.segmentDifference, 0);
    const got = await w.call('GET', `/api/cash/session/${open.body.id}`, null, as('dueno', 'admin'));
    assert.equal(got.body.lastSegment.expected, 650);
    assert.equal(got.body.segmentDifference, 0);
  } finally { await w.stop(); }
});

test('Corte final sin cortes X: no se agrega lastSegment', async () => {
  const w = await start({ users: USERS });
  try {
    await w.call('POST', '/api/cash/session/open', { openingFloat: 500 }, as('ana'));
    const closed = await w.call('POST', '/api/cash/session/close', { countedCash: 500 }, as('ana'));
    assert.equal(closed.status, 200);
    assert.equal(closed.body.lastSegment, undefined);
    assert.equal(closed.body.segmentDifference, undefined);
  } finally { await w.stop(); }
});

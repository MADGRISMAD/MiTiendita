// El equipo está en Tijuana y la tienda en CDMX: las horas deben salir en la de la tienda.
process.env.TZ = 'America/Tijuana';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const backendTime = require('../utils/store-time');

let frontendTime;
test.before(async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/storeTime.js'), 'utf8');
  frontendTime = await import(`data:text/javascript,${encodeURIComponent(src)}`);
});

const CDMX = 'America/Mexico_City';
// 28 sep 2026, 3:59 p. m. en CDMX (UTC−6) = 21:59 UTC; en Tijuana (UTC−7) son las 2:59 p. m.
const SALE = new Date('2026-09-28T21:59:00Z');

test('la zona del equipo es otra (Tijuana)', () => {
  assert.equal(SALE.getHours(), 14);
});

for (const [name, mod] of [['backend', () => backendTime], ['frontend', () => frontendTime]]) {
  test(`${name}: hora y día del ticket en la zona de la tienda`, () => {
    const t = mod();
    assert.equal(t.storeClock(SALE, CDMX), '15:59');
    assert.equal(t.storeDayKey(SALE, CDMX), '2026-09-28');
    assert.deepEqual(t.storeParts(SALE, CDMX), { year: 2026, month: 9, day: 28, hour: 15, minute: 59, second: 0, weekday: 1 });
    assert.match(t.formatStoreDate(SALE, CDMX, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), /15:59/);
  });

  test(`${name}: el día «hoy» de un reporte empieza a las 00:00 de la tienda`, () => {
    const t = mod();
    const r = t.storeDayRange('2026-09-28', CDMX);
    assert.equal(r.from.toISOString(), '2026-09-28T06:00:00.000Z');
    assert.equal(r.to.toISOString(), '2026-09-29T05:59:59.999Z');
    const tj = t.storeDayRange('2026-09-28', 'America/Tijuana');
    assert.equal(tj.from.toISOString(), '2026-09-28T07:00:00.000Z');
  });

  test(`${name}: hora de pared ida y vuelta`, () => {
    const t = mod();
    const wall = t.toStoreWall(SALE, CDMX);
    assert.equal(wall.getHours(), 15);
    assert.equal(t.fromStoreWall(wall, CDMX).toISOString(), SALE.toISOString());
  });

  test(`${name}: zona inválida o vacía usa la de México`, () => {
    const t = mod();
    assert.equal(t.storeClock(SALE, 'Marte/Base'), '15:59');
    assert.equal(t.storeClock(SALE, ''), '15:59');
    assert.equal(t.storeClock('no es fecha', CDMX), '');
  });
}

test('cambio de horario (Nueva York, 8 mar 2026) da el día completo', () => {
  const r = backendTime.storeDayRange('2026-03-08', 'America/New_York');
  assert.equal(r.from.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-03-09T03:59:59.999Z');
});

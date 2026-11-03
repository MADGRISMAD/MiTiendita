const test = require('node:test');
const assert = require('node:assert/strict');
const { lastActive, shouldTouch, TOUCH_EVERY_MS } = require('../utils/last-seen');

test('la última vez es la más reciente entre iniciar sesión y usar la app con la sesión abierta', () => {
  const login = new Date('2026-11-01T10:00:00Z');
  const seen = new Date('2026-11-02T15:30:00Z');
  assert.equal(lastActive({ lastLoginAt: login, lastSeenAt: seen }).toISOString(), seen.toISOString());
  assert.equal(lastActive({ lastLoginAt: seen, lastSeenAt: login }).toISOString(), seen.toISOString());
  assert.equal(lastActive({ lastLoginAt: login }).toISOString(), login.toISOString());
  assert.equal(lastActive({ lastSeenAt: seen }).toISOString(), seen.toISOString());
  assert.equal(lastActive({}), null);
  assert.equal(lastActive(null), null);
});

test('la actividad se anota como mucho una vez cada 5 minutos por usuario', () => {
  const t0 = 1_000_000_000_000;
  assert.equal(shouldTouch('u-uno', t0), true);
  assert.equal(shouldTouch('u-uno', t0 + 60_000), false);
  assert.equal(shouldTouch('u-dos', t0 + 60_000), true, 'cada usuario lleva su propia cuenta');
  assert.equal(shouldTouch('u-uno', t0 + TOUCH_EVERY_MS), true);
  assert.equal(shouldTouch('', t0), false);
});

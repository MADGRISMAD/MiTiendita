const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// brandColors.js no tiene imports: se carga como módulo, igual que bulk.js
const load = async () => {
  const src = fs.readFileSync(path.join(__dirname, '../../frontend/src/brandColors.js'), 'utf8');
  return import(`data:text/javascript,${encodeURIComponent(src)}`);
};

/** Imagen de prueba: bloques [[r,g,b,alpha?], cantidad de píxeles]. */
const image = (blocks) => {
  const total = blocks.reduce((n, [, count]) => n + count, 0);
  const data = new Uint8ClampedArray(total * 4);
  let p = 0;
  for (const [[r, g, b, a = 255], count] of blocks) {
    for (let i = 0; i < count; i++, p += 4) data.set([r, g, b, a], p);
  }
  return data;
};
const WHITE = [255, 255, 255];

test('un logo de un color: principal de ese tono, legible con texto blanco, y secundario más claro', async () => {
  const m = await load();
  // 12 tonos: del rojo al magenta. Fondo blanco grande y el logo en un color vivo.
  for (let h = 0; h < 360; h += 30) {
    const vivid = m.hslToRgb([h, 0.8, 0.5]);
    const pal = m.paletteFromPixels(image([[WHITE, 700], [vivid, 300]]));
    const p = m.rgbToHsl(m.hexToRgb(pal.primary));
    const a = m.rgbToHsl(m.hexToRgb(pal.accent));
    assert.equal(pal.kind, 'color', `tono ${h}`);
    const dh = Math.abs(((p[0] - h + 540) % 360) - 180);
    assert.ok(dh <= 10, `tono ${h}: el principal conserva el tono del logo (salió ${Math.round(p[0])})`);
    assert.ok(m.contrast(m.hexToRgb(pal.primary), [255, 255, 255]) >= 4.5, `tono ${h}: el texto blanco se lee sobre el principal`);
    assert.ok(p[1] >= 0.38, `tono ${h}: el principal no queda apagado (sat ${p[1].toFixed(2)})`);
    assert.ok(a[2] >= p[2] + 0.15, `tono ${h}: el secundario es más claro (principal L ${p[2].toFixed(2)}, secundario L ${a[2].toFixed(2)})`);
    assert.ok(a[2] <= 0.78 && a[1] >= 0.4, `tono ${h}: el secundario sigue siendo un color, no blanco ni gris`);
    const da = Math.abs(((a[0] - h + 540) % 360) - 180);
    assert.ok(da <= 12, `tono ${h}: sin segundo color en el logo, el secundario es del mismo tono`);
  }
});

test('un logo de dos colores: el principal es el dominante y el secundario toma el otro, más claro', async () => {
  const m = await load();
  const azul = [30, 90, 200];
  const naranja = [240, 140, 20];
  const pal = m.paletteFromPixels(image([[WHITE, 400], [azul, 450], [naranja, 150]]));
  const p = m.rgbToHsl(m.hexToRgb(pal.primary));
  const a = m.rgbToHsl(m.hexToRgb(pal.accent));
  assert.ok(Math.abs(p[0] - 217) <= 10, `principal azul (salió ${Math.round(p[0])}°)`);
  assert.ok(Math.abs(a[0] - 34) <= 12, `secundario naranja (salió ${Math.round(a[0])}°)`);
  assert.ok(a[2] > p[2] + 0.15, 'y más claro que el principal');
  // si el segundo color casi no aparece, no se usa: el secundario es del mismo tono del principal
  const casi = m.paletteFromPixels(image([[WHITE, 400], [azul, 590], [naranja, 6]]));
  assert.ok(Math.abs(m.rgbToHsl(m.hexToRgb(casi.accent))[0] - 217) <= 12, 'un detalle minúsculo no define el secundario');
});

test('el fondo blanco y la transparencia no cuentan', async () => {
  const m = await load();
  const verdeInvisible = [0, 200, 60, 0]; // píxeles transparentes con color verde: no deben contar
  const pal = m.paletteFromPixels(image([[verdeInvisible, 5000], [WHITE, 8000], [[120, 40, 160], 400]]));
  const h = m.rgbToHsl(m.hexToRgb(pal.primary))[0];
  assert.ok(Math.abs(h - 280) <= 12, `solo cuenta el morado (salió ${Math.round(h)}°)`);
});

test('colores muy claros (amarillo): se oscurecen lo justo para leerse y no cambian de tono', async () => {
  const m = await load();
  const pal = m.paletteFromPixels(image([[WHITE, 500], [[255, 214, 10], 500]]));
  const p = m.rgbToHsl(m.hexToRgb(pal.primary));
  assert.ok(m.contrast(m.hexToRgb(pal.primary), [255, 255, 255]) >= 4.5, 'legible con texto blanco');
  assert.ok(Math.abs(p[0] - 50) <= 10, `sigue siendo amarillo/dorado, no otro color (salió ${Math.round(p[0])}°)`);
  assert.ok(m.rgbToHsl(m.hexToRgb(pal.accent))[2] > p[2] + 0.15, 'el secundario es más claro');
});

test('colores muy oscuros (azul marino): no se aclaran de más y el secundario sí es más claro', async () => {
  const m = await load();
  const pal = m.paletteFromPixels(image([[WHITE, 500], [[10, 20, 70], 500]]));
  const p = m.rgbToHsl(m.hexToRgb(pal.primary));
  assert.ok(p[2] >= 0.19 && p[2] <= 0.44, `principal oscuro pero con presencia (L ${p[2].toFixed(2)})`);
  assert.ok(m.rgbToHsl(m.hexToRgb(pal.accent))[2] >= 0.51, 'secundario claro para detalles');
});

test('logo en blanco y negro: paleta neutra (ni negro puro ni el azul por defecto)', async () => {
  const m = await load();
  const pal = m.paletteFromPixels(image([[WHITE, 600], [[10, 10, 10], 300], [[120, 120, 120], 100]]));
  assert.equal(pal.kind, 'neutral');
  const p = m.rgbToHsl(m.hexToRgb(pal.primary));
  const a = m.rgbToHsl(m.hexToRgb(pal.accent));
  assert.notEqual(pal.primary, '#000000');
  assert.ok(p[2] <= 0.32 && p[1] <= 0.3, 'principal oscuro y casi sin color');
  assert.ok(a[2] >= p[2] + 0.25, 'secundario claramente más claro');
  assert.ok(m.contrast(m.hexToRgb(pal.primary), [255, 255, 255]) >= 4.5);
});

test('imágenes sin nada que leer dan null (no se inventa una paleta)', async () => {
  const m = await load();
  assert.equal(m.paletteFromPixels(new Uint8ClampedArray(0)), null);
  assert.equal(m.paletteFromPixels(image([[WHITE, 100]])), null, 'toda blanca');
  assert.equal(m.paletteFromPixels(image([[[255, 0, 0, 0], 100]])), null, 'toda transparente');
});

test('es determinista: la misma imagen siempre da la misma paleta, sin importar el orden de los píxeles', async () => {
  const m = await load();
  const blocks = [[WHITE, 300], [[200, 40, 60], 250], [[40, 120, 200], 180], [[240, 200, 30], 90]];
  const first = m.paletteFromPixels(image(blocks));
  for (let i = 0; i < 5; i++) assert.deepEqual(m.paletteFromPixels(image(blocks)), first);
  const forward = image(blocks);
  const reversed = new Uint8ClampedArray(forward.length);
  for (let i = 0; i < forward.length; i += 4) reversed.set(forward.subarray(forward.length - i - 4, forward.length - i), i);
  assert.deepEqual(m.paletteFromPixels(reversed), first, 'barajar los píxeles no cambia el resultado');
});

test('el tema: claro con principal oscuro y barra oscura; oscuro con principal claro; nunca al revés', async () => {
  const m = await load();
  const css = m.brandThemeCss('#1B7F5C', '#6FD3A8');
  const block = (mode) => css.split(`html[data-theme="${mode}"]`)[1].split('}')[0];
  const get = (mode, name) => block(mode).match(new RegExp(`--timber-${name}: (#[0-9a-fA-F]{6})`))[1];
  const L = (hex) => m.rgbToHsl(m.hexToRgb(hex))[2];

  // Claro: principal con texto blanco legible, secundario más claro, barra muy oscura, suave casi blanco
  assert.ok(m.contrast(m.hexToRgb(get('light', 'primary')), [255, 255, 255]) >= 4.5, 'claro: texto blanco legible');
  assert.ok(L(get('light', 'accent')) > L(get('light', 'primary')) + 0.1, 'claro: secundario más claro');
  assert.ok(L(get('light', 'topbar')) <= 0.2, 'claro: barra oscura');
  assert.ok(L(get('light', 'primary-soft')) >= 0.9, 'claro: fondo suave casi blanco');
  assert.match(block('light'), /--timber-on-primary: #ffffff/);

  // Oscuro: el principal se aclara para verse sobre fondos oscuros, y el texto encima es oscuro
  assert.ok(L(get('dark', 'primary')) >= 0.6, 'oscuro: principal claro');
  assert.ok(m.contrast(m.hexToRgb(get('dark', 'primary')), m.hexToRgb('#0A1220')) >= 4.5, 'oscuro: texto oscuro legible sobre el principal');
  assert.ok(L(get('dark', 'topbar')) <= 0.12, 'oscuro: barra aún más oscura');
  assert.ok(L(get('dark', 'primary')) > L(get('light', 'primary')), 'el principal del tema oscuro es más claro que el del claro');
  assert.match(block('dark'), /--timber-on-primary: #0a1220/);
  assert.match(block('dark'), /--timber-primary-soft: rgba\(/);
});

test('con los colores de Mi Tiendita (o los viejos por defecto) no cambia nada; con basura tampoco', async () => {
  const m = await load();
  assert.equal(m.brandThemeCss('#1E5AA8', '#E08A1E'), '');
  assert.equal(m.brandThemeCss('#1e5aa8', '#e08a1e'), '');
  assert.equal(m.brandThemeCss('#1F4D3A', '#C4A574'), '', 'el verde que el servidor guardaba por defecto no es una marca');
  assert.equal(m.brandThemeCss('', ''), '');
  assert.equal(m.brandThemeCss(undefined, null), '');
  assert.equal(m.brandThemeCss('rojo', 'azul'), '');
  assert.equal(m.brandThemeCss('#12345', '#E08A1E'), '');
  assert.notEqual(m.brandThemeCss('#B3261E', '#F0A39E'), '');
});

test('aunque llegue un color guardado demasiado claro, el tema lo corrige para que se lea', async () => {
  const m = await load();
  const css = m.brandThemeCss('#FFE066', '#FFF3B0');
  const light = css.split('html[data-theme="light"]')[1].split('}')[0];
  const primary = /--timber-primary: (#[0-9A-F]{6})/i.exec(light)[1];
  assert.ok(m.contrast(m.hexToRgb(primary), [255, 255, 255]) >= 4.5);
});

test('el servidor guarda por defecto los mismos colores que usa la app (no un verde viejo)', async () => {
  const m = await load();
  const settingsSchema = require('../models/settings.model');
  const { value } = settingsSchema.validate({ businessName: 'Mi tienda' });
  assert.equal(value.primaryColor, m.DEFAULT_PRIMARY);
  assert.equal(value.accentColor, m.DEFAULT_ACCENT);
  assert.equal(m.brandThemeCss(value.primaryColor, value.accentColor), '', 'y con esos colores no se cambia el tema');
});

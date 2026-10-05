// Comprueba que cada página pública pre-generada tenga su regla en vercel.json (si no, Vercel serviría la landing)
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { PUBLIC_PAGES } from './src/seo/site.mjs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url)));
const rules = new Set(vercel.services.frontend.rewrites.map((r) => r.source));
const missing = Object.entries(PUBLIC_PAGES)
  .filter(([p, page]) => p !== '/' && !page.noindex)
  .map(([p]) => p)
  .filter((p) => !rules.has(p));
assert.deepEqual(missing, [], `Faltan en vercel.json: ${missing.join(', ')}`);
console.log('ok: vercel.json tiene todas las páginas públicas');

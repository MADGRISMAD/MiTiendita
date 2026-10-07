/**
 * Al compilar, genera para cada página pública un HTML con su título, descripción, canónica,
 * Open Graph, datos estructurados y el contenido principal en texto. Así los buscadores y las
 * vistas previas de WhatsApp/Facebook lo ven sin ejecutar JavaScript. Vue reemplaza ese contenido
 * al cargar. También escribe sitemap.xml y robots.txt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SITE, PUBLIC_PAGES, PRIVATE_PREFIXES, VERTICALS, PRICES, COMMON_FEATURES, jsonLdFor } from './src/seo/site.mjs';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const abs = (p) => `${SITE.url}${p === '/' ? '/' : p}`;

export function headFor(p, page) {
  const url = abs(p);
  const robots = page.noindex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large';
  const image = abs(SITE.ogImage);
  const tags = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="es-MX" href="${url}" />`,
    `<link rel="alternate" hreflang="x-default" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE.name)}" />`,
    `<meta property="og:locale" content="${SITE.locale}" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(SITE.name)}: punto de venta en la nube" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ];
  if (!page.noindex) {
    tags.push(`<script type="application/ld+json" id="ld-json">${JSON.stringify(jsonLdFor(p)).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}

const nav = () =>
  `<nav aria-label="Giros"><ul>${VERTICALS.map((v) => `<li><a href="/${v.slug}">${esc(v.h1)}</a></li>`).join('')}</ul></nav>`;
const prices = () =>
  `<ul>${PRICES.map((p) => `<li>${esc(p.name)}: $${p.month.toLocaleString('es-MX')} al mes o $${p.year.toLocaleString('es-MX')} al año</li>`).join('')}</ul>`;

export function bodyFor(p, page) {
  const v = VERTICALS.find((x) => `/${x.slug}` === p);
  let inner;
  if (v) {
    inner = `
<h1>${esc(v.h1)}</h1>
<p>${esc(v.lead)}</p>
<p><a href="/register">Prueba Mi Tiendita 3 días gratis</a></p>
${v.sections.map((s) => `<h2>${esc(s.h2)}</h2><p>${esc(s.p)}</p>`).join('\n')}
<h2>Todo lo que incluye</h2><ul>${COMMON_FEATURES.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<h2>Precios</h2>${prices()}
<h2>Preguntas frecuentes</h2>
${v.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('\n')}
<h2>Mi Tiendita para otros giros</h2>${nav()}`;
  } else if (p === '/') {
    inner = `
<h1>Punto de venta en la nube para abarrotes, farmacias y ferreterías</h1>
<p>${esc(SITE.defaultDescription)}</p>
<p><a href="/register">Crear mi tienda gratis</a> · <a href="/login">Ingresar</a></p>
<h2>Qué puedes hacer con Mi Tiendita</h2><ul>${COMMON_FEATURES.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
<h2>Precios</h2>${prices()}
<p>3 días de prueba gratis sin tarjeta. Clientes nuevos: primeros 3 meses a un tercio del precio.</p>
<h2>Punto de venta para tu giro</h2>${nav()}
<p><a href="/ayuda">Ayuda</a> · <a href="/terminos">Términos</a> · <a href="/privacidad">Privacidad</a></p>`;
  } else {
    inner = `<h1>${esc(page.title.split(' | ')[0])}</h1><p>${esc(page.description)}</p><p><a href="/">Mi Tiendita</a> · ${nav()}</p>`;
  }
  // Contenido para quien aún no ejecuta JavaScript (buscadores, vistas previas). Vue lo reemplaza al cargar.
  return `<main class="seo-static" style="max-width:56rem;margin:0 auto;padding:2rem 1.2rem;font-family:system-ui,sans-serif;line-height:1.55;color:#1a2332">${inner}</main>`;
}

function sitemap(date) {
  const urls = Object.entries(PUBLIC_PAGES)
    .filter(([, page]) => !page.noindex)
    .map(
      ([p, page]) =>
        `  <url><loc>${abs(p)}</loc><lastmod>${date}</lastmod><changefreq>${page.changefreq || 'monthly'}</changefreq><priority>${page.priority || '0.5'}</priority></url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function robots() {
  return [
    'User-agent: *',
    'Allow: /',
    ...PRIVATE_PREFIXES.map((p) => `Disallow: ${p}`),
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE.url}/sitemap.xml`,
    '',
  ].join('\n');
}

export default function seoPlugin() {
  let outDir = 'dist';
  return {
    name: 'mitiendita-seo',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const templatePath = path.join(outDir, 'index.html');
      if (!fs.existsSync(templatePath)) return;
      const template = fs.readFileSync(templatePath, 'utf8');
      const render = (p, page) =>
        template
          .replace(/<!--seo-head-->[\s\S]*?<!--\/seo-head-->/, `<!--seo-head-->\n    ${headFor(p, page)}\n    <!--/seo-head-->`)
          .replace('<div id="app"></div>', `<div id="app">${bodyFor(p, page)}</div>`);

      for (const [p, page] of Object.entries(PUBLIC_PAGES)) {
        if (page.noindex) continue;
        const file = p === '/' ? templatePath : path.join(outDir, p.slice(1), 'index.html');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, render(p, page));
      }
      const date = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap(date));
      fs.writeFileSync(path.join(outDir, 'robots.txt'), robots());
    },
  };
}

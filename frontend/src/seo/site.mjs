/**
 * SEO de Mi Tiendita: una sola fuente para
 *  - las etiquetas que el navegador pone al cambiar de página (src/seo/apply.ts)
 *  - el HTML que se genera al compilar para cada página pública (plugin en vite.config.js),
 *    así Google, Bing y quien comparta un enlace ven título, descripción y contenido real sin JavaScript
 *  - sitemap.xml y robots.txt
 * Todo lo que se afirma aquí debe existir en el producto.
 */
export const SITE = {
  url: 'https://www.mitiendita.software',
  name: 'Mi Tiendita',
  locale: 'es_MX',
  lang: 'es-MX',
  ogImage: '/og.png',
  logo: '/icons/icon-512.png',
  defaultTitle: 'Mi Tiendita — Punto de venta en la nube para abarrotes, farmacias y ferreterías',
  defaultDescription:
    'Punto de venta (POS) en la nube para tiendas en México: cobra desde celular, tablet o PC, sigue vendiendo sin internet, controla inventario y cortes de caja. 14 días gratis.',
};

// Precios (MXN, IVA incluido). Deben coincidir con backend/services/plans.catalog.js
export const PRICES = [
  { id: 'basic', name: 'Básico', month: 349, year: 3490 },
  { id: 'growth', name: 'Crecimiento', month: 750, year: 7500 },
  { id: 'pro', name: 'Pro', month: 1350, year: 13500 },
];

const COMMON_FEATURES = [
  'Cobra desde celular, tablet o PC, sin instalar nada',
  'Sigue vendiendo aunque se vaya el internet: las ventas se suben solas al volver',
  'Código de barras, productos a granel y báscula',
  'Inventario con existencias, compras a proveedores, lotes y caducidades',
  'Corte de caja, reportes de ventas y varios cajeros',
  'Ticket en impresora térmica de 80 mm y cobro con terminal Mercado Pago',
  'Inventario Mágico: toma foto a la nota del proveedor y se carga sola',
];

/** Páginas por giro: cada una ataca búsquedas reales («punto de venta para farmacia», etc.). */
export const VERTICALS = [
  {
    slug: 'punto-de-venta-para-abarrotes',
    keyword: 'punto de venta para abarrotes',
    title: 'Punto de venta para abarrotes en la nube | Mi Tiendita',
    description:
      'Sistema de punto de venta para tiendas de abarrotes: cobra rápido con código de barras, vende sin internet, controla inventario y cortes de caja desde tu celular. Prueba 14 días gratis.',
    h1: 'Punto de venta para tiendas de abarrotes',
    lead: 'Cobra en segundos, sabe qué se vende y qué falta, y deja el cuaderno. Mi Tiendita funciona en el celular, la tablet o la PC del mostrador.',
    sections: [
      { h2: 'Cobra rápido en la hora pico', p: 'Escanea el código de barras o busca por nombre, aplica descuentos y cobra en efectivo, tarjeta, transferencia o pago mixto. El cambio se calcula solo.' },
      { h2: 'Inventario que se cuida solo', p: 'Cada venta descuenta existencias. Te avisa lo que se está acabando y registra tus compras a proveedores con costo, lote y caducidad.' },
      { h2: 'Si se va el internet, sigues vendiendo', p: 'Las ventas se guardan en el equipo y se suben solas cuando vuelve la conexión. Ningún cliente se queda esperando.' },
      { h2: 'Carga tu catálogo con una foto', p: 'Con Inventario Mágico tomas foto a la nota del proveedor y los productos, cantidades y costos se cargan solos para que solo revises.' },
    ],
    faq: [
      { q: '¿Cuánto cuesta un punto de venta para abarrotes?', a: 'Mi Tiendita empieza en $349 al mes con 14 días de prueba gratis y sin tarjeta. Los clientes nuevos pagan sus primeros 3 meses a un tercio del precio.' },
      { q: '¿Necesito comprar una computadora especial?', a: 'No. Funciona en el navegador de un celular, tablet o PC que ya tengas. Si quieres, puedes agregar lector de código de barras, impresora de tickets y báscula.' },
      { q: '¿Funciona sin internet?', a: 'Sí. Puedes seguir cobrando sin conexión y las ventas se sincronizan solas al volver el internet.' },
      { q: '¿Puedo tener varios cajeros?', a: 'Sí. Cada cajero entra con su usuario y el dueño ve las ventas y cortes de todos.' },
    ],
  },
  {
    slug: 'punto-de-venta-para-farmacia',
    keyword: 'punto de venta para farmacia',
    title: 'Punto de venta para farmacia con control de caducidades | Mi Tiendita',
    description:
      'Software de punto de venta para farmacias: control de lotes y caducidades, código de barras, inventario y corte de caja en la nube. Funciona sin internet. Prueba 14 días gratis.',
    h1: 'Punto de venta para farmacias',
    lead: 'Controla lotes y fechas de caducidad, cobra con código de barras y mantén tu inventario al día desde cualquier pantalla.',
    sections: [
      { h2: 'Lotes y caducidades a la vista', p: 'Registra cada compra con su lote y fecha de caducidad. Mi Tiendita te muestra lo que está por vencer para que lo vendas a tiempo.' },
      { h2: 'Cobro con código de barras', p: 'Escanea la caja del medicamento y cobra. También puedes buscar por nombre.' },
      { h2: 'Inventario y compras a proveedores', p: 'Cada venta descuenta existencias y cada compra suma. Lleva el costo de cada producto y revisa tu margen.' },
      { h2: 'Tu cliente pide su factura desde el ticket', p: 'El ticket incluye un enlace para que tu cliente capture sus datos fiscales y solicite su factura.' },
    ],
    faq: [
      { q: '¿El sistema controla fechas de caducidad?', a: 'Sí. Cada compra se registra con lote y caducidad, y puedes ver los productos que están por vencer.' },
      { q: '¿Puedo usarlo en varias computadoras?', a: 'Sí. Es un sistema en la nube: entras desde cualquier PC, tablet o celular con tu usuario.' },
      { q: '¿Qué pasa si se cae el internet?', a: 'Sigues cobrando. Las ventas se guardan y se suben solas cuando vuelve la conexión.' },
      { q: '¿Hay prueba gratis?', a: 'Sí, 14 días gratis sin tarjeta.' },
    ],
  },
  {
    slug: 'punto-de-venta-para-ferreteria',
    keyword: 'punto de venta para ferretería',
    title: 'Punto de venta para ferretería: inventario grande y precios al día | Mi Tiendita',
    description:
      'Sistema de punto de venta para ferreterías: miles de productos, venta a granel, compras a proveedores y precios actualizados con una foto de la factura. 14 días gratis.',
    h1: 'Punto de venta para ferreterías',
    lead: 'Miles de piezas, precios que cambian y ventas por metro o por kilo. Mi Tiendita lo ordena sin que pierdas tiempo.',
    sections: [
      { h2: 'Catálogo grande sin dolor', p: 'Busca rápido entre miles de productos por nombre o código. Los planes Crecimiento y Pro manejan catálogos grandes; Pro, ilimitado.' },
      { h2: 'Precios al día con una foto', p: 'Con Precio Mágico tomas foto a la factura del proveedor: se actualizan los costos y te sugiere el precio al público.' },
      { h2: 'Venta a granel', p: 'Vende por kilo, metro o litro con cantidades decimales, o conecta una báscula para pesar al momento.' },
      { h2: 'Compras y proveedores', p: 'Registra lo que te surte cada proveedor y lleva el historial de costos para cuidar tu margen.' },
    ],
    faq: [
      { q: '¿Cuántos productos puedo registrar?', a: 'Básico hasta 250, Crecimiento hasta 1,500 y Pro sin límite.' },
      { q: '¿Puedo vender por metro o por kilo?', a: 'Sí, con cantidades decimales o con báscula conectada.' },
      { q: '¿Cómo actualizo precios cuando sube el proveedor?', a: 'Con Precio Mágico: foto a la factura, revisas los costos nuevos y el precio sugerido, y confirmas.' },
      { q: '¿Necesito instalar algo?', a: 'No. Funciona en el navegador.' },
    ],
  },
  {
    slug: 'punto-de-venta-para-papeleria',
    keyword: 'punto de venta para papelería',
    title: 'Punto de venta para papelería y regalos | Mi Tiendita',
    description:
      'Punto de venta para papelerías: cobra rápido en temporada escolar, controla inventario de miles de artículos y haz tu corte de caja desde el celular. 14 días gratis.',
    h1: 'Punto de venta para papelerías',
    lead: 'En regreso a clases cada segundo cuenta. Cobra rápido, sabe qué se vende y que no se te acaben los útiles.',
    sections: [
      { h2: 'Cobro rápido con código o búsqueda', p: 'Escanea o escribe parte del nombre y cobra. Varios cajeros pueden cobrar a la vez desde distintos equipos.' },
      { h2: 'Inventario de artículos pequeños', p: 'Lleva existencias de cada artículo y te avisa lo que se está acabando antes de la temporada.' },
      { h2: 'Productos sueltos sin código', p: 'Cobra copias, impresiones o artículos sin código con un producto libre de precio en un toque.' },
      { h2: 'Corte de caja y reportes', p: 'Al cerrar ves cuánto vendiste por forma de pago y qué productos se movieron más.' },
    ],
    faq: [
      { q: '¿Puedo cobrar artículos que no tienen código de barras?', a: 'Sí. Búscalos por nombre o usa un artículo libre con el precio que quieras.' },
      { q: '¿Varios cajeros al mismo tiempo?', a: 'Sí, cada uno con su usuario.' },
      { q: '¿Funciona en el celular?', a: 'Sí, en celular, tablet o PC desde el navegador.' },
      { q: '¿Cuánto cuesta?', a: 'Desde $349 al mes, con 14 días de prueba gratis.' },
    ],
  },
  {
    slug: 'punto-de-venta-con-bascula',
    keyword: 'punto de venta con báscula',
    title: 'Punto de venta con báscula para carnicería, verdulería y cremería | Mi Tiendita',
    description:
      'Punto de venta con báscula conectada para carnicerías, verdulerías, cremerías y tiendas a granel: elige el producto, pesa y se agrega solo al ticket. 14 días gratis.',
    h1: 'Punto de venta con báscula',
    lead: 'Elige el producto, ponlo en la báscula y cuando el peso se estabiliza se agrega solo al ticket con su precio por kilo.',
    sections: [
      { h2: 'La báscula se conecta al sistema', p: 'Conecta tu báscula a la computadora y Mi Tiendita lee el peso. Cuando se mantiene estable, lo agrega a la venta.' },
      { h2: 'Sin báscula también se puede', p: 'Si no tienes báscula conectada, escribe el peso con el teclado en pantalla y se calcula el importe.' },
      { h2: 'Precios por kilo y por pieza', p: 'Cada producto puede venderse por kilo, por pieza o por litro, y el ticket muestra el peso y el precio unitario.' },
      { h2: 'Inventario por peso', p: 'Las existencias se descuentan en kilos o gramos según lo que vendas.' },
    ],
    faq: [
      { q: '¿Qué báscula necesito?', a: 'Una báscula con salida a computadora (por cable USB o serial) que envíe el peso. Si no tienes, puedes capturar el peso a mano.' },
      { q: '¿Funciona en tablet?', a: 'La lectura automática de la báscula funciona en la computadora con el navegador; en tablet o celular capturas el peso.' },
      { q: '¿Puedo vender por pieza y por kilo en la misma tienda?', a: 'Sí, cada producto tiene su propia unidad de venta.' },
      { q: '¿Hay prueba gratis?', a: 'Sí, 14 días gratis.' },
    ],
  },
  {
    slug: 'punto-de-venta-sin-internet',
    keyword: 'punto de venta sin internet',
    title: 'Punto de venta que funciona sin internet | Mi Tiendita',
    description:
      'Punto de venta en la nube que sigue cobrando sin internet: las ventas se guardan en el equipo y se sincronizan solas al volver la conexión. Celular, tablet o PC. 14 días gratis.',
    h1: 'Punto de venta que funciona sin internet',
    lead: 'Lo mejor de la nube sin depender de ella: si se cae el internet sigues cobrando, y cuando vuelve todo se sube solo.',
    sections: [
      { h2: 'Cobras igual, con o sin conexión', p: 'Las ventas se guardan en el equipo mientras no hay internet y se envían solas en cuanto vuelve. Te mostramos cuántas faltan por subir.' },
      { h2: 'Tus datos, seguros en la nube', p: 'Si se descompone la computadora, entras desde otro equipo y ahí está todo: productos, ventas y cortes.' },
      { h2: 'Sin instalar nada', p: 'Abre Mi Tiendita en el navegador e instálala como app en tu celular o PC con un toque.' },
      { h2: 'Varios equipos a la vez', p: 'El dueño ve las ventas desde su celular mientras los cajeros cobran en la tienda.' },
    ],
    faq: [
      { q: '¿Cómo funciona sin internet si es en la nube?', a: 'La app guarda las ventas en tu equipo mientras no hay conexión y las sube automáticamente cuando vuelve el internet.' },
      { q: '¿Necesito internet para empezar a usarla?', a: 'Necesitas conexión para entrar la primera vez y cargar tu catálogo; después puedes cobrar aunque se vaya.' },
      { q: '¿Qué pasa si se descompone mi computadora?', a: 'Entras desde otro equipo con tu usuario y sigues trabajando: todo está en la nube.' },
      { q: '¿Cuánto cuesta?', a: 'Desde $349 al mes, con 14 días gratis y una promoción para clientes nuevos.' },
    ],
  },
];

const PUBLIC = {
  '/': {
    title: SITE.defaultTitle,
    description: SITE.defaultDescription,
    priority: '1.0',
    changefreq: 'weekly',
  },
  '/ayuda': {
    title: 'Ayuda y preguntas frecuentes | Mi Tiendita',
    description: 'Cómo empezar con Mi Tiendita: dar de alta productos, cobrar, hacer el corte de caja, conectar impresora y báscula. Guía para cajeros en PDF.',
    priority: '0.6',
    changefreq: 'monthly',
  },
  '/register': {
    title: 'Crea tu tienda gratis 14 días | Mi Tiendita',
    description: 'Crea tu cuenta de Mi Tiendita en un minuto: punto de venta en la nube con 14 días gratis y sin tarjeta.',
    priority: '0.8',
    changefreq: 'monthly',
  },
  '/terminos': {
    title: 'Términos y condiciones | Mi Tiendita',
    description: 'Términos y condiciones de uso de Mi Tiendita, punto de venta en la nube.',
    priority: '0.2',
    changefreq: 'yearly',
  },
  '/privacidad': {
    title: 'Aviso de privacidad | Mi Tiendita',
    description: 'Aviso de privacidad de Mi Tiendita: qué datos guardamos, para qué y cómo ejercer tus derechos.',
    priority: '0.2',
    changefreq: 'yearly',
  },
  '/login': {
    title: 'Ingresar | Mi Tiendita',
    description: 'Entra a tu punto de venta Mi Tiendita.',
    noindex: true,
  },
};
for (const v of VERTICALS) {
  PUBLIC[`/${v.slug}`] = { title: v.title, description: v.description, priority: '0.9', changefreq: 'monthly', vertical: v.slug };
}
export const PUBLIC_PAGES = PUBLIC;

/** Rutas que nunca deben indexarse (cuentas, panel, impresiones). */
export const PRIVATE_PREFIXES = [
  '/pos', '/products', '/orders', '/settings', '/setup', '/dashboard', '/staff', '/customers', '/inventory', '/billing',
  '/platform', '/socio', '/print', '/factura', '/invite', '/reset', '/forgot', '/login',
];

export function seoFor(path) {
  const clean = String(path || '/').split('?')[0].replace(/\/+$/, '') || '/';
  const page = PUBLIC[clean];
  if (page) return { path: clean, ...page };
  const isPrivate = PRIVATE_PREFIXES.some((p) => clean === p || clean.startsWith(`${p}/`));
  return { path: clean, title: SITE.name, description: SITE.defaultDescription, noindex: true, private: isPrivate };
}

const abs = (p) => `${SITE.url}${p === '/' ? '/' : p}`;

/** Datos estructurados (schema.org) por página. */
export function jsonLdFor(path) {
  const page = seoFor(path);
  const org = {
    '@type': 'Organization',
    '@id': `${SITE.url}/#org`,
    name: SITE.name,
    url: SITE.url,
    logo: abs(SITE.logo),
  };
  const app = {
    '@type': 'SoftwareApplication',
    '@id': `${SITE.url}/#app`,
    name: SITE.name,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Punto de venta (POS)',
    operatingSystem: 'Web, Android, iOS, Windows, macOS',
    description: SITE.defaultDescription,
    url: SITE.url,
    image: abs(SITE.ogImage),
    inLanguage: SITE.lang,
    publisher: { '@id': `${SITE.url}/#org` },
    offers: PRICES.map((p) => ({
      '@type': 'Offer',
      name: `Plan ${p.name}`,
      price: String(p.month),
      priceCurrency: 'MXN',
      url: abs('/register'),
      category: 'subscription',
    })),
  };
  const graph = [org, app];
  if (page.path === '/') {
    graph.push({
      '@type': 'WebSite',
      '@id': `${SITE.url}/#web`,
      url: SITE.url,
      name: SITE.name,
      inLanguage: SITE.lang,
      publisher: { '@id': `${SITE.url}/#org` },
    });
  }
  const vertical = VERTICALS.find((v) => `/${v.slug}` === page.path);
  if (vertical) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: vertical.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.name, item: abs('/') },
        { '@type': 'ListItem', position: 2, name: vertical.h1, item: abs(page.path) },
      ],
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export { COMMON_FEATURES };

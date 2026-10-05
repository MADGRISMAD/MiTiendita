/**
 * Catálogo comercial Mi Tiendita (MXN) — SaaS 100% nube.
 * Inventario Mágico + Precio Mágico = IA para catálogo y precios (cuota compartida).
 */
const PLANS = ['basic', 'growth', 'pro'];
const ALL_PLANS = [...PLANS, 'perpetual'];

/**
 * Promoción de lanzamiento para clientes NUEVOS (aparte de los 14 días de prueba):
 * los primeros PROMO.months cobros mensuales a 1/3 del precio; después, precio normal.
 */
const PROMO = {
  months: 3,
  divisor: 3,
};

/** Precio promocional mensual de un plan (1/3 del precio, redondeado a pesos). */
function promoPrice(planId) {
  const p = PLAN_CATALOG[planId];
  if (!p || !p.priceMonth) return 0;
  return Math.round(p.priceMonth / PROMO.divisor);
}

/** Usos de Inventario Mágico y Precio Mágico (Gemini) por mes calendario. */
const AI_QUOTAS = {
  basic: 50,
  growth: 150,
  pro: 500,
};

/** null = ilimitado */
const PLAN_LIMITS = {
  basic: { users: 2, products: 250 },
  growth: { users: 6, products: 1500 },
  pro: { users: 20, products: null },
  perpetual: { users: 20, products: null },
};

const PLAN_CATALOG = {
  basic: {
    id: 'basic',
    name: 'Básico',
    tagline: 'Entra desde cualquier pantalla y cobra',
    pitch: '¿Se daña la PC del cajero? Abres Mi Tiendita en una tablet o el celular y sigues vendiendo al instante.',
    priceMonth: Number(process.env.MP_PLAN_BASIC_PRICE || 349),
    priceYear: Number(process.env.MP_PLAN_BASIC_YEAR_PRICE || 3490),
    aiQuota: AI_QUOTAS.basic,
    limits: PLAN_LIMITS.basic,
    highlight: false,
    features: [
      'Celular, tablet o PC en el navegador',
      'Sin instalar nada · 1 sucursal',
      '2 usuarios (dueño + 1 cajero)',
      'Hasta 250 productos',
      'Inventario Mágico: lista o foto al catálogo',
      'Precio Mágico: la IA ajusta costos y el precio al público',
      `${AI_QUOTAS.basic} usos de magia al mes`,
      'Tickets 80 mm',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Crecimiento',
    tagline: 'Más manos en caja, más catálogo',
    pitch: 'Varios cajeros a la vez y un catálogo grande — cobras desde el celular en el pasillo.',
    priceMonth: Number(process.env.MP_PLAN_GROWTH_PRICE || 700),
    priceYear: Number(process.env.MP_PLAN_GROWTH_YEAR_PRICE || 7000),
    aiQuota: AI_QUOTAS.growth,
    limits: PLAN_LIMITS.growth,
    highlight: true,
    badge: 'Recomendado',
    features: [
      'Todo lo del Básico',
      '6 usuarios (dueño + equipo)',
      'Hasta 1,500 productos',
      'Inventario Mágico: lista o foto al catálogo',
      'Precio Mágico: la IA ajusta costos y el precio al público',
      `${AI_QUOTAS.growth} usos de magia al mes`,
      'Cobra desde el celular en el pasillo',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Catálogo grande, Inventario Mágico y Precio Mágico',
    pitch: 'Foto a la factura del camión: Precio Mágico actualiza costos y te sugiere el precio al público. Inventario Mágico mete las piezas al anaquel.',
    priceMonth: Number(process.env.MP_PLAN_PRO_PRICE || 1350),
    priceYear: Number(process.env.MP_PLAN_PRO_YEAR_PRICE || 13500),
    aiQuota: AI_QUOTAS.pro,
    limits: PLAN_LIMITS.pro,
    highlight: false,
    features: [
      'Todo lo de Crecimiento',
      '20 usuarios',
      'Productos ilimitados',
      'Inventario Mágico: lista o foto al catálogo',
      'Precio Mágico: la IA ajusta costos y el precio al público',
      `${AI_QUOTAS.pro} usos de magia al mes`,
    ],
  },
  perpetual: {
    id: 'perpetual',
    name: 'Perpetua',
    tagline: 'Pago único, sin magia de IA',
    pitch: 'Caja, catálogo y tickets para siempre. No incluye Inventario Mágico ni Precio Mágico.',
    priceMonth: 0,
    priceYear: 0,
    aiQuota: 0,
    limits: PLAN_LIMITS.perpetual,
    highlight: false,
    public: false,
    features: [
      'Celular, tablet o PC en el navegador',
      'Sin instalar nada · 1 sucursal',
      'Hasta 20 usuarios',
      'Productos ilimitados',
      'Tickets 80 mm',
      'Sin Inventario Mágico ni Precio Mágico',
    ],
  },
};

function getPlan(planId) {
  return PLAN_CATALOG[planId] || null;
}

function planAiQuota(planId) {
  if (isPerpetual(planId)) return 0;
  const p = getPlan(planId);
  if (!p) return 0;
  return p.aiQuota;
}

function isPerpetual(planId) {
  return String(planId || '') === 'perpetual';
}

function hasAiFeatures(planId) {
  return planAiQuota(planId) > 0;
}

function planPrice(planId, interval = 'month') {
  const p = getPlan(planId);
  if (!p) return 0;
  return interval === 'year' ? p.priceYear : p.priceMonth;
}

function planLabel(planId, interval = 'month') {
  const p = getPlan(planId);
  if (!p) return 'Mi Tiendita';
  const suf = interval === 'year' ? ' anual' : '';
  return `Mi Tiendita ${p.name}${suf}`;
}

function formatAiQuota(quota) {
  if (quota == null) return 'Ilimitado';
  if (!Number(quota)) return 'No incluido';
  return `${quota} al mes`;
}

function planLimits(planId) {
  const p = getPlan(planId);
  return p?.limits || PLAN_LIMITS.basic;
}

function formatCap(n) {
  return n == null ? 'Ilimitado' : String(n);
}

function listPlans(currency = process.env.MP_CURRENCY || 'MXN') {
  return PLANS.map((id) => {
    const p = PLAN_CATALOG[id];
    const monthlyEq = Math.round(p.priceYear / 12);
    return {
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      pitch: p.pitch,
      price: p.priceMonth,
      promoPrice: promoPrice(id),
      promoMonths: PROMO.months,
      priceYear: p.priceYear,
      monthlyFromYear: monthlyEq,
      currency,
      description: p.tagline,
      features: p.features,
      highlight: Boolean(p.highlight),
      badge: p.badge || null,
      savingsYear: Math.max(0, p.priceMonth * 12 - p.priceYear),
      aiQuota: p.aiQuota,
      aiQuotaLabel: formatAiQuota(p.aiQuota),
      usersLimit: p.limits.users,
      productsLimit: p.limits.products,
      usersLimitLabel: formatCap(p.limits.users),
      productsLimitLabel: formatCap(p.limits.products),
      productName: 'Inventario Mágico y Precio Mágico',
    };
  });
}

module.exports = {
  PROMO,
  promoPrice,
  PLANS,
  ALL_PLANS,
  PLAN_CATALOG,
  AI_QUOTAS,
  PLAN_LIMITS,
  getPlan,
  planAiQuota,
  isPerpetual,
  hasAiFeatures,
  planLimits,
  planPrice,
  planLabel,
  formatAiQuota,
  formatCap,
  listPlans,
};

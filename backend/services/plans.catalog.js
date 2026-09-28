/**
 * Catálogo comercial Mi Tiendita (MXN) — SaaS 100% nube.
 * Inventario Mágico = actualización de precios/catálogo con IA (cuotas por plan).
 */
const PLANS = ['basic', 'growth', 'pro'];

/** Usos de Inventario Mágico (Gemini) por mes calendario. */
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
};

const PLAN_CATALOG = {
  basic: {
    id: 'basic',
    name: 'Básico',
    tagline: 'Entra desde cualquier pantalla y cobra',
    pitch: 'Se daña la PC del cajero? Abres Mi Tiendita en una tablet o el celular y sigues vendiendo al instante.',
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
      `${AI_QUOTAS.basic} actualizaciones con Inventario Mágico al mes`,
      'Tickets 80 mm',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Crecimiento',
    tagline: 'Más manos en caja, más catálogo',
    pitch: 'Varios cajeros a la vez y un catálogo grande — cobras desde el celular en el pasillo.',
    priceMonth: Number(process.env.MP_PLAN_GROWTH_PRICE || 599),
    priceYear: Number(process.env.MP_PLAN_GROWTH_YEAR_PRICE || 5990),
    aiQuota: AI_QUOTAS.growth,
    limits: PLAN_LIMITS.growth,
    highlight: true,
    badge: 'Recomendado',
    features: [
      'Todo lo del Básico',
      '6 usuarios (dueño + equipo)',
      'Hasta 1,500 productos',
      `${AI_QUOTAS.growth} actualizaciones con Inventario Mágico al mes`,
      'Cobra desde el celular en el pasillo',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'Catálogo grande y más Inventario Mágico',
    pitch: 'Foto a la factura del camión: la IA en la nube actualiza costos y precios. Imposible en una PC vieja local.',
    priceMonth: Number(process.env.MP_PLAN_PRO_PRICE || 899),
    priceYear: Number(process.env.MP_PLAN_PRO_YEAR_PRICE || 8990),
    aiQuota: AI_QUOTAS.pro,
    limits: PLAN_LIMITS.pro,
    highlight: false,
    features: [
      'Todo lo de Crecimiento',
      '20 usuarios',
      'Productos ilimitados',
      `${AI_QUOTAS.pro} actualizaciones con Inventario Mágico al mes`,
      'Lee listas y fotos de proveedores con IA',
    ],
  },
};

function getPlan(planId) {
  return PLAN_CATALOG[planId] || null;
}

function planAiQuota(planId) {
  const p = getPlan(planId);
  if (!p) return 0;
  return p.aiQuota;
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
      productName: 'Inventario Mágico',
    };
  });
}

module.exports = {
  PLANS,
  PLAN_CATALOG,
  AI_QUOTAS,
  PLAN_LIMITS,
  getPlan,
  planAiQuota,
  planLimits,
  planPrice,
  planLabel,
  formatAiQuota,
  formatCap,
  listPlans,
};

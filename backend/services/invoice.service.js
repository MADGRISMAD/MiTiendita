const REGIMES = [
  { code: '601', label: 'General de Ley Personas Morales' },
  { code: '603', label: 'Personas Morales con Fines no Lucrativos' },
  { code: '605', label: 'Sueldos y Salarios e Ingresos Asimilados a Salarios' },
  { code: '606', label: 'Arrendamiento' },
  { code: '612', label: 'Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '616', label: 'Sin obligaciones fiscales' },
  { code: '621', label: 'Incorporación Fiscal' },
  { code: '625', label: 'Actividades Empresariales a través de Plataformas Tecnológicas' },
  { code: '626', label: 'Régimen Simplificado de Confianza' },
];

const USES = [
  { code: 'G01', label: 'Adquisición de mercancías' },
  { code: 'G03', label: 'Gastos en general' },
  { code: 'S01', label: 'Sin efectos fiscales' },
  { code: 'CP01', label: 'Pagos' },
];

const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

const PAYMENT_FORMS = {
  cash: '01',
  transfer: '03',
  card: '04',
  other: '99',
};

function withinInvoiceMonth(date) {
  const sale = new Date(date || Date.now());
  const now = new Date();
  return sale.getFullYear() === now.getFullYear() && sale.getMonth() === now.getMonth();
}

function folioOf(order) {
  return String(order.id || '').slice(-8).toUpperCase();
}

function publicOrder(order, settings) {
  return {
    storeName: settings?.businessName || settings?.venueName || settings?.name || 'Tienda',
    folio: folioOf(order),
    createdAt: order.paidAt || order.createdAt,
    total: order.total,
    subtotal: order.subtotal,
    tax: order.tax,
    paymentMethod: order.paymentMethod,
    paymentForm: PAYMENT_FORMS[order.paymentMethod] || '99',
    paid: order.paymentStatus === 'paid',
    open: order.paymentStatus === 'paid' && withinInvoiceMonth(order.paidAt || order.createdAt),
    items: (order.items || []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
    regimes: REGIMES,
    uses: USES,
    invoice: order.invoice
      ? {
          status: order.invoice.status,
          rfc: order.invoice.rfc,
          legalName: order.invoice.legalName,
          postalCode: order.invoice.postalCode,
          taxRegime: order.invoice.taxRegime,
          cfdiUse: order.invoice.cfdiUse,
          email: order.invoice.email,
          requestedAt: order.invoice.requestedAt,
          issuedAt: order.invoice.issuedAt || null,
        }
      : null,
  };
}

function parseRequest(body = {}) {
  const rfc = String(body.rfc || '').trim().toUpperCase().replace(/\s+/g, '');
  const legalName = String(body.legalName || '').trim().replace(/\s+/g, ' ').toUpperCase();
  const postalCode = String(body.postalCode || '').trim();
  const taxRegime = String(body.taxRegime || '').trim();
  const cfdiUse = String(body.cfdiUse || '').trim();
  const email = String(body.email || '').trim().toLowerCase();

  if (!RFC_RE.test(rfc)) return { error: 'RFC inválido' };
  if (legalName.length < 3) return { error: 'Escribe la razón social tal como aparece en tu constancia' };
  if (!/^\d{5}$/.test(postalCode)) return { error: 'El código postal fiscal debe tener 5 dígitos' };
  if (!REGIMES.some((r) => r.code === taxRegime)) return { error: 'Elige un régimen fiscal' };
  if (!USES.some((u) => u.code === cfdiUse)) return { error: 'Elige el uso de CFDI' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Correo inválido' };

  return { rfc, legalName, postalCode, taxRegime, cfdiUse, email };
}

module.exports = {
  REGIMES,
  USES,
  withinInvoiceMonth,
  publicOrder,
  parseRequest,
};

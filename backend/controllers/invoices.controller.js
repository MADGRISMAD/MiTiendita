const db = require('../database/mongodb');
const { publicOrder, parseRequest, withinInvoiceMonth } = require('../services/invoice.service');
const {
  sendInvoiceRequestCustomerEmail,
  sendInvoiceRequestStoreEmail,
} = require('../utils/mail.utils');

const hits = new Map();

function limited(key, max, windowMs) {
  const now = Date.now();
  const fresh = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (fresh.length >= max) return true;
  fresh.push(now);
  hits.set(key, fresh);
  return false;
}

async function loadTicket(token) {
  const order = await db.GetOrderByInvoiceToken(token);
  if (!order) return null;
  const settings = await db.GetSettings(order.tenantId);
  return { order, settings };
}

function gate(order) {
  if (order.paymentStatus !== 'paid') {
    return { status: 409, message: 'Este ticket todavía no está cobrado' };
  }
  if (!withinInvoiceMonth(order.paidAt || order.createdAt)) {
    return {
      status: 410,
      message:
        'El plazo para facturar este ticket ya cerró. Solo se factura dentro del mes de la compra.',
    };
  }
  if (order.invoice?.status === 'issued') {
    return { status: 409, message: 'Esta factura ya fue emitida' };
  }
  return null;
}

function money(n) {
  return Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

async function notifyInvoiceEmails({ order, settings, invoice, publicView }) {
  const mail = { customer: null, store: [] };
  try {
    mail.customer = await sendInvoiceRequestCustomerEmail({
      to: invoice.email,
      storeName: publicView.storeName,
      folio: publicView.folio,
      total: money(publicView.total),
      rfc: invoice.rfc,
    });
  } catch (err) {
    console.error('[mail] cliente factura:', err.message);
    mail.customer = { sent: false, error: err.message, code: err.code };
  }

  try {
    const users = await db.ListUsersByTenant(order.tenantId);
    const owner = users.find((user) => user.role === 'admin') || users[0] || null;
    const adminEmail = String(owner?.email || '').trim().toLowerCase();
    if (adminEmail && adminEmail !== invoice.email) {
      try {
        const r = await sendInvoiceRequestStoreEmail({
          to: adminEmail,
          storeName: publicView.storeName,
          folio: publicView.folio,
          total: money(publicView.total),
          invoice,
        });
        mail.store.push({ email: adminEmail, ...r });
      } catch (err) {
        console.error('[mail] tienda factura:', err.message);
        mail.store.push({ email: adminEmail, sent: false, error: err.message, code: err.code });
      }
    }
  } catch (err) {
    console.error('[mail] owner factura:', err.message);
  }

  return mail;
}

async function getPublic(req, res) {
  try {
    if (limited(`get:${req.ip}`, 80, 10 * 60 * 1000)) {
      return res.status(429).send('Demasiados intentos. Espera un momento.');
    }
    const loaded = await loadTicket(req.params.token);
    if (!loaded) return res.status(404).send('Ticket no encontrado');
    return res.status(200).json(publicOrder(loaded.order, loaded.settings));
  } catch (err) {
    console.error(err);
    return res.status(500).send('No se pudo abrir el ticket');
  }
}

async function submitPublic(req, res) {
  try {
    if (limited(`post:${req.params.token}`, 8, 60 * 60 * 1000)) {
      return res.status(429).send('Demasiados intentos con este ticket.');
    }
    const loaded = await loadTicket(req.params.token);
    if (!loaded) return res.status(404).send('Ticket no encontrado');
    const blocked = gate(loaded.order);
    if (blocked) return res.status(blocked.status).send(blocked.message);

    const parsed = parseRequest(req.body);
    if (parsed.error) return res.status(400).send(parsed.error);

    const invoice = {
      status: 'requested',
      rfc: parsed.rfc,
      legalName: parsed.legalName,
      postalCode: parsed.postalCode,
      taxRegime: parsed.taxRegime,
      cfdiUse: parsed.cfdiUse,
      email: parsed.email,
      requestedAt: new Date(),
    };
    const updated = await db.UpdateOrder(
      loaded.order.id,
      { invoice, updatedAt: new Date() },
      loaded.order.tenantId
    );
    const view = publicOrder(updated, loaded.settings);
    const mail = await notifyInvoiceEmails({
      order: updated,
      settings: loaded.settings,
      invoice,
      publicView: view,
    });
    return res.status(200).json({ ...view, mail });
  } catch (err) {
    console.error(err);
    return res.status(500).send('No se pudo guardar la solicitud');
  }
}

module.exports = { getPublic, submitPublic };

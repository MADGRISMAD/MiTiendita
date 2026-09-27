const nodemailer = require('nodemailer');
const templates = require('./mail-templates');

function hasSmtpConfig() {
  return Boolean(
    process.env.RESEND_API_KEY ||
      (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) ||
      (process.env.SMTP_SERVICE && process.env.SMTP_USER && process.env.SMTP_PASS)
  );
}

function mailFrom() {
  return (
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    'Mi Tiendita <onboarding@mitiendita.software>'
  );
}

function createTransport() {
  if (process.env.SMTP_SERVICE) {
    return nodemailer.createTransport({
      service: process.env.SMTP_SERVICE,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendViaResend({ to, subject, html, headers }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: mailFrom(),
      to: [to],
      subject,
      html,
      headers: headers || undefined,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `Resend HTTP ${res.status}`;
    throw new Error(msg);
  }
  return { sent: true, provider: 'resend', id: data.id || null };
}

async function sendViaSmtp({ to, subject, html, messageId, inReplyTo, references }) {
  const transport = createTransport();
  const info = await transport.sendMail({
    from: mailFrom(),
    to,
    subject,
    html,
    messageId: messageId || undefined,
    inReplyTo: inReplyTo || undefined,
    references: references && references.length ? references : undefined,
  });
  return { sent: true, provider: 'smtp', id: info.messageId || messageId || null };
}

async function sendMail({ to, subject, html, messageId, inReplyTo, references }) {
  const recipient = String(to || '').trim().toLowerCase();
  if (!recipient || !recipient.includes('@')) {
    throw new Error('Destinatario de correo inválido');
  }
  if (!hasSmtpConfig()) {
    const err = new Error(
      'Correo no configurado. En backend/.env agrega SMTP (o RESEND_API_KEY) para enviar emails.'
    );
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }
  const headers = {};
  if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
  if (references && references.length) headers.References = references.join(' ');
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ to: recipient, subject, html, headers });
  }
  return sendViaSmtp({ to: recipient, subject, html, messageId, inReplyTo, references });
}

async function sendTemplated(to, built) {
  const result = await sendMail({ to, subject: built.subject, html: built.html });
  return { ...result, subject: built.subject };
}

async function sendInviteEmail({ to, inviteUrl, role, businessName }) {
  const built = templates.inviteEmail({ inviteUrl, role, businessName });
  const result = await sendTemplated(to, built);
  return { ...result, inviteUrl };
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  const built = templates.passwordResetEmail({ resetUrl });
  const result = await sendTemplated(to, built);
  return { ...result, resetUrl };
}

async function sendWelcomeEmail({ to, name, businessName, appUrl, trialDays }) {
  return sendTemplated(to, templates.welcomeEmail({ name, businessName, appUrl, trialDays }));
}

async function sendPaymentConfirmedEmail(opts) {
  return sendTemplated(opts.to, templates.paymentConfirmedEmail(opts));
}

async function sendSubscriptionCancelledEmail(opts) {
  return sendTemplated(opts.to, templates.subscriptionCancelledEmail(opts));
}

async function sendSupportReceivedEmail({ to, storeName, subject, message }) {
  return sendTemplated(to, templates.supportReceivedEmail({ storeName, subject, message }));
}

async function safeSend(fn) {
  try {
    if (!hasSmtpConfig()) return { sent: false, skipped: true };
    return await fn();
  } catch (err) {
    console.warn('[mail] envío omitido:', err.message);
    return { sent: false, error: err.message };
  }
}

async function sendInvoiceRequestCustomerEmail({
  to,
  storeName,
  folio,
  total,
  rfc,
}) {
  return sendTemplated(
    to,
    templates.invoiceCustomerEmail({ storeName, folio, total, rfc, email: to })
  );
}

async function sendInvoiceRequestStoreEmail({
  to,
  storeName,
  folio,
  total,
  invoice,
}) {
  return sendTemplated(
    to,
    templates.invoiceStoreEmail({ storeName, folio, total, invoice })
  );
}

async function verifyMailConfig() {
  if (!hasSmtpConfig()) {
    console.warn(
      '[mail] Sin SMTP/Resend: invitaciones, recuperación y facturas no enviarán correo.'
    );
    return false;
  }
  if (process.env.RESEND_API_KEY) {
    console.log('[mail] Proveedor: Resend');
    return true;
  }
  try {
    await createTransport().verify();
    console.log(`[mail] SMTP listo → ${process.env.SMTP_HOST || process.env.SMTP_SERVICE}`);
    return true;
  } catch (err) {
    console.error('[mail] SMTP configurado pero no conecta:', err.message);
    return false;
  }
}

module.exports = {
  hasSmtpConfig,
  sendMail,
  sendInviteEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentConfirmedEmail,
  sendSubscriptionCancelledEmail,
  sendSupportReceivedEmail,
  sendInvoiceRequestCustomerEmail,
  sendInvoiceRequestStoreEmail,
  safeSend,
  verifyMailConfig,
};

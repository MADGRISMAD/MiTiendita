/**
 * Envía los 4 machotes de correo a un destinatario de prueba.
 * Uso: node scripts/send-mail-previews.js [correo]
 */
require('dotenv').config();
const {
  sendInviteEmail,
  sendPasswordResetEmail,
  sendInvoiceRequestCustomerEmail,
  sendInvoiceRequestStoreEmail,
  verifyMailConfig,
} = require('../utils/mail.utils');

async function main() {
  const to = String(process.argv[2] || process.env.SMTP_USER || '').trim();
  if (!to) {
    console.error('Uso: node scripts/send-mail-previews.js tu@correo.com');
    process.exit(1);
  }
  const ok = await verifyMailConfig();
  if (!ok) process.exit(1);

  const appUrl = (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');

  console.log(`Enviando machotes a ${to}…`);

  await sendInviteEmail({
    to,
    inviteUrl: `${appUrl}/invite/demo-token-preview`,
    role: 'cashier',
    businessName: 'Abarrotes López',
  });
  console.log('✓ Invitación');

  await sendPasswordResetEmail({
    to,
    resetUrl: `${appUrl}/reset/demo-token-preview`,
  });
  console.log('✓ Recuperar contraseña');

  await sendInvoiceRequestCustomerEmail({
    to,
    storeName: 'Abarrotes López',
    folio: 'A1B2C3D4',
    total: '$62.00',
    rfc: 'XAXX010101000',
  });
  console.log('✓ Factura (cliente)');

  await sendInvoiceRequestStoreEmail({
    to,
    storeName: 'Abarrotes López',
    folio: 'A1B2C3D4',
    total: '$62.00',
    invoice: {
      rfc: 'XAXX010101000',
      legalName: 'PUBLICO EN GENERAL',
      postalCode: '44100',
      taxRegime: '616',
      cfdiUse: 'S01',
      email: to,
    },
  });
  console.log('✓ Factura (tienda)');

  console.log('Listo. Revisa bandeja (y spam).');
}

main().catch((err) => {
  console.error('Falló:', err.message);
  process.exit(1);
});

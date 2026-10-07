/**
 * Machote HTML de correos Mi Tiendita — un solo diseño para todos los envíos.
 * Colores alineados al POS (azul #1e5aa8 / topbar #123056).
 */

const BRAND = {
  name: 'Mi Tiendita',
  accent: '#e08a1e',
  primary: '#1e5aa8',
  topbar: '#123056',
  ink: '#1a2332',
  muted: '#64748b',
  surface: '#eef1f6',
  panel: '#ffffff',
  line: 'rgba(26,35,50,0.10)',
  success: '#2e7d32',
  successSoft: '#e8f5e9',
};

function wordmark(onDark) {
  const mi = onDark ? '#f0a94a' : BRAND.accent;
  const rest = onDark ? '#ffffff' : BRAND.primary;
  return `<span style="font-weight:800;letter-spacing:-0.03em;white-space:nowrap"><span style="color:${mi}">Mi</span><span style="color:${rest}"> Tiendita</span></span>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Botón principal + enlace de respaldo */
function cta(url, label) {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px">
      <tr>
        <td style="border-radius:10px;background:${BRAND.primary}">
          <a href="${safeUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:10px">${safeLabel}</a>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:12px;line-height:1.45;color:${BRAND.muted};word-break:break-all">
      Si el botón no abre, copia este enlace:<br>
      <a href="${safeUrl}" style="color:${BRAND.primary}">${safeUrl}</a>
    </p>`;
}

/** Caja de datos (folio, RFC, etc.) */
function dataBox(rows) {
  const lines = rows
    .filter((r) => r && r.value != null && String(r.value).trim() !== '')
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};width:38%;font-size:12px;font-weight:700;color:${BRAND.muted};text-transform:uppercase;letter-spacing:.04em;vertical-align:top">${escapeHtml(r.label)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${BRAND.line};font-size:14px;font-weight:700;color:${BRAND.ink};word-break:break-word">${escapeHtml(r.value)}</td>
      </tr>`
    )
    .join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:${BRAND.surface};border-radius:12px;padding:4px 14px">
      ${lines}
    </table>`;
}

function paragraph(text) {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${BRAND.ink}">${text}</p>`;
}

/**
 * Machote base. Todos los correos pasan por aquí.
 * @param {{ eyebrow?: string, title: string, body: string, footerNote?: string }} opts
 */
function renderMachote({ eyebrow = 'Mi Tiendita', title, body, footerNote }) {
  const year = new Date().getFullYear();
  const note = footerNote || 'Si no solicitaste esto, puedes ignorar este correo.';
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.surface};font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;color:${BRAND.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};padding:28px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.panel};border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(18,32,56,.10)">
          <tr>
            <td style="background:linear-gradient(145deg,${BRAND.topbar} 0%,${BRAND.primary} 100%);padding:24px 26px;color:#ffffff">
              <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;opacity:.78">${escapeHtml(eyebrow)}</div>
              <div style="font-size:24px;font-weight:800;letter-spacing:-0.02em;margin-top:6px;line-height:1.25">${escapeHtml(title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:26px 26px 8px">${body}</td>
          </tr>
          <tr>
            <td style="padding:8px 26px 26px">
              <div style="border-top:1px solid ${BRAND.line};padding-top:16px;font-size:12px;line-height:1.5;color:${BRAND.muted}">
                ${escapeHtml(note)}
                <div style="margin-top:10px">${wordmark(false)}</div>
                <div style="margin-top:2px">POS en la nube · ${year}</div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const ROLE_LABELS = {
  admin: 'Administrador',
  cashier: 'Cajero',
  waiter: 'Vendedor',
  hosstess: 'Anfitrión',
  kitchen: 'Cocina',
};

function inviteEmail({ inviteUrl, role, businessName }) {
  const shop = businessName || 'un negocio en Mi Tiendita';
  const roleLabel = ROLE_LABELS[role] || role;
  return {
    subject: `Invitación a Mi Tiendita${businessName ? ` — ${businessName}` : ''}`,
    html: renderMachote({
      eyebrow: 'Equipo Mi Tiendita',
      title: 'Te invitaron al equipo',
      body: [
        paragraph(`Te invitaron a unirte a <strong>${escapeHtml(shop)}</strong>.`),
        dataBox([
          { label: 'Negocio', value: shop },
          { label: 'Rol', value: roleLabel },
        ]),
        paragraph('Acepta la invitación para crear tu usuario y empezar a trabajar en la caja.'),
        cta(inviteUrl, 'Aceptar invitación'),
      ].join(''),
      footerNote: 'Este enlace caduca en 7 días. Si no esperabas la invitación, ignórala.',
    }),
  };
}

function passwordResetEmail({ resetUrl }) {
  return {
    subject: 'Restablecer contraseña — Mi Tiendita',
    html: renderMachote({
      eyebrow: 'Seguridad',
      title: 'Restablecer contraseña',
      body: [
        paragraph('Recibimos una solicitud para cambiar tu contraseña de Mi Tiendita.'),
        paragraph('Si fuiste tú, elige una nueva con este botón:'),
        cta(resetUrl, 'Elegir nueva contraseña'),
      ].join(''),
      footerNote: 'El enlace expira en 1 hora. Si no pediste esto, ignora el correo; tu cuenta sigue segura.',
    }),
  };
}

function invoiceCustomerEmail({ storeName, folio, total, rfc, email }) {
  return {
    subject: `Solicitud de factura ${folio} — ${storeName}`,
    html: renderMachote({
      eyebrow: storeName || 'Factura',
      title: 'Solicitud de factura recibida',
      body: [
        paragraph(
          `<strong>${escapeHtml(storeName)}</strong> ya tiene tus datos fiscales. Te enviarán el CFDI (XML y PDF) a este correo cuando la emitan. <strong>No hace falta volver a caja.</strong>`
        ),
        dataBox([
          { label: 'Folio', value: folio },
          { label: 'Total', value: total },
          { label: 'RFC', value: rfc },
          { label: 'Correo', value: email },
        ]),
        paragraph('Conserva este mensaje como comprobante de tu solicitud.'),
      ].join(''),
      footerNote: 'Documento informativo. La factura fiscal llegará en un correo aparte.',
    }),
  };
}

function invoiceStoreEmail({ storeName, folio, total, invoice }) {
  return {
    subject: `Factura pedida · ${folio} · ${storeName}`,
    html: renderMachote({
      eyebrow: 'Ventas · Facturas',
      title: 'Nueva solicitud de factura',
      body: [
        paragraph(
          `Un cliente pidió factura del ticket <strong>${escapeHtml(folio)}</strong>. Emite el CFDI y márcalo como facturado en <strong>Ventas → Facturas</strong>.`
        ),
        dataBox([
          { label: 'Folio', value: folio },
          { label: 'Total', value: total },
          { label: 'RFC', value: invoice.rfc },
          { label: 'Razón social', value: invoice.legalName },
          { label: 'C.P.', value: invoice.postalCode },
          { label: 'Régimen', value: invoice.taxRegime },
          { label: 'Uso CFDI', value: invoice.cfdiUse },
          { label: 'Correo cliente', value: invoice.email },
        ]),
      ].join(''),
      footerNote: `${storeName || 'Tienda'} · Aviso automático de Mi Tiendita`,
    }),
  };
}

function welcomeEmail({ name, businessName, appUrl, trialDays }) {
  const who = name || 'Hola';
  const shop = businessName || 'tu tienda';
  const days = trialDays || 3;
  return {
    subject: `Bienvenido a Mi Tiendita — ${days} días de prueba`,
    html: renderMachote({
      eyebrow: 'Bienvenida',
      title: `${who}, ya puedes cobrar`,
      body: [
        paragraph(
          `Tu cuenta para <strong>${escapeHtml(shop)}</strong> está lista. Tienes <strong>${days} días</strong> para configurar la caja, cargar productos y cobrar sin pagar.`
        ),
        paragraph('El camino más corto:'),
        dataBox([
          { label: '1', value: 'Nombra tu tienda en el asistente' },
          { label: '2', value: 'Carga el catálogo de ejemplo o tus productos' },
          { label: '3', value: 'Abre caja y cobra el primer ticket' },
        ]),
        cta(`${appUrl}/setup`, 'Configurar mi tienda'),
      ].join(''),
      footerNote: 'Si no creaste esta cuenta, ignora este correo.',
    }),
  };
}

function paymentConfirmedEmail({ businessName, planName, interval, amount, periodEnd, appUrl }) {
  const period = interval === 'year' ? 'anual' : 'mensual';
  return {
    subject: `Pago confirmado — ${planName} ${period}`,
    html: renderMachote({
      eyebrow: 'Facturación',
      title: 'Tu suscripción está activa',
      body: [
        paragraph(
          `Ya registramos el pago de <strong>${escapeHtml(businessName || 'tu tienda')}</strong>.`
        ),
        dataBox([
          { label: 'Plan', value: `${planName} ${period}` },
          { label: 'Importe', value: amount },
          { label: 'Vigencia', value: periodEnd },
        ]),
        paragraph('Puedes cambiar o cancelar el plan cuando quieras desde Facturación. Si cancelas, sigues usando el sistema hasta el fin del periodo pagado.'),
        cta(`${appUrl}/billing`, 'Ver facturación'),
      ].join(''),
      footerNote: 'Recibo informativo de Mi Tiendita. El cargo aparece en Mercado Pago.',
    }),
  };
}

function subscriptionCancelledEmail({ businessName, planName, periodEnd, appUrl }) {
  return {
    subject: `Suscripción cancelada — ${planName}`,
    html: renderMachote({
      eyebrow: 'Facturación',
      title: 'Cancelamos el cargo recurrente',
      body: [
        paragraph(
          `La suscripción de <strong>${escapeHtml(businessName || 'tu tienda')}</strong> no se renovará.`
        ),
        dataBox([
          { label: 'Plan', value: planName },
          { label: 'Acceso hasta', value: periodEnd || 'el fin del periodo pagado' },
        ]),
        paragraph('Sigues cobrando con normalidad hasta esa fecha. Si cambias de opinión, vuelve a Facturación y elige un plan.'),
        cta(`${appUrl}/billing`, 'Reactivar plan'),
      ].join(''),
      footerNote: 'No se harán más cargos automáticos por esta suscripción.',
    }),
  };
}

function supportReceivedEmail({ storeName, subject, message }) {
  return {
    subject: `Recibimos tu mensaje — ${subject}`,
    html: renderMachote({
      eyebrow: 'Soporte',
      title: 'Ya estamos leyendo tu caso',
      body: [
        paragraph(
          `Gracias, <strong>${escapeHtml(storeName || 'tu tienda')}</strong>. Respondemos a este mismo correo.`
        ),
        dataBox([
          { label: 'Asunto', value: subject },
          { label: 'Mensaje', value: message },
        ]),
      ].join(''),
      footerNote: 'También puedes escribirnos de nuevo desde Configuración → Soporte.',
    }),
  };
}

function supportReplyEmail({ storeName, message }) {
  const body = escapeHtml(message).replace(/\n/g, '<br>');
  return {
    subject: `Mensaje de Mi Tiendita para ${storeName || 'tu tienda'}`,
    html: renderMachote({
      eyebrow: 'Soporte',
      title: 'Te escribimos de Mi Tiendita',
      body: paragraph(body),
      footerNote: 'Responde este correo y lo vemos en soporte.',
    }),
  };
}

function mxn(value) {
  return Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 2,
  });
}

function reportRows(rows, empty) {
  if (!rows.length) {
    return `<tr><td colspan="3" style="padding:6px 0;color:${BRAND.muted};font-size:11px">${escapeHtml(empty)}</td></tr>`;
  }
  return rows
    .map(
      (row) => `<tr>
        <td style="padding:3px 8px 3px 0;font-size:11px;border-bottom:1px solid ${BRAND.line}">${escapeHtml(row.left)}</td>
        <td style="padding:3px 8px;font-size:11px;color:${BRAND.muted};border-bottom:1px solid ${BRAND.line}">${escapeHtml(row.mid || '')}</td>
        <td style="padding:3px 0;font-size:11px;font-weight:800;text-align:right;border-bottom:1px solid ${BRAND.line}">${escapeHtml(row.right)}</td>
      </tr>`
    )
    .join('');
}

function ownerMonthlyReport(books) {
  const [year, month] = String(books.month || '').split('-').map(Number);
  const titleDate = new Date(Date.UTC(year || 2026, (month || 1) - 1, 1));
  const title = titleDate.toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const heading = title.charAt(0).toUpperCase() + title.slice(1);
  const payers = (books.payers || []).slice(0, 5);
  const aiRows = (books.ai?.clients || []).slice(0, 4);
  const expenseRows = (books.expenses || []).slice(0, 4);
  const extra = (list, shown) => (list.length > shown ? `<p style="margin:4px 0 0;font-size:10px;color:${BRAND.muted}">y ${list.length - shown} más</p>` : '');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Mi Tiendita · ${escapeHtml(heading)}</title>
  <style>
    @page { size: letter portrait; margin: 0.4in; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${BRAND.surface}; color: ${BRAND.ink}; font-family: Figtree, "Segoe UI", Helvetica, Arial, sans-serif; }
    .toolbar { display: flex; justify-content: center; gap: 8px; padding: 12px; }
    .toolbar button { border: 0; border-radius: 8px; background: ${BRAND.primary}; color: #fff; font-weight: 800; padding: 10px 16px; cursor: pointer; }
    .page { width: 7.7in; height: 10.2in; margin: 0 auto 16px; background: #fff; overflow: hidden; border-radius: 14px; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none !important; }
      .page { width: auto; height: 10.2in; margin: 0; border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Guardar PDF</button>
  </div>
  <article class="page">
    <header style="background:linear-gradient(145deg,${BRAND.topbar} 0%,${BRAND.primary} 100%);color:#fff;padding:16px 22px 14px">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.8">Soporte · Reporte mensual</div>
      <div style="font-size:18px;margin-bottom:4px">${wordmark(true)}</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-.03em;margin-top:2px">${escapeHtml(heading)}</div>
    </header>
    <div style="padding:12px 22px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 0;margin:0 -8px 8px">
        <tr>
          ${[
            ['Ganancia', mxn(books.profit)],
            ['Ingresos', mxn(books.revenue)],
            ['Gasto de IA', mxn(books.ai?.cost)],
            ['Otros gastos', mxn(books.expensesTotal)],
          ]
            .map(
              ([label, value]) => `<td style="width:25%;background:${BRAND.surface};border-radius:10px;padding:8px 10px">
                <div style="font-size:9px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:${BRAND.muted}">${label}</div>
                <div style="font-size:15px;font-weight:800;margin-top:2px">${escapeHtml(value)}</div>
              </td>`
            )
            .join('')}
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
        <tr>
          <td width="48%" valign="top" style="padding-right:12px">
            <div style="font-size:12px;font-weight:800;margin-bottom:4px">Planes activos</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${reportRows(
                (books.byPlan || []).map((plan) => ({
                  left: plan.name,
                  mid: `${plan.clients} clientes`,
                  right: mxn(plan.amount),
                })),
                'Sin planes activos.'
              )}
            </table>
          </td>
          <td width="52%" valign="top">
            <div style="font-size:12px;font-weight:800;margin-bottom:4px">Clientes</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${reportRows(
                [
                  { left: 'En total', right: String(books.clients?.total || 0) },
                  { left: 'Activos', right: String(books.clients?.active || 0) },
                  { left: 'En prueba', right: String(books.clients?.trialing || 0) },
                  { left: 'Pago atrasado', right: String(books.clients?.pastDue || 0) },
                  { left: 'Suspendidos', right: String(books.clients?.suspended || 0) },
                ],
                ''
              )}
            </table>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">
        <tr>
          <td width="34%" valign="top" style="padding-right:10px">
            <div style="font-size:12px;font-weight:800;margin-bottom:4px">Quién paga</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${reportRows(
                payers.map((row) => ({ left: row.businessName, mid: row.planName, right: mxn(row.amount) })),
                'Nadie con plan activo.'
              )}
            </table>
            ${extra(books.payers || [], 5)}
          </td>
          <td width="33%" valign="top" style="padding-right:10px">
            <div style="font-size:12px;font-weight:800;margin-bottom:4px">IA del mes</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${reportRows(
                aiRows.map((row) => ({ left: row.businessName, mid: `${row.uses} usos`, right: mxn(row.cost) })),
                'Sin usos este mes.'
              )}
            </table>
            ${extra(books.ai?.clients || [], 4)}
          </td>
          <td width="33%" valign="top">
            <div style="font-size:12px;font-weight:800;margin-bottom:4px">Gastos anotados</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              ${reportRows(
                expenseRows.map((row) => ({ left: row.label, mid: row.note || '', right: mxn(row.amount) })),
                'Sin gastos anotados.'
              )}
            </table>
            ${extra(books.expenses || [], 4)}
          </td>
        </tr>
      </table>
    </div>
    <footer style="padding:10px 22px 0">
      <div style="border-top:1px solid ${BRAND.line};padding-top:8px;font-size:10px;line-height:1.4;color:${BRAND.muted}">
        El gasto de IA es un estimado de ${escapeHtml(mxn(books.ai?.costPerUse))} por uso. El cargo real está en Google.
        <div style="margin-top:6px">${wordmark(false)}</div>
        <div>POS en la nube · ${new Date().getFullYear()}</div>
      </div>
    </footer>
  </article>
</body>
</html>`;
}

module.exports = {
  BRAND,
  renderMachote,
  cta,
  dataBox,
  inviteEmail,
  passwordResetEmail,
  invoiceCustomerEmail,
  invoiceStoreEmail,
  welcomeEmail,
  paymentConfirmedEmail,
  subscriptionCancelledEmail,
  supportReceivedEmail,
  supportReplyEmail,
  ownerMonthlyReport,
};

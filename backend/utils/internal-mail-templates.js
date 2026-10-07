/**
 * Machote de correos del sistema interno de MiTiendita.
 * Paleta bosque — distinta del POS azul de Mi Tiendita.
 */

const LOGO_URL = 'https://www.mitiendita.software/icons/icon-192.png';

const INTERNAL = {
  name: 'MiTiendita',
  service: 'Mi Tiendita',
  canopy: '#0d2218',
  forest: '#16432a',
  moss: '#2a6b45',
  leaf: '#8fbc6a',
  gold: '#c9a24a',
  mist: '#e7efe4',
  paper: '#fbf8f1',
  ink: '#122017',
  muted: '#5a7164',
  line: 'rgba(13,34,24,0.10)',
  fail: '#7a2e2a',
  warn: '#8a5a18',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brandWordmark(onDark, sizePx) {
  const size = sizePx || 28;
  const mi = onDark ? INTERNAL.leaf : INTERNAL.moss;
  const rest = onDark ? INTERNAL.paper : INTERNAL.canopy;
  return `<span style="font-weight:800;letter-spacing:-0.045em;font-size:${size}px;line-height:1;white-space:nowrap"><span style="color:${mi}">Mi</span><span style="color:${rest}">Tiendita</span></span>`;
}

/** Logo + nombre, como la tarjeta de Caresia (logo de 44 px con esquinas redondeadas). */
function brandLockup(size, logoPx) {
  return `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="padding:0 12px 0 0;vertical-align:middle"><img src="${LOGO_URL}" width="${logoPx}" height="${logoPx}" alt="" style="display:block;border:0;border-radius:${Math.round(logoPx / 4)}px"></td>
                <td style="vertical-align:middle">${brandWordmark(true, size)}</td>
              </tr></table>`;
}

function statusTheme(result) {
  if (result === 'success') {
    return {
      result,
      stripe: INTERNAL.moss,
      stripeText: '#f4fbf4',
      pill: 'En producción',
      title: 'Mi Tiendita ya está en el aire',
      lead: 'El servicio quedó publicado. Revisa que caja, cobros y el dominio respondan como esperabas.',
      subject: 'MiTiendita · Mi Tiendita en producción',
      preheader: 'Deploy listo. Mi Tiendita quedó en producción.',
      primaryLabel: 'Abrir producción',
      primaryUrlKey: 'prodUrl',
      secondaryLabel: 'Ver el registro',
      secondaryUrlKey: 'runUrl',
    };
  }
  if (result === 'cancelled') {
    return {
      result,
      stripe: INTERNAL.warn,
      stripeText: '#fff8ea',
      pill: 'Cancelado',
      title: 'El deploy de Mi Tiendita se canceló',
      lead: 'La publicación no llegó a terminar. Si no lo cancelaron a propósito, vuelve a lanzar el workflow.',
      subject: 'MiTiendita · Deploy cancelado — Mi Tiendita',
      preheader: 'El deploy se canceló. Mi Tiendita no se actualizó.',
      primaryLabel: 'Ver el registro',
      primaryUrlKey: 'runUrl',
      secondaryLabel: 'Ver el commit',
      secondaryUrlKey: 'commitUrl',
    };
  }
  return {
    result: 'failure',
    stripe: INTERNAL.fail,
    stripeText: '#fff6f4',
    pill: 'Falló',
    title: 'El deploy de Mi Tiendita no se completó',
    lead: 'Producción no se actualizó. Abre el registro, mira el error del build y corrige antes de volver a publicar.',
    subject: 'MiTiendita · Deploy falló — Mi Tiendita',
    preheader: 'Falló el deploy. Mi Tiendita sigue con la versión anterior.',
    primaryLabel: 'Ver el registro',
    primaryUrlKey: 'runUrl',
    secondaryLabel: 'Ver el commit',
    secondaryUrlKey: 'commitUrl',
  };
}

function factRow(label, value, { last } = {}) {
  if (value == null || String(value).trim() === '') return '';
  const border = last ? 'none' : `1px solid ${INTERNAL.line}`;
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:${border};width:34%;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${INTERNAL.muted};vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:${border};font-size:15px;font-weight:700;color:${INTERNAL.ink};word-break:break-word">${value}</td>
    </tr>`;
}

function btn(url, label, fill) {
  const safeUrl = escapeHtml(url);
  const bg = fill ? INTERNAL.forest : INTERNAL.mist;
  const fg = fill ? '#ffffff' : INTERNAL.forest;
  const border = fill ? INTERNAL.forest : 'rgba(13,34,24,0.16)';
  return `
    <td style="padding:0 8px 0 0">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border-radius:12px;background:${bg};border:1px solid ${border}">
            <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;color:${fg};text-decoration:none;font-weight:800;font-size:14px;letter-spacing:-0.01em">${escapeHtml(label)}</a>
          </td>
        </tr>
      </table>
    </td>`;
}

/**
 * Machote interno de MiTiendita.
 * @param {{ eyebrow?: string, title: string, body: string, preheader?: string, stripe?: string, stripeText?: string, stripeLabel?: string, footerNote?: string }} opts
 */
function renderInternalMachote({
  eyebrow = 'Sistema interno',
  title,
  body,
  preheader = '',
  stripe,
  stripeText = '#f4fbf4',
  stripeLabel = '',
  footerNote,
}) {
  const year = new Date().getFullYear();
  const note = footerNote || 'Aviso automático del equipo de MiTiendita. No es un correo para clientes.';
  const hidden = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : '';
  const stripeBlock = stripe
    ? `<tr>
        <td class="px" style="background:${stripe};color:${stripeText};padding:12px 28px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">
          ${escapeHtml(stripeLabel)}
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <style>@media only screen and (max-width:480px){.px{padding-left:18px!important;padding-right:18px!important}.ttl{font-size:19px!important}}</style>
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${INTERNAL.mist};font-family:Figtree,'Segoe UI',Helvetica,Arial,sans-serif;color:${INTERNAL.ink}">
  ${hidden}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INTERNAL.mist};padding:28px 10px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:${INTERNAL.paper};border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(13,34,24,.14)">
          <tr>
            <td class="px" style="background:linear-gradient(160deg,${INTERNAL.canopy} 0%,${INTERNAL.forest} 58%,${INTERNAL.moss} 100%);padding:26px 28px 22px">
              <div style="font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:${INTERNAL.leaf}">${escapeHtml(eyebrow)}</div>
              <div style="margin-top:14px">${brandLockup(28, 44)}</div>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px">
                <tr><td style="height:3px;width:56px;background:${INTERNAL.gold};font-size:0;line-height:0">&nbsp;</td></tr>
              </table>
              <div class="ttl" style="margin-top:14px;font-size:22px;font-weight:800;letter-spacing:-0.03em;line-height:1.25;color:${INTERNAL.paper}">${escapeHtml(title)}</div>
            </td>
          </tr>
          ${stripeBlock}
          <tr>
            <td class="px" style="padding:26px 28px 10px">${body}</td>
          </tr>
          <tr>
            <td class="px" style="padding:6px 28px 26px">
              <div style="border-top:1px solid ${INTERNAL.line};padding-top:16px;font-size:12px;line-height:1.55;color:${INTERNAL.muted}">
                ${escapeHtml(note)}
                <div style="margin-top:12px">${brandWordmark(false, 16)}</div>
                <div style="margin-top:2px">operación · ${year}</div>
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

function deployStatusEmail(input = {}) {
  const theme = statusTheme(input.result);
  const sha = String(input.sha || '');
  const short = sha ? sha.slice(0, 7) : '(sin SHA)';
  const message = (input.message || '').trim() || '(sin mensaje)';
  const urls = {
    prodUrl: input.prodUrl || 'https://www.mitiendita.software/',
    runUrl: input.runUrl || '',
    commitUrl: input.commitUrl || '',
  };
  const primaryUrl = urls[theme.primaryUrlKey];
  const secondaryUrl = urls[theme.secondaryUrlKey];
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

  const body = [
    `<p style="margin:0 0 18px;font-size:15px;line-height:1.65;color:${INTERNAL.ink}">${escapeHtml(theme.lead)}</p>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:${INTERNAL.mist};border-radius:14px">
      <tr><td style="padding:8px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">`,
    factRow('Servicio', escapeHtml(input.serviceName || INTERNAL.service)),
    factRow('Repositorio', escapeHtml(input.repository || '')),
    factRow('Rama', escapeHtml(input.branch || '')),
    factRow('SHA', `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px">${escapeHtml(short)}</span>`),
    factRow('Autor', escapeHtml(input.author || '(desconocido)')),
    factRow('Publicó', escapeHtml(input.pusher || '(desconocido)')),
    factRow('Fecha', escapeHtml(input.when || ''), { last: true }),
    `        </table>
      </td></tr>
    </table>`,
    `<div style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${INTERNAL.muted}">Mensaje del commit</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
      <td style="width:3px;background:${INTERNAL.gold};font-size:0;line-height:0">&nbsp;</td>
      <td style="padding:14px 16px;background:${INTERNAL.mist};font-size:14px;line-height:1.55;color:${INTERNAL.ink}">${safeMessage}</td>
    </tr></table>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 12px"><tr>`,
    primaryUrl ? btn(primaryUrl, theme.primaryLabel, true) : '',
    secondaryUrl ? btn(secondaryUrl, theme.secondaryLabel, false) : '',
    `</tr></table>`,
  ].join('');

  const text = [
    `${INTERNAL.name} · ${theme.pill}`,
    theme.title,
    '',
    theme.lead,
    '',
    `Servicio: ${input.serviceName || INTERNAL.service}`,
    `Repositorio: ${input.repository || ''}`,
    `Rama: ${input.branch || ''}`,
    `SHA: ${short}`,
    `Autor: ${input.author || ''}`,
    `Quién hizo push: ${input.pusher || ''}`,
    `Fecha: ${input.when || ''}`,
    '',
    'Mensaje del commit:',
    message,
    '',
    urls.commitUrl ? `Commit: ${urls.commitUrl}` : '',
    urls.runUrl ? `Registro: ${urls.runUrl}` : '',
    urls.prodUrl ? `Producción: ${urls.prodUrl}` : '',
    '',
    'Aviso automático del equipo de MiTiendita.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return {
    subject: theme.subject,
    html: renderInternalMachote({
      eyebrow: 'Sistema interno',
      title: theme.title,
      body,
      preheader: theme.preheader,
      stripe: theme.stripe,
      stripeText: theme.stripeText,
      stripeLabel: theme.pill,
      footerNote: 'Aviso automático del equipo de MiTiendita. Los clientes de Mi Tiendita no reciben este correo.',
    }),
    text,
  };
}

module.exports = {
  INTERNAL,
  brandWordmark,
  renderInternalMachote,
  deployStatusEmail,
  escapeHtml,
};

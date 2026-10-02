/**
 * Origen del frontend para links en correos (invite / reset).
 * Prefiere Origin/Referer (útil en LAN desde el celular) y cae a APP_URL.
 */
function resolveAppUrl(req) {
  const configured = String(process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const raw = req?.get?.('origin') || req?.get?.('referer') || '';
  if (!raw) return configured;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return configured;
    return u.origin;
  } catch {
    return configured;
  }
}

module.exports = { resolveAppUrl };

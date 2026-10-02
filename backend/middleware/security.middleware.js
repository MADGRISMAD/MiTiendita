/**
 * Cabeceras de seguridad (las mismas que pone helmet por omisión, ajustadas a una API JSON).
 * La API no sirve HTML, así que la CSP es la más cerrada posible.
 */
function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-XSS-Protection', '0');
  if (req.secure || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

module.exports = { securityHeaders };

const staticDomains = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
];

function isAllowedOrigin(origin) {
  const extra = [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL]
    .filter(Boolean)
    .flatMap((value) => {
      const host = String(value).replace(/^https?:\/\//, '').replace(/\/$/, '');
      return [`https://${host}`, `http://${host}`];
    });
  if (extra.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname.endsWith('.vercel.app') ||
      hostname === 'mitiendita.software' ||
      hostname.endsWith('.mitiendita.software')
    );
  } catch {
    return false;
  }
}

function isPrivateLanOrigin(origin) {
  if (!origin) return false;
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    const parts = hostname.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [a, b] = parts;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  } catch {
    return false;
  }
}

module.exports = {
  origin(origin, callback) {
    if (!origin || staticDomains.includes(origin) || isPrivateLanOrigin(origin) || isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  optionsSuccessStatus: 200,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

/**
 * Cifra datos sensibles guardados en la base (p. ej. el secreto de 2FA) con AES-256-GCM.
 * La llave sale de MFA_ENCRYPTION_KEY o, si no hay, de SECRET_KEY.
 */
const crypto = require('crypto');

function key() {
  const base = process.env.MFA_ENCRYPTION_KEY || process.env.SECRET_KEY || '';
  if (!base) throw new Error('Falta SECRET_KEY para cifrar');
  return crypto.createHash('sha256').update(`mt-secret-box:${base}`).digest();
}

function seal(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
}

function open(sealed) {
  const [v, iv, tag, data] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { seal, open };

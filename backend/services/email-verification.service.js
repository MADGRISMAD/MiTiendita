/**
 * Verificación del correo al registrarse: se manda un código de 6 dígitos y la cuenta solo se crea si lo escriben bien.
 * Frena correos falsos y altas en masa. Sin correo configurado en el servidor no hay forma de mandarlo: ahí no se exige.
 */
const crypto = require('crypto');
const db = require('../database/mongodb');
const { hasSmtpConfig, sendVerificationEmail } = require('../utils/mail.utils');
const { httpError } = require('../utils/http-error');

const TTL_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MAX_TRIES = 5;
const MAX_SENDS_PER_HOUR = 5;

const norm = (email) => String(email || '').trim().toLowerCase();
const hash = (email, code) =>
  crypto.createHmac('sha256', process.env.SECRET_KEY || 'mitiendita').update(`${email}:${String(code).trim()}`).digest('hex');

const required = () => hasSmtpConfig() && process.env.SIGNUP_VERIFY !== 'off';

/** Manda un código nuevo al correo (con espera entre envíos y tope por hora). */
async function send(emailInput) {
  const email = norm(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Escribe un correo válido.');
  const now = Date.now();
  const current = await db.GetEmailCode(email);
  if (current && now - new Date(current.sentAt).getTime() < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - new Date(current.sentAt).getTime())) / 1000);
    throw httpError(429, `Espera ${wait} s para pedir otro código.`);
  }
  const recent = (current?.sends || []).filter((t) => now - new Date(t).getTime() < HOUR_MS);
  if (recent.length >= MAX_SENDS_PER_HOUR) throw httpError(429, 'Ya pediste varios códigos para este correo. Intenta en una hora.');

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.SaveEmailCode(email, {
    email,
    codeHash: hash(email, code),
    tries: 0,
    sentAt: new Date(now),
    sends: [...recent, new Date(now)],
    expiresAt: new Date(now + TTL_MS),
  });
  try {
    await sendVerificationEmail({ to: email, code });
  } catch (err) {
    await db.DeleteEmailCode(email);
    console.error('[verify] no se pudo mandar el código:', err.message);
    throw httpError(502, 'No pudimos enviar el correo. Revisa que esté bien escrito e inténtalo de nuevo.');
  }
}

/** Revisa el código del correo y lo gasta. Lanza 400 si falta, venció o está mal. */
async function consume(emailInput, codeInput) {
  if (!required()) return;
  const email = norm(emailInput);
  const code = String(codeInput || '').replace(/\D/g, '');
  if (code.length !== 6) throw httpError(400, 'Escribe el código de 6 dígitos que te enviamos al correo.', 'email_code_required');
  const doc = await db.GetEmailCode(email);
  if (!doc || new Date(doc.expiresAt).getTime() < Date.now()) throw httpError(400, 'El código venció. Pide uno nuevo.', 'email_code_expired');
  const a = Buffer.from(doc.codeHash);
  const b = Buffer.from(hash(email, code));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const tries = await db.BumpEmailCodeTries(email);
    if (tries >= MAX_TRIES) {
      await db.DeleteEmailCode(email);
      throw httpError(400, 'Demasiados intentos. Pide un código nuevo.', 'email_code_expired');
    }
    throw httpError(400, 'El código no es correcto.', 'email_code_wrong');
  }
  await db.DeleteEmailCode(email);
}

module.exports = { send, consume, required };

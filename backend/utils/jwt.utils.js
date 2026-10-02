require('dotenv').config();
const JWT = require('jsonwebtoken');

function secret() {
  return process.env.SECRET_KEY;
}

/** Access token de sesión. */
const generateJWT = (payload, expiresIn = '15m') => {
  try {
    return JWT.sign(payload, secret(), { expiresIn });
  } catch (error) {
    console.error(error);
    return null;
  }
};

/** Lee «Bearer <jwt>». Rechaza los tokens de propósito especial (2FA). */
const verifyToken = (token) => {
  try {
    const jwt = String(token || '').split(' ')[1];
    const payload = JWT.verify(jwt, secret());
    return payload && !payload.purpose ? payload : null;
  } catch {
    return null;
  }
};

/** Token corto para un paso intermedio (p. ej. pedir el código de 2FA tras la contraseña). */
const signPurposeToken = (purpose, data, expiresIn = '10m') =>
  JWT.sign({ ...data, purpose }, secret(), { expiresIn });

const verifyPurposeToken = (token, purpose) => {
  try {
    const payload = JWT.verify(String(token || ''), secret());
    return payload && payload.purpose === purpose ? payload : null;
  } catch {
    return null;
  }
};

module.exports = {
  generateJWT,
  verifyToken,
  signPurposeToken,
  verifyPurposeToken,
};

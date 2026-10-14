/**
 * Error con código HTTP para que el controlador responda con él.
 * `extra`: un texto es el código del error (`err.code`); un objeto se copia al error (p. ej. `{ shortages }`).
 */
function httpError(status, message, extra) {
  const err = new Error(message);
  err.status = status;
  if (typeof extra === 'string') {
    if (extra) err.code = extra;
  } else if (extra && typeof extra === 'object') {
    Object.assign(err, extra);
  }
  return err;
}

module.exports = { httpError };

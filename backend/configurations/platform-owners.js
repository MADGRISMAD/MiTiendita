// Admins permanentes de la plataforma: nadie los puede quitar desde la app.
// Para cambiar esta lista hay que cambiar el código, así queda en el historial de git.
const PERMANENT_ADMINS = ['madgrismad@gmail.com', 'mayra.bamaca09@gmail.com', 'luispantoja1102@gmail.com'];

function isPermanentAdmin(user) {
  return PERMANENT_ADMINS.includes(String(user?.email || '').trim().toLowerCase());
}

module.exports = { PERMANENT_ADMINS, isPermanentAdmin };

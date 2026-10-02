// Reglas de contraseña. Mantener idéntico a backend/utils/password-policy.js
// (lo comprueba backend/test/password-policy.test.js). Sin imports: la prueba lo carga como módulo.

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 128;

// Las más usadas en filtraciones (en minúsculas), incluidas las comunes en español
const COMMON = new Set([
  "123456789012", "1234567890", "12345678901", "0123456789", "0987654321", "1111111111", "0000000000",
  "1234512345", "1122334455", "1234554321", "9876543210", "123456789a", "a123456789", "1q2w3e4r5t",
  "1qaz2wsx3edc", "qwertyuiop", "qwertyuiop123", "qwerty1234", "qwerty12345", "qwerty123456", "asdfghjkl1",
  "asdfghjklñ", "zxcvbnm123", "password12", "password123", "password1234", "passw0rd123", "p@ssw0rd12",
  "iloveyou12", "iloveyou123", "princess12", "sunshine12", "football12", "baseball12", "superman12",
  "starwars12", "dragon1234", "monkey1234", "letmein123", "welcome123", "welcome1234", "admin12345",
  "administrador", "administrator", "contraseña", "contraseña1", "contraseña12", "contraseña123",
  "contrasena", "contrasena1", "contrasena12", "contrasena123", "micontraseña", "micontrasena",
  "tequiero123", "teamo12345", "teamomucho", "mexico1234", "mexico12345", "mexico123456", "america123",
  "chivas1234", "chivas12345", "guadalupe1", "guadalupe12", "abarrotes1", "abarrotes12", "abarrotes123",
  "mitiendita", "mitiendita1", "mitiendita12", "mitiendita123", "tiendita123", "tiendita1234",
  "holahola12", "hola123456", "hola1234567", "estrella12", "corazon123", "mariposa12", "angelito12",
  "abcdefghij", "abcdefghijk", "abcd123456", "abc1234567", "abcabcabc1", "qazwsxedcr", "trustno1234",
  "changeme123", "cambiame123", "secreto123", "secreto1234", "usuario123", "usuario1234", "prueba1234",
  "prueba12345", "test123456", "testtest12", "1234qwerty", "1234abcd12", "aaaaaaaaaa", "zzzzzzzzzz",
]);

const SEQUENCES = ["0123456789", "1234567890", "9876543210", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjklñ", "zxcvbnm"];

function isSequential(lower) {
  const compact = lower.replace(/\s+/g, "");
  if (compact.length < 6) return false;
  return SEQUENCES.some((seq) => seq.includes(compact) || (compact.length >= 8 && seq.repeat(3).includes(compact)));
}

/**
 * Revisa una contraseña nueva. Devuelve el motivo en español o "" si es válida.
 * @param {string} password
 * @param {{ email?: string, username?: string, name?: string }} [about] datos de la persona (no deben formar la contraseña)
 */
export function passwordProblem(password, about = {}) {
  const pw = String(password || "");
  if (pw.length < MIN_PASSWORD) return `Usa al menos ${MIN_PASSWORD} caracteres. Una frase corta funciona: «mi tienda abre a las 7».`;
  if (pw.length > MAX_PASSWORD) return `Usa como máximo ${MAX_PASSWORD} caracteres.`;
  const lower = pw.toLowerCase();
  if (new Set(lower.replace(/\s+/g, "")).size < 4) return "Usa más variedad: casi todos los caracteres son iguales.";
  if (COMMON.has(lower) || COMMON.has(lower.replace(/\s+/g, ""))) return "Esa contraseña es de las más usadas y fáciles de adivinar. Elige otra.";
  if (isSequential(lower)) return "Evita secuencias como 1234567890 o qwertyuiop.";
  const personal = [about.email && String(about.email).split("@")[0], about.username, about.name]
    .map((v) => String(v || "").toLowerCase().trim())
    .filter((v) => v.length >= 4);
  if (personal.some((v) => lower.includes(v) && lower.replace(v, "").replace(/[\d\s\W_]/g, "").length < 4)) {
    return "No uses tu correo o tu nombre como contraseña.";
  }
  return "";
}

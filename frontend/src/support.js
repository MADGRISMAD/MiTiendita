// Soporte por WhatsApp (link wa.me con mensaje prellenado).
// El número y el horario se configuran con VITE_SUPPORT_WHATSAPP y VITE_SUPPORT_HOURS al compilar;
// si no vienen, se usan los de Mi Tiendita.
const env = import.meta.env || {};

/** Número con lada de país, solo dígitos (52 = México). */
export const SUPPORT_WHATSAPP = normalizePhone(env.VITE_SUPPORT_WHATSAPP || "526645798903");
export const SUPPORT_HOURS = env.VITE_SUPPORT_HOURS || "Lunes a viernes, de 8:00 a 22:00";

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  // 10 dígitos de México sin lada de país
  return digits.length === 10 ? `52${digits}` : digits;
}

export function whatsappLink(text) {
  if (!SUPPORT_WHATSAPP) return "";
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

/** Mensaje de ayuda desde la app: tienda, ID, plan y pantalla. */
export function supportMessage({ businessName, tenantId, plan, screen } = {}) {
  const lines = ["Hola, necesito ayuda con Mi Tiendita."];
  if (businessName) lines.push(`Tienda: ${businessName}`);
  if (tenantId) lines.push(`ID de tienda: ${tenantId}`);
  if (plan) lines.push(`Plan: ${plan}`);
  if (screen) lines.push(`Pantalla: ${screen}`);
  lines.push("", "Mi duda es: ");
  return lines.join("\n");
}

export const PRESALE_MESSAGE = "Hola, me interesa Mi Tiendita para mi tienda. ¿Me pueden dar más información?";
export const PERPETUAL_MESSAGE = "Hola, me interesa la licencia perpetua de Mi Tiendita. ¿Qué incluye y cómo la solicito?";

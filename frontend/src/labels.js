/** Etiquetas de UI en español (valores internos del API se mantienen en inglés). */

export const orderStatusLabel = {
  pending: "Registrada",
  preparing: "En proceso",
  ready: "Lista",
  served: "Entregada",
  cancelled: "Cancelada",
};

export const paymentStatusLabel = {
  unpaid: "Sin pagar",
  paid: "Pagado",
  refunded: "Devuelta",
};

export const modalityLabel = {
  retail: "Mostrador",
  "dine-in": "Mostrador",
  takeaway: "entrega",
};

export const roleLabel = {
  admin: "Admin",
  hosstess: "Hostess",
  waiter: "Vendedor",
  kitchen: "Almacén",
  cashier: "Cajero",
  platform_admin: "Admin",
  platform_support: "Soporte",
};

export const inviteStatusLabel = {
  pending: "Pendiente",
  accepted: "Aceptada",
  revoked: "Revocada",
  expired: "Expirada",
};

export function labelOf(map, key, fallback = key) {
  if (!key) return fallback || "";
  return map[key] || fallback || String(key);
}

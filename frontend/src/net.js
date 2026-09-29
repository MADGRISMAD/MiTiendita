/** Fallo de red (no hay respuesta HTTP). Un 4xx/5xx no cuenta. */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.response) return false;
  const code = String(error.code || "");
  if (
    code === "ERR_NETWORK" ||
    code === "ECONNABORTED" ||
    code === "ERR_CANCELED" ||
    code === "ETIMEDOUT"
  ) {
    return true;
  }
  const msg = String(error.message || "").toLowerCase();
  return (
    msg.includes("network error") ||
    msg.includes("failed to fetch") ||
    msg.includes("timeout")
  );
}

export function newClientSaleId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

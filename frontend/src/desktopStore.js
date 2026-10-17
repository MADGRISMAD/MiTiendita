// Estado de la licencia de esta computadora (versión instalable). Se consulta al servidor local.
import { reactive } from "vue";
import axios from "axios";

export const desktopStore = reactive({ loaded: false, required: false, status: "ok", hasStore: true, owner: null });

let pending = null;
export function loadDesktopStatus({ force = false } = {}) {
  if (desktopStore.loaded && !force) return Promise.resolve(desktopStore);
  if (pending && !force) return pending;
  pending = axios
    .get("desktop/status")
    .then((r) => Object.assign(desktopStore, r.data, { loaded: true }))
    .catch(() => Object.assign(desktopStore, { loaded: true }))
    .finally(() => (pending = null));
  return pending;
}

export function reactivateLicense(code, email) {
  return axios.post("desktop/reactivate", { code, email }).then((r) => {
    Object.assign(desktopStore, r.data, { loaded: true });
    return r.data;
  });
}

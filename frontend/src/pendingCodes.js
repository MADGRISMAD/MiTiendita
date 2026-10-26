// Códigos asignados sin internet: se guardan en el equipo y se suben cuando regresa la conexión.
import { isNetworkError } from "./net";

const KEY = "mt_pending_codes";

export function readPending() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: no hay cola */
  }
}

/** entry: { tenantId, id, payload } — lo que hay que mandar a editFood(id, payload). */
export function queueCode(entry) {
  write([...readPending().filter((e) => !(e.tenantId === entry.tenantId && e.id === entry.id)), { ...entry, at: Date.now() }]);
}

/** Manda lo pendiente de esta tienda. Lo que falla por red se queda; lo que el servidor rechaza se descarta. */
export async function flushPending(tenantId, editFood) {
  const list = readPending();
  const keep = [];
  let sent = 0;
  for (const entry of list) {
    if (entry.tenantId !== tenantId) {
      keep.push(entry);
      continue;
    }
    try {
      await editFood(entry.id, entry.payload);
      sent += 1;
    } catch (e) {
      if (isNetworkError(e)) keep.push(entry);
    }
  }
  write(keep);
  return sent;
}

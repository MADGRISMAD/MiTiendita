// Caja (número) de esta computadora y un id propio para reconocerla. Vive en localStorage;
// si el almacenamiento falla, la caja es la 1 y el id dura lo que dure la página.
const REG_KEY = "mt_register";
const DEV_KEY = "mt_device";
const MAX_REGISTER = 8;

let memoryDevice = "";
let memoryRegister = null; // respaldo si el almacenamiento falla: la elección dura lo que dure la página

function newId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {
    /* sigue */
  }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function valid(n) {
  return Number.isInteger(n) && n >= 1 && n <= MAX_REGISTER;
}

export const registerStore = {
  current() {
    try {
      const raw = localStorage.getItem(REG_KEY);
      if (raw === null || !/^\d+$/.test(raw)) return 1;
      const n = Number(raw);
      return valid(n) ? n : 1;
    } catch {
      return memoryRegister || 1;
    }
  },
  /** true si esta computadora ya eligió su caja (hay `mt_register` válido guardado). */
  hasChoice() {
    try {
      const raw = localStorage.getItem(REG_KEY);
      return raw !== null && /^\d+$/.test(raw) && valid(Number(raw));
    } catch {
      return memoryRegister !== null;
    }
  },
  /** Guarda la caja. true si quedó guardada en el almacenamiento (si no, solo vale en esta página). */
  set(n) {
    memoryRegister = valid(Number(n)) ? Number(n) : null;
    try {
      if (memoryRegister !== null) localStorage.setItem(REG_KEY, String(memoryRegister));
      else localStorage.removeItem(REG_KEY);
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    memoryRegister = null;
    try {
      localStorage.removeItem(REG_KEY);
    } catch {
      /* sin almacenamiento */
    }
  },
  deviceId() {
    if (memoryDevice) return memoryDevice;
    try {
      const saved = localStorage.getItem(DEV_KEY);
      if (saved) return (memoryDevice = saved);
    } catch {
      /* sigue */
    }
    memoryDevice = newId();
    try {
      localStorage.setItem(DEV_KEY, memoryDevice);
    } catch {
      /* sin almacenamiento */
    }
    return memoryDevice;
  },
};

export function registerHeaders() {
  return { "X-Register": String(registerStore.current()), "X-Device": registerStore.deviceId() };
}

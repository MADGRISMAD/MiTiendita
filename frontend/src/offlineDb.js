import { rateOf } from "./tax";
const DB_NAME = "mitiendita-offline";
const DB_VER = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("sales")) {
        const sales = db.createObjectStore("sales", { keyPath: "clientSaleId" });
        sales.createIndex("tenantStatus", ["tenantId", "status"]);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function kvGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", "readonly");
    const req = tx.objectStore("kv").get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function kvSet(key, value) {
  const db = await openDb();
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").put(value, key);
  await txDone(tx);
}

async function kvDel(key) {
  const db = await openDb();
  const tx = db.transaction("kv", "readwrite");
  tx.objectStore("kv").delete(key);
  await txDone(tx);
}

export async function saveCatalog(tenantId, { foods, menus }) {
  if (!tenantId) return;
  // Copia plana: IndexedDB no puede clonar los Proxy reactivos de Vue (DataCloneError)
  await kvSet(`catalog:${tenantId}`, {
    foods: Array.isArray(foods) ? JSON.parse(JSON.stringify(foods)) : [],
    menus: Array.isArray(menus) ? JSON.parse(JSON.stringify(menus)) : [],
    at: Date.now(),
  });
}

export async function loadCatalog(tenantId) {
  if (!tenantId) return { foods: [], menus: [], at: 0 };
  const row = await kvGet(`catalog:${tenantId}`);
  if (!row) return { foods: [], menus: [], at: 0 };
  return {
    foods: Array.isArray(row.foods) ? row.foods : [],
    menus: Array.isArray(row.menus) ? row.menus : [],
    at: Number(row.at) || 0,
  };
}

export async function saveCashSession(tenantId, session) {
  if (!tenantId) return;
  if (!session) {
    await kvDel(`cash:${tenantId}`);
    return;
  }
  await kvSet(`cash:${tenantId}`, session);
}

export async function loadCashSession(tenantId) {
  if (!tenantId) return null;
  return (await kvGet(`cash:${tenantId}`)) || null;
}

export async function enqueueSale(record) {
  const db = await openDb();
  const tx = db.transaction("sales", "readwrite");
  tx.objectStore("sales").put({
    ...record,
    status: "pending",
    error: "",
    serverOrderId: record.serverOrderId || null,
  });
  await txDone(tx);
}

export async function getSale(clientSaleId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sales", "readonly");
    const req = tx.objectStore("sales").get(clientSaleId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listPending(tenantId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("sales", "readonly");
    const store = tx.objectStore("sales");
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result || []).filter(
        (row) => row.status === "pending" && (!tenantId || row.tenantId === tenantId)
      );
      rows.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function countPending(tenantId) {
  const rows = await listPending(tenantId);
  return rows.length;
}

export async function markSynced(clientSaleId, serverOrderId) {
  const row = await getSale(clientSaleId);
  if (!row) return;
  const db = await openDb();
  const tx = db.transaction("sales", "readwrite");
  tx.objectStore("sales").put({
    ...row,
    status: "synced",
    serverOrderId: serverOrderId || row.serverOrderId,
    error: "",
    syncedAt: Date.now(),
  });
  await txDone(tx);
}

export async function markFailed(clientSaleId, error) {
  const row = await getSale(clientSaleId);
  if (!row) return;
  const db = await openDb();
  const tx = db.transaction("sales", "readwrite");
  tx.objectStore("sales").put({
    ...row,
    status: "failed",
    error: String(error || "No se pudo sincronizar"),
  });
  await txDone(tx);
}

export function lookupInCatalog(foods, code) {
  const q = String(code || "").trim().toLowerCase();
  if (!q) return { matches: [] };
  const list = Array.isArray(foods) ? foods : [];
  const exact = list.find((f) => {
    const barcode = String(f.barcode || "").trim().toLowerCase();
    const sku = String(f.sku || "").trim().toLowerCase();
    return barcode === q || sku === q;
  });
  if (exact) return exact;
  const matches = list.filter((f) => {
    const name = String(f.name || "").toLowerCase();
    const sku = String(f.sku || f.barcode || "").toLowerCase();
    return sku === q || name.includes(q);
  });
  if (matches.length === 1) return matches[0];
  return { matches: matches.slice(0, 12) };
}

export function applyPendingStock(foods, pendingSales) {
  const map = new Map(
    (Array.isArray(foods) ? foods : []).map((f) => [String(f.id), { ...f }])
  );
  for (const sale of pendingSales || []) {
    const items = sale.payload?.items || [];
    for (const item of items) {
      const id = String(item.foodId || item.id || "");
      const row = map.get(id);
      if (!row) continue;
      const qty = Math.max(0, Number(item.quantity) || 0);
      row.stock = Math.max(0, (Number(row.stock) || 0) - qty);
    }
  }
  return [...map.values()];
}

export function saleToPrintOrder(sale) {
  const payload = sale?.payload || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const soldAt = payload.soldAt || sale?.createdAt || Date.now();
  return {
    id: sale.clientSaleId,
    items,
    discountPercent: Number(payload.discountPercent) || 0,
    taxRate: rateOf(payload.taxRate),
    subtotal: Number(payload.subtotal) || 0,
    subtotalNet: Number(payload.subtotalNet) || 0,
    discountAmount: Number(payload.discountAmount) || 0,
    tax: Number(payload.tax) || 0,
    total: Number(payload.total) || 0,
    paymentStatus: "paid",
    paymentMethod: payload.paymentMethod || "cash",
    cashReceived: payload.cashReceived ?? null,
    cardAmount: payload.cardAmount ?? null,
    change: Number(payload.change) || 0,
    createdAt: soldAt,
    paidAt: soldAt,
    invoiceToken: null,
    offlinePending: sale.status !== "synced",
  };
}

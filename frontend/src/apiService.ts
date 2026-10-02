import axios from 'axios';
import { authStore, clearSession, setSession } from './authStore';

const envUrl = (import.meta as { env?: Record<string, string> }).env?.VITE_API_URL;

function resolveApiBase() {
  if (envUrl) return envUrl.endsWith('/') ? envUrl : `${envUrl}/`;
  // En desarrollo el proxy de Vite (/api → :8081) funciona en localhost y en la LAN del celular.
  if ((import.meta as { env?: Record<string, unknown> }).env?.DEV) return '/api/';
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:8081/';
  }
  return '/api/';
}

const publicUrl = resolveApiBase();

axios.defaults.baseURL = publicUrl;
// La sesión se renueva con una cookie HttpOnly (refresh token)
axios.defaults.withCredentials = true;
axios.defaults.headers.common['Content-Type'] = 'application/json';

/** Origen usable desde el celular (QR de factura). En LAN usa la IP de la Mac. */
export function appPublicOrigin() {
  if (typeof window === 'undefined') return '';
  const lan = (import.meta as { env?: Record<string, string> }).env?.VITE_LAN_HOST;
  const host = window.location.hostname;
  if (lan && (host === 'localhost' || host === '127.0.0.1')) {
    const port = window.location.port || '5173';
    return `http://${lan}:${port}`;
  }
  return window.location.origin;
}

import { isNetworkError } from './net';
import { noteOffline, noteOnline } from './offlineFlags';

axios.interceptors.request.use((config) => {
  const token = authStore.token;
  if (token) {
    config.headers = config.headers || {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// Rutas de login/registro: un 401 ahí es «datos incorrectos», no «sesión vencida»
const AUTH_PATHS = /\/usuarios\/(login|login\/mfa|refresh|logout|register|forgot-password|reset-password|mfa\/setup|mfa\/enable)\/?$/;
const PUBLIC_PAGES = /^\/($|login|register|invite|forgot|reset|factura)/;

let refreshing: Promise<boolean> | null = null;

/**
 * Pide un access token nuevo con la cookie de refresh. Una sola petición a la vez.
 * true si se renovó; false si la sesión ya no sirve. Sin red lanza el error (no cierra sesión).
 */
export function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = axios
      .post('/usuarios/refresh', {}, { skipAuthRefresh: true } as Record<string, unknown>)
      .then((r) => {
        setSession(r.data);
        return true;
      })
      .catch((err) => {
        if (isNetworkError(err)) throw err;
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function endSessionAndGoToLogin() {
  clearSession();
  if (typeof window !== 'undefined' && !window.location.pathname.match(PUBLIC_PAGES)) {
    window.location.href = '/login';
  }
}

axios.interceptors.response.use(
  (r) => {
    noteOnline();
    return r;
  },
  async (error) => {
    if (isNetworkError(error)) noteOffline();
    const config = (error.config || {}) as Record<string, unknown> & { url?: string; headers?: Record<string, string> };
    const status = error.response?.status;
    const isAuthCall = AUTH_PATHS.test(String(config.url || ''));

    // Access token vencido: se renueva y se repite la petición una vez
    if (status === 401 && !isAuthCall && !config.skipAuthRefresh && !config._retried) {
      config._retried = true;
      let renewed = false;
      try {
        renewed = await refreshSession();
      } catch {
        return Promise.reject(error); // sin red: la sesión sigue, se reintentará
      }
      if (renewed) {
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${authStore.token}` };
        return axios(config);
      }
      endSessionAndGoToLogin();
      return Promise.reject(error);
    }
    if (status === 401 && !isAuthCall) endSessionAndGoToLogin();
    if (status === 403 && error.response?.data?.code === 'MFA_SETUP_REQUIRED') endSessionAndGoToLogin();
    if (
      status === 403 &&
      error.response?.data?.code === 'SUBSCRIPTION_REQUIRED' &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/billing') &&
      !window.location.pathname.startsWith('/platform')
    ) {
      window.location.href = '/billing';
    }
    return Promise.reject(error);
  }
);

/** Cierra la sesión en el servidor (revoca el refresh) y en este dispositivo. */
export async function logoutSession() {
  try {
    await Promise.race([
      axios.post('/usuarios/logout', {}, { skipAuthRefresh: true } as Record<string, unknown>),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* sin red: igual se cierra aquí */
  }
  clearSession();
}

export const apiClient = axios;

export const apiService = {
  login(data: string, password: string) {
    return axios.post('/usuarios/login', { data, password }).then((r) => r.data);
  },
  /** Segundo paso del login: código de la app o uno de respaldo. */
  loginMfa(mfaToken: string, code: string) {
    return axios.post('/usuarios/login/mfa', { mfaToken, code }).then((r) => r.data);
  },
  /** Genera el secreto de 2FA (con sesión, o con mfaToken si se activa desde el login). */
  mfaSetup(mfaToken?: string) {
    return axios.post('/usuarios/mfa/setup', mfaToken ? { mfaToken } : {}).then((r) => r.data);
  },
  mfaEnable(code: string, mfaToken?: string) {
    return axios.post('/usuarios/mfa/enable', mfaToken ? { code, mfaToken } : { code }).then((r) => r.data);
  },
  mfaDisable(password: string, code: string) {
    return axios.post('/usuarios/mfa/disable', { password, code }).then((r) => r.data);
  },
  register(payload: Record<string, unknown>) {
    return axios.post('/usuarios/register', payload).then((r) => r.data);
  },
  forgotPassword(email: string) {
    return axios.post('/usuarios/forgot-password', { email }).then((r) => r.data);
  },
  resetPassword(token: string, password: string) {
    return axios.post('/usuarios/reset-password', { token, password }).then((r) => r.data);
  },
  me() {
    return axios.get('/usuarios/me').then((r) => r.data);
  },

  getAllFoods() {
    return axios.get('/foods').then((r) => r.data);
  },
  getFoodById(foodId: string) {
    return axios.get(`/foods/${foodId}`).then((r) => r.data);
  },
  lookupFood(code: string) {
    return axios
      .get('/foods/lookup', { params: { code } })
      .then((r) => r.data);
  },
  getLowStockFoods() {
    return axios.get('/foods/low-stock').then((r) => r.data);
  },
  searchFoods(q: string) {
    return axios.get('/foods/search', { params: { q } }).then((r) => r.data);
  },
  createFood(foodDTO: {
    name: string;
    price: number;
    description?: string;
    imgUrl?: string;
    menuId: string;
    sku?: string;
    barcode?: string;
    priceIncludesTax?: boolean;
    stock?: number | null;
    cost?: number | null;
    lowStockThreshold?: number | null;
    tracksExpiry?: boolean;
    supplierIds?: string[];
  }) {
    return axios.post('/foods', foodDTO).then((r) => r.data);
  },
  editFood(foodId: string, foodDTO: Record<string, unknown>) {
    return axios.put(`/foods/${foodId}`, foodDTO).then((r) => r.data);
  },
  deleteFood(foodId: string) {
    return axios.delete(`/foods/${foodId}`).then((r) => r.status === 200);
  },

  getAllMenus() {
    return axios.get('/menus').then((r) => r.data);
  },
  getMenuById(menuId: string) {
    return axios.get(`/menus/${menuId}`).then((r) => r.data);
  },
  createMenu(menuDTO: { name: string; description?: string }) {
    return axios.post('/menus', menuDTO).then((r) => r.data);
  },
  editMenu(menuId: string, menuDTO: Record<string, unknown>) {
    return axios.put(`/menus/${menuId}`, menuDTO).then((r) => r.data);
  },
  deleteMenu(menuId: string) {
    return axios.delete(`/menus/${menuId}`).then((r) => r.status === 200);
  },

  getOrders() {
    return axios.get('/orders').then((r) => r.data);
  },
  getOrdersById(orderId: string) {
    return axios.get(`/orders/${orderId}`).then((r) => r.data);
  },
  createOrder(orderDTO: Record<string, unknown>) {
    return axios.post('/orders', orderDTO).then((r) => r.data);
  },
  /** Crea y cobra en un paso. Idempotente con clientSaleId (cola offline). */
  syncSale(payload: Record<string, unknown>) {
    return axios.post('/orders/sale', payload, { timeout: 15000 }).then((r) => r.data);
  },
  updateOrderStatus(orderId: string, status: string) {
    return axios.put(`/orders/${orderId}/status`, { status }).then((r) => r.data);
  },
  payOrder(
    orderId: string,
    paymentMethod: string,
    opts: {
      cardExtraIva?: boolean;
      cashReceived?: number;
      cardAmount?: number;
    } = {}
  ) {
    return axios
      .put(`/orders/${orderId}/pay`, {
        paymentMethod,
        cardExtraIva: Boolean(opts.cardExtraIva),
        cashReceived: opts.cashReceived ?? null,
        cardAmount: opts.cardAmount ?? null,
      })
      .then((r) => r.data);
  },
  voidOrder(orderId: string) {
    return axios.put(`/orders/${orderId}/void`).then((r) => r.data);
  },
  markInvoiceIssued(orderId: string) {
    return axios.put(`/orders/${orderId}/invoice`).then((r) => r.data);
  },
  getPublicInvoice(token: string) {
    return axios.get(`/invoices/public/${token}`).then((r) => r.data);
  },
  submitPublicInvoice(token: string, payload: Record<string, string>) {
    return axios.post(`/invoices/public/${token}`, payload).then((r) => r.data);
  },
  editOrderAsCompleted(orderId: string) {
    return this.updateOrderStatus(orderId, 'served');
  },
  deleteOrder(_orderId: string) {
    return Promise.resolve(false);
  },

  getTables() {
    return axios.get('/tables').then((r) => r.data);
  },
  getTableById(tableId: string) {
    return axios.get(`/tables/${tableId}`).then((r) => r.data);
  },
  createTable(tableDTO: Record<string, unknown>) {
    return axios.post('/tables', tableDTO).then((r) => r.data);
  },
  editTable(tableId: string, tableDTO: Record<string, unknown>) {
    return axios.put(`/tables/${tableId}`, tableDTO).then((r) => r.data);
  },
  deleteTable(tableId: string) {
    return axios.delete(`/tables/${tableId}`).then((r) => r.status === 200);
  },

  getWaiters() {
    return axios.get('/waiters').then((r) => r.data);
  },
  createWaiter(waiterDTO: Record<string, unknown>) {
    return axios.post('/waiters/add', waiterDTO).then((r) => r.data);
  },
  updateWaiter(cellphone: string, waiterDTO: Record<string, unknown>) {
    return axios.put(`/waiters/${cellphone}`, waiterDTO).then((r) => r.data);
  },
  deleteWaiter(cellphone: string) {
    return axios.delete(`/waiters/${cellphone}`).then((r) => r.data);
  },

  getWaitlist() {
    return axios.get('/usuarios/waitlist/').then((r) => r.data);
  },
  addWaitlist(data: { nombre: string; telefono: string | number }) {
    return axios.post('/usuarios/waitlist/add', data).then((r) => r.data);
  },
  deleteWaitlist(id: string | number) {
    return axios.delete(`/usuarios/waitlist/delete/${id}`).then((r) => r.data);
  },

  getSettings() {
    return axios.get('/settings').then((r) => r.data);
  },
  saveSettings(settingsDTO: Record<string, unknown>) {
    return axios.post('/settings', settingsDTO).then((r) => r.data);
  },

  getInvites() {
    return axios.get('/invites').then((r) => r.data);
  },
  /** Usuarios con acceso a la tienda y lugares del plan. */
  getTeam() {
    return axios.get('/invites/team').then((r) => r.data);
  },
  createInvite(data: { email: string; role: string }) {
    return axios.post('/invites', data).then((r) => r.data);
  },
  revokeInvite(id: string) {
    return axios.put(`/invites/${id}/revoke`).then((r) => r.data);
  },
  deleteInvite(id: string) {
    return axios.delete(`/invites/${id}`).then((r) => r.data);
  },
  getInviteByToken(token: string) {
    return axios.get(`/invites/token/${token}`).then((r) => r.data);
  },
  acceptInvite(payload: Record<string, unknown>) {
    return axios.post('/invites/accept', payload).then((r) => r.data);
  },

  getCashSession() {
    return axios.get('/cash/session').then((r) => r.data);
  },
  openCashSession(openingFloat: number) {
    return axios.post('/cash/session/open', { openingFloat }).then((r) => r.data);
  },
  closeCashSession(countedCash: number, notes = '') {
    return axios.post('/cash/session/close', { countedCash, notes }).then((r) => r.data);
  },
  getCashSessionById(id: string) {
    return axios.get(`/cash/session/${id}`).then((r) => r.data);
  },

  getBillingPlans() {
    return axios.get('/billing/plans').then((r) => r.data);
  },
  getBillingStatus() {
    return axios.get('/billing/status').then((r) => r.data);
  },
  getBillingHistory() {
    return axios.get('/billing/history').then((r) => r.data);
  },
  billingCheckout(plan: string, email?: string, interval: 'month' | 'year' = 'month') {
    return axios.post('/billing/checkout', { plan, email, interval }).then((r) => r.data);
  },
  billingSync(preapprovalId?: string) {
    return axios.post('/billing/sync', { preapprovalId }).then((r) => r.data);
  },
  billingCancel() {
    return axios.post('/billing/cancel').then((r) => r.data);
  },
  billingDevActivate(plan: string, preapprovalId?: string, interval: 'month' | 'year' = 'month') {
    return axios
      .post('/billing/dev/activate', { plan, preapprovalId, interval })
      .then((r) => r.data);
  },
  getOnboarding() {
    return axios.get('/settings/onboarding').then((r) => r.data);
  },
  dismissOnboarding() {
    return axios.post('/settings/onboarding/dismiss').then((r) => r.data);
  },
  seedStarterCatalog() {
    return axios.post('/menus/seed-starter').then((r) => r.data);
  },
  getSupportThread() {
    return axios.get('/settings/support').then((r) => r.data);
  },
  sendSupportMessage(payload: { subject: string; message: string }) {
    return axios.post('/settings/support', payload).then((r) => r.data);
  },

  aiQuota() {
    return axios.get('/ai/quota').then((r) => r.data);
  },
  aiPreview(payload: { text?: string; imageBase64?: string; mimeType?: string }) {
    return axios.post('/ai/preview', payload, { timeout: 130_000 }).then((r) => r.data);
  },
  aiApply(
    updates: {
      id: string;
      price?: number;
      cost?: number;
      stockIn?: number;
      lot?: string;
      expiresAt?: string;
    }[],
    creates?: {
      name: string;
      price: number;
      cost?: number;
      barcode?: string;
      menuId: string;
      stock?: number;
      stockIn?: number;
      lot?: string;
      expiresAt?: string;
    }[],
    purchase?: {
      supplierId?: string;
      name?: string;
      contact?: string;
      whatsapp?: string;
      date?: string;
      expiresAt?: string;
      lot?: string;
      notes?: string;
    }
  ) {
    return axios
      .post('/ai/apply', { updates, creates: creates || [], purchase: purchase || undefined })
      .then((r) => r.data);
  },

  changePassword(currentPassword: string, newPassword: string) {
    return axios
      .put('/usuarios/change-password', { currentPassword, newPassword })
      .then((r) => r.data);
  },

  platformOverview() {
    return axios.get('/platform/overview').then((r) => r.data);
  },
  platformReport() {
    return axios.get('/platform/report', { responseType: 'text' }).then((r) => r.data);
  },
  platformCreateExpense(payload: { label: string; amount: number; note?: string }) {
    return axios.post('/platform/expenses', payload).then((r) => r.data);
  },
  platformDeleteExpense(id: string) {
    return axios.delete(`/platform/expenses/${id}`).then((r) => r.data);
  },
  platformListTenants() {
    return axios.get('/platform/tenants').then((r) => r.data);
  },
  platformGetTenant(id: string) {
    return axios.get(`/platform/tenants/${id}`).then((r) => r.data);
  },
  platformUpdateTenant(id: string, payload: Record<string, unknown>) {
    return axios.patch(`/platform/tenants/${id}`, payload).then((r) => r.data);
  },
  platformClientMail(id: string) {
    return axios.get(`/platform/tenants/${id}/mail`).then((r) => r.data);
  },
  platformSendClientMail(id: string, payload: { to?: string; subject?: string; message: string; ticketId?: string }) {
    return axios.post(`/platform/tenants/${id}/mail`, payload).then((r) => r.data);
  },
  platformInbox() {
    return axios.get('/platform/inbox').then((r) => r.data);
  },
  platformSuspendTenant(id: string, reason: string) {
    return axios.post(`/platform/tenants/${id}/suspend`, { reason }).then((r) => r.data);
  },
  platformReactivateTenant(id: string, mode: 'active' | 'trial' = 'active') {
    return axios.post(`/platform/tenants/${id}/reactivate`, { mode }).then((r) => r.data);
  },
  platformSetPlan(id: string, plan: string) {
    return axios.patch(`/platform/tenants/${id}/plan`, { plan }).then((r) => r.data);
  },
  platformListStaff() {
    return axios.get('/platform/staff').then((r) => r.data);
  },
  platformCreateStaff(payload: Record<string, unknown>) {
    return axios.post('/platform/staff', payload).then((r) => r.data);
  },
  platformDeleteStaff(id: string) {
    return axios.delete(`/platform/staff/${id}`).then((r) => r.data);
  },

  // ── Clientes ──
  getCustomers(q?: string) {
    return axios.get('/customers', { params: q ? { q } : {} }).then((r) => r.data);
  },
  getCustomerById(id: string) {
    return axios.get(`/customers/${id}`).then((r) => r.data);
  },
  createCustomer(data: { name: string; phone?: string; email?: string; notes?: string }) {
    return axios.post('/customers', data).then((r) => r.data);
  },
  updateCustomer(id: string, data: Record<string, unknown>) {
    return axios.put(`/customers/${id}`, data).then((r) => r.data);
  },
  deleteCustomer(id: string) {
    return axios.delete(`/customers/${id}`).then((r) => r.status === 200);
  },

  // ── Inventario: proveedores, compras, lotes ──
  getSuppliers(q?: string) {
    return axios.get('/inventory/suppliers', { params: q ? { q } : {} }).then((r) => r.data);
  },
  getSupplier(id: string) {
    return axios.get(`/inventory/suppliers/${id}`).then((r) => r.data);
  },
  createSupplier(data: {
    name: string;
    contact?: string;
    whatsapp?: string;
    visitDays?: number[];
    notes?: string;
  }) {
    return axios.post('/inventory/suppliers', data).then((r) => r.data);
  },
  updateSupplier(id: string, data: Record<string, unknown>) {
    return axios.put(`/inventory/suppliers/${id}`, data).then((r) => r.data);
  },
  deleteSupplier(id: string) {
    return axios.delete(`/inventory/suppliers/${id}`).then((r) => r.status === 200);
  },
  getPurchases(supplierId?: string) {
    return axios
      .get('/inventory/purchases', { params: supplierId ? { supplierId } : {} })
      .then((r) => r.data);
  },
  getPurchase(id: string) {
    return axios.get(`/inventory/purchases/${id}`).then((r) => r.data);
  },
  createPurchase(data: {
    supplierId: string;
    date: string;
    notes?: string;
    items: {
      foodId: string;
      quantity: number;
      unitCost: number;
      lot?: string;
      expiresAt?: string | null;
    }[];
  }) {
    return axios.post('/inventory/purchases', data).then((r) => r.data);
  },
  getExpiringLots(days = 30) {
    return axios.get('/inventory/lots/expiring', { params: { days } }).then((r) => r.data);
  },
  getPurchaseSuggestions() {
    return axios.get('/inventory/suggestions').then((r) => r.data);
  },
  /** Ajuste manual de existencia (conteo, merma); queda en la bitácora. */
  adjustStock(data: { foodId: string; stock: number; reason: string; note?: string }) {
    return axios.post('/inventory/adjust', data).then((r) => r.data);
  },
  getInventoryActivity(limit = 80) {
    return axios.get('/inventory/activity', { params: { limit } }).then((r) => r.data);
  },

  // ── Reportes de ventas ──
  getOrdersReport(from: string, to: string) {
    return axios.get('/orders/report', { params: { from, to } }).then((r) => r.data);
  },
  getOrdersReportSummary(from: string, to: string) {
    return axios.get('/orders/report/summary', { params: { from, to } }).then((r) => r.data);
  },
};

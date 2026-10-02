import { reactive, watch } from "vue";
import { apiClient } from "./apiService";

const STORAGE_KEY = "timber_venue_settings";

const defaultSettings = {
  businessName: "",
  businessType: "abarrotes",
  address: "",
  phone: "",
  logoUrl: "/logo.svg",
  primaryColor: "#1E5AA8",
  accentColor: "#E08A1E",
  timezone: "America/Mexico_City",
  initialTables: 0,
  inventoryEnabled: false,
  costMethod: "last",
  taxRate: 0.16,
  setupCompleted: false,
};

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export const venueStore = reactive({
  ...loadLocal(),
  loading: false,
  ready: false,
});

watch(
  venueStore,
  (value) => {
    const snapshot = {
      businessName: value.businessName,
      businessType: value.businessType,
      address: value.address,
      phone: value.phone,
      logoUrl: value.logoUrl,
      primaryColor: value.primaryColor,
      accentColor: value.accentColor,
      timezone: value.timezone,
      initialTables: value.initialTables,
      inventoryEnabled: Boolean(value.inventoryEnabled),
      costMethod: value.costMethod === "average" ? "average" : "last",
      taxRate: value.taxRate ?? 0.16,
      setupCompleted: value.setupCompleted,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  },
  { deep: true }
);

export function isSetupComplete() {
  return Boolean(venueStore.setupCompleted && venueStore.businessName);
}

export async function fetchVenueSettings() {
  venueStore.loading = true;
  try {
    const { data } = await apiClient.get("/settings");
    Object.assign(venueStore, { ...defaultSettings, ...data, ready: true });
    return venueStore;
  } catch {
    const local = loadLocal();
    Object.assign(venueStore, { ...local, ready: true });
    return venueStore;
  } finally {
    venueStore.loading = false;
  }
}

export async function saveVenueSettings(payload) {
  const next = {
    ...defaultSettings,
    ...payload,
    setupCompleted: true,
  };

  try {
    const { data } = await apiClient.post("/settings", next);
    Object.assign(venueStore, { ...next, ...data, ready: true });
  } catch {
    Object.assign(venueStore, { ...next, ready: true });
  }

  return venueStore;
}

export function formatTodayLabel(timezone = venueStore.timezone) {
  try {
    return new Intl.DateTimeFormat("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: timezone || "America/Mexico_City",
    }).format(new Date());
  } catch {
    return new Date().toLocaleDateString("es-MX", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }
}

export { defaultSettings };

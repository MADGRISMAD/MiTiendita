import { reactive } from "vue";

export const billingStore = reactive({
  plan: "basic",
  planName: "",
  aiEnabled: true,
  isPerpetual: false,
  loaded: false,
});

export function applyBillingStatus(status) {
  if (!status || typeof status !== "object") return;
  const plan = status.plan || "basic";
  const perpetual = Boolean(status.isPerpetual) || plan === "perpetual";
  billingStore.plan = plan;
  billingStore.planName = status.planName || "";
  billingStore.isPerpetual = perpetual;
  billingStore.aiEnabled = status.aiEnabled !== false && !perpetual;
  billingStore.loaded = true;
}

export function clearBillingStatus() {
  billingStore.plan = "basic";
  billingStore.planName = "";
  billingStore.aiEnabled = true;
  billingStore.isPerpetual = false;
  billingStore.loaded = false;
}

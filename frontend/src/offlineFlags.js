import { reactive } from "vue";

export const offlineStore = reactive({
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  pending: 0,
  syncing: false,
  lastError: "",
});

export function noteOnline() {
  offlineStore.online = true;
}

export function noteOffline() {
  offlineStore.online = false;
}

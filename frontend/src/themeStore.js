import { reactive, watch } from "vue";

const STORAGE_KEY = "timber_ui_theme";

function readTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export const themeStore = reactive({
  mode: readTheme(),
});

export function applyUiTheme(mode = themeStore.mode) {
  if (typeof document === "undefined") return;
  const next = mode === "dark" ? "dark" : "light";
  themeStore.mode = next;
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function toggleUiTheme() {
  applyUiTheme(themeStore.mode === "dark" ? "light" : "dark");
}

applyUiTheme(themeStore.mode);

watch(
  () => themeStore.mode,
  (mode) => applyUiTheme(mode)
);

import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

const PAPER_KEY = "timber_ticket_paper";

function readPaper() {
  try {
    return localStorage.getItem(PAPER_KEY) === "58" ? "58" : "80";
  } catch {
    return "80";
  }
}

/**
 * Barra de herramientas de los tickets: tamaño de papel, imprimir y cerrar.
 * "Cerrar" siempre hace algo: cierra la pestaña si el navegador lo permite
 * (solo la abrió un script) y si no, regresa a la pantalla anterior.
 */
export function useTicketShell(fallbackPath = "/pos") {
  const router = useRouter();
  const paper = ref(readPaper());

  function applyPage() {
    let el = document.getElementById("tk-page-size");
    if (!el) {
      el = document.createElement("style");
      el.id = "tk-page-size";
      document.head.appendChild(el);
    }
    el.textContent = `@page { size: ${paper.value}mm auto; margin: 0; }`;
  }

  function setPaper(value) {
    paper.value = value === "58" ? "58" : "80";
    try {
      localStorage.setItem(PAPER_KEY, paper.value);
    } catch {
      /* ignore */
    }
    applyPage();
  }

  function print() {
    window.print();
  }

  function close() {
    try {
      window.close();
    } catch {
      /* ignore */
    }
    // Si sigue abierta, el navegador no dejó cerrarla (pestaña normal o app instalada):
    // regresa a la pantalla de la que vino o, si no hay, a la de respaldo.
    setTimeout(() => {
      if (window.closed) return;
      if (window.history.state?.back) router.back();
      else router.replace(typeof fallbackPath === "function" ? fallbackPath() : fallbackPath);
    }, 150);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  onMounted(() => {
    document.documentElement.classList.add("tk-printing-view");
    applyPage();
    window.addEventListener("keydown", onKey);
  });
  onUnmounted(() => {
    document.documentElement.classList.remove("tk-printing-view");
    window.removeEventListener("keydown", onKey);
    document.getElementById("tk-page-size")?.remove();
  });

  return { paper, setPaper, print, close };
}

export function folioOf(id) {
  return String(id || "").slice(-6).toUpperCase();
}

export function closingLine(businessType) {
  if (businessType === "pharmacy") return "¡Que se mejore pronto!";
  if (businessType === "hardware") return "¡Gracias por su preferencia!";
  if (businessType === "abarrotes" || businessType === "convenience") return "¡Gracias, vecino! Vuelva pronto.";
  return "¡Gracias por su compra!";
}

export function closingNote(businessType) {
  if (businessType === "pharmacy") return "Conserve este ticket para cualquier aclaración.";
  if (businessType === "hardware") return "Para cambios presente este ticket.";
  return "Conserve su ticket.";
}

export const BUSINESS_TYPE_LABEL = {
  abarrotes: "Abarrotes · Minisúper",
  convenience: "Tienda de conveniencia",
  pharmacy: "Farmacia",
  hardware: "Ferretería",
  other: "Comercio",
  restaurant: "Restaurante",
  cafe: "Café",
  bar: "Bar",
  hotel: "Hotel",
};

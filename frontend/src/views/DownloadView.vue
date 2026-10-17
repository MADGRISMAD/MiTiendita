<template>
  <PublicPage>
    <template #hero>
      <p class="kicker">Versión para computadora</p>
      <h1>Descarga Mi Tiendita para PC y Mac</h1>
      <p class="lede">
        La licencia permanente: la instalas en tu computadora, pagas una sola vez y cobras sin internet y sin mensualidades.
      </p>
    </template>

    <div class="dl-grid">
      <a class="card dl" :class="{ pick: os === 'windows' }" :href="WINDOWS_URL" @click="track('windows')">
        <span class="dl-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M3 5.5 10.5 4.4v7.1H3zm0 13 7.5 1.1v-7H3zm8.5 1.3L21 21.3V12.5h-9.5zm0-15.6v7.3H21V2.7z" /></svg>
        </span>
        <span class="dl-copy">
          <strong>Windows</strong>
          <small>Windows 10 y 11 · 64 bits</small>
        </span>
        <span class="dl-btn">{{ os === "windows" ? "Descargar (tu sistema)" : "Descargar" }}</span>
      </a>
      <a class="card dl" :class="{ pick: os === 'mac' }" :href="MAC_URL" @click="track('mac')">
        <span class="dl-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor"><path d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8C6.9 7.2 5.4 8.2 4.6 9.7c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.1.8c1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.7 0 0-2.8-1-2.8-4zM14.1 5.5c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2.1-.5 2.7-1.3z" /></svg>
        </span>
        <span class="dl-copy">
          <strong>Mac</strong>
          <small>Chip Apple (M1 o posterior) · macOS 11 o más nuevo</small>
        </span>
        <span class="dl-btn">{{ os === "mac" ? "Descargar (tu sistema)" : "Descargar" }}</span>
      </a>
    </div>

    <section class="card steps" aria-labelledby="steps-title">
      <h2 id="steps-title">Cómo empezar</h2>
      <ol>
        <li>
          <strong>Consigue tu código de licencia.</strong>
          <span>Lo recibes al comprar la licencia permanente. Si aún no la tienes, escríbenos por WhatsApp.</span>
        </li>
        <li>
          <strong>Descarga e instala.</strong>
          <span>En Windows abre el instalador y sigue los pasos. En Mac arrastra Mi Tiendita a Aplicaciones; la primera vez ábrela con clic derecho → Abrir.</span>
        </li>
        <li>
          <strong>Activa con internet, una sola vez.</strong>
          <span>Escribe tu código y crea tu usuario. La licencia queda ligada a esa computadora y después funciona sin conexión.</span>
        </li>
      </ol>
    </section>

    <div class="actions">
      <div class="card wa-card">
        <p class="wa-lead"><strong>¿Quieres la licencia o cambiaste de computadora?</strong> Te atendemos por WhatsApp.</p>
        <WhatsAppHelp label="Pedir mi licencia por WhatsApp" :message="BUY_MESSAGE" />
      </div>
    </div>

    <section class="card faqs" aria-labelledby="dl-faq">
      <h2 id="dl-faq">Preguntas frecuentes</h2>
      <details v-for="f in faqs" :key="f.q" class="faq">
        <summary>
          <span>{{ f.q }}</span>
          <PosIcon name="chevron" :size="18" class="chev" />
        </summary>
        <div class="faq-body"><p>{{ f.a }}</p></div>
      </details>
    </section>
  </PublicPage>
</template>

<script setup>
import { onMounted, ref } from "vue";
import PublicPage from "../components/PublicPage.vue";
import PosIcon from "../components/PosIcon.js";
import WhatsAppHelp from "../components/WhatsAppHelp.vue";

// Instaladores publicados en GitHub Releases (siempre la versión más reciente)
const RELEASES = "https://github.com/MADGRISMAD/MiTiendita/releases/latest/download";
const WINDOWS_URL = `${RELEASES}/MiTiendita-Windows.exe`;
const MAC_URL = `${RELEASES}/MiTiendita-Mac.dmg`;
const BUY_MESSAGE = "Hola, quiero la licencia permanente de Mi Tiendita para computadora.";

const faqs = [
  { q: "¿Es distinta de la versión en la nube?", a: "Sí. Esta se instala en una computadora y guarda todo ahí: no hay mensualidad y no necesita internet para cobrar. La versión en la nube se usa desde el navegador en cualquier dispositivo." },
  { q: "¿En cuántas computadoras la puedo usar?", a: "Cada licencia funciona en una computadora. Si cambias de equipo, escríbenos y la pasamos a la nueva." },
  { q: "¿Necesito internet?", a: "Solo la primera vez, para activar la licencia y crear tu usuario. Después vendes, haces cortes e inventario sin conexión." },
  { q: "¿Dónde quedan mis datos?", a: "En tu computadora. Te recomendamos respaldarla con frecuencia, porque si se pierde o se descompone, los datos se van con ella." },
  { q: "¿Incluye Inventario Mágico y Precio Mágico?", a: "No. Esas funciones usan inteligencia artificial en la nube y solo están en los planes mensuales." },
];

const os = ref("");
onMounted(() => {
  const ua = `${navigator.userAgent} ${navigator.platform || ""}`.toLowerCase();
  os.value = /win/.test(ua) ? "windows" : /mac/.test(ua) ? "mac" : "";
});
function track(kind) {
  try {
    window.umami?.track?.("descarga-escritorio", { sistema: kind });
  } catch {
    /* sin analítica */
  }
}
</script>

<style scoped>
/* Tarjetas y preguntas: mismo estilo que Ayuda */
.card {
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: var(--timber-radius);
  box-shadow: var(--timber-shadow);
}
.actions {
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  margin-bottom: 1rem;
}
.act {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem 1.1rem;
  color: inherit;
  text-decoration: none;
  transition: transform 0.15s, border-color 0.15s;
}
.act:hover { transform: translateY(-2px); border-color: var(--timber-primary); }
.act-ico {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.75rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.act-copy { flex: 1; display: grid; gap: 0.1rem; }
.act-copy small { color: var(--timber-muted); }
.wa-card { display: grid; align-items: center; padding: 1rem 1.1rem; }

.faqs { padding: 0.6rem 1.1rem 0.9rem; }
.faqs h2 { margin: 0.8rem 0 0.4rem; font-size: 1.15rem; font-weight: 800; }
.faq { border-bottom: 1px solid var(--timber-line); }
.faq:last-child { border-bottom: 0; }
.faq summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 0;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.faq summary::-webkit-details-marker { display: none; }
.faq summary:hover { color: var(--timber-primary); }
.chev { flex: none; color: var(--timber-muted); transition: transform 0.2s; }
.faq[open] .chev { transform: rotate(90deg); color: var(--timber-primary); }
.faq-body { padding: 0 0 0.9rem; }
.faq-body p { margin: 0 0 0.6rem; line-height: 1.6; color: var(--timber-muted); max-width: 44rem; }

/* Descargas */
.dl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 0.9rem; margin-bottom: 1rem; }
.dl { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; gap: 0.75rem 0.9rem; align-items: center; padding: 1.25rem; text-decoration: none; color: inherit; border: 2px solid transparent; transition: border-color 160ms ease-out, transform 160ms ease-out; }
.dl:hover { border-color: var(--timber-primary); }
.dl:active { transform: scale(0.98); }
.dl.pick { border-color: var(--timber-primary); }
.dl-ico { display: grid; place-items: center; width: 3.2rem; height: 3.2rem; border-radius: 0.9rem; background: var(--timber-primary-soft, #e8f0fb); color: var(--timber-primary); }
.dl-copy { display: grid; gap: 0.15rem; }
.dl-copy strong { font-size: 1.2rem; }
.dl-copy small { color: var(--timber-muted); }
.dl-btn { grid-column: 1 / -1; display: flex; justify-content: center; align-items: center; min-height: 2.9rem; border-radius: 0.8rem; background: var(--timber-primary); color: #fff; font-weight: 800; }
.steps { margin-bottom: 1rem; padding: 0.9rem 1.25rem 1.2rem; }
.steps h2 { margin: 0.3rem 0 0.2rem; font-size: 1.15rem; font-weight: 800; }
.steps ol { display: grid; gap: 0.9rem; margin: 0.75rem 0 0; padding-left: 1.4rem; list-style: decimal; }
.steps li::marker { font-weight: 800; color: var(--timber-primary); }
.steps li { display: grid; gap: 0.2rem; }
.steps li span { color: var(--timber-muted); }
.wa-lead { margin: 0 0 0.6rem; }
</style>

<template>
  <Teleport to="body">
    <div class="dd-bg" @click.self="close">
      <section class="dd" role="dialog" aria-modal="true" aria-labelledby="dd-title">
        <header class="dd-head">
          <div>
            <h2 id="dd-title">Posibles duplicados</h2>
            <p v-if="loading">Revisando tu inventario…</p>
            <p v-else-if="error" class="dd-err" role="alert">{{ error }}</p>
            <p v-else-if="pairs.length">
              {{ pairs.length }} {{ pairs.length === 1 ? "par parece" : "pares parecen" }} el mismo producto (de {{ scanned }} revisados). Revisa el código de barras y elige el correcto.
            </p>
            <p v-else>No encontré duplicados en tus {{ scanned }} productos.</p>
          </div>
          <button type="button" class="dd-x" aria-label="Cerrar" @click="close">×</button>
        </header>

        <p v-if="note" class="dd-note" role="status">{{ note }}</p>

        <ul v-if="pairs.length" class="dd-list">
          <li v-for="pair in pairs" :key="key(pair)" class="dd-pair">
            <p class="dd-why">{{ pair.reason === "code" ? "Comparten un código de barras" : "Nombre y presentación parecidos" }}</p>
            <div class="dd-cols">
              <article v-for="(item, i) in [pair.a, pair.b]" :key="item.id" class="dd-item">
                <strong>{{ item.name }}</strong>
                <span class="dd-code" :class="item.codeStatus">{{ item.barcode || "Sin código" }}</span>
                <small class="dd-status" :class="item.codeStatus">{{ STATUS[item.codeStatus] }}</small>
                <small v-if="item.altCodes.length">Otros códigos: {{ item.altCodes.join(", ") }}</small>
                <small>{{ money(item.price) }} · {{ item.stock }} en existencias</small>
                <button type="button" class="dd-btn primary" :disabled="busy === key(pair)" @click="decide(pair, i === 0 ? pair.a : pair.b, i === 0 ? pair.b : pair.a, 'delete')">
                  Este es el correcto
                </button>
                <button type="button" class="dd-link" :disabled="busy === key(pair)" @click="decide(pair, i === 0 ? pair.a : pair.b, i === 0 ? pair.b : pair.a, 'keepCodes')">
                  Dejar este y guardar los dos códigos
                </button>
              </article>
            </div>
            <label v-if="pair.a.stock > 0 || pair.b.stock > 0" class="dd-move">
              <input v-model="move[key(pair)]" type="checkbox" />
              <span>Pasar las existencias del que se borra al que se queda</span>
            </label>
            <button type="button" class="dd-link" :disabled="busy === key(pair)" @click="notDuplicate(pair)">No son el mismo producto</button>
          </li>
        </ul>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { apiService } from "../apiService";
import { confirmDialog } from "../dialog";
import { errText, money } from "../textUtils";

const emit = defineEmits(["close", "changed"]);

const STATUS = {
  ok: "Código válido",
  digit: "El dígito verificador no cuadra: puede estar mal escrito",
  length: "Largo poco común: puede estar mal escrito",
  internal: "Código propio (no es de barras)",
  missing: "Sin código de barras",
};

const loading = ref(true);
const error = ref("");
const note = ref("");
const scanned = ref(0);
const pairs = ref([]);
const busy = ref("");
const move = reactive({});
let changed = false;

const key = (pair) => `${pair.a.id}|${pair.b.id}`;

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const data = await apiService.duplicateFoods();
    scanned.value = data.scanned || 0;
    pairs.value = data.pairs || [];
    for (const pair of pairs.value) move[key(pair)] = pair.a.stock > 0 || pair.b.stock > 0;
  } catch (e) {
    error.value = errText(e, "No pude revisar el inventario. Intenta de nuevo.");
  } finally {
    loading.value = false;
  }
}

function describe(item) {
  return `«${item.name}» (código ${item.barcode || "sin código"})`;
}

async function send(pair, payload, done) {
  busy.value = key(pair);
  note.value = "";
  try {
    await apiService.resolveDuplicate(payload);
    changed = true;
    // Un producto borrado ya no aparece en ningún otro par
    const gone = payload.action === "notDuplicate" ? null : payload.removeId;
    pairs.value = pairs.value.filter((p) => key(p) !== key(pair) && (!gone || (p.a.id !== gone && p.b.id !== gone)));
    note.value = done;
  } catch (e) {
    note.value = errText(e, "No pude guardar el cambio.");
  } finally {
    busy.value = "";
  }
}

async function decide(pair, keep, gone, action) {
  const moveStock = Boolean(move[key(pair)]) && gone.stock > 0;
  const lines =
    action === "keepCodes"
      ? [`Te quedas con ${describe(keep)}.`, `Se borra ${describe(gone)} y sus códigos pasan al que te quedas como códigos extra.`]
      : [`Te quedas con ${describe(keep)}.`, `Se borrará ${describe(gone)}: su código se considera equivocado.`];
  if (gone.stock > 0) lines.push(moveStock ? `Sus ${gone.stock} existencias pasan al producto que te quedas.` : `Tiene ${gone.stock} en existencias y se perderán.`);
  const ok = await confirmDialog(`¿Confirmas cuál es el correcto?\n\n${lines.join("\n\n")}`, { confirmLabel: "Sí, borrar el otro", tone: "danger" });
  if (!ok) return;
  await send(pair, { action, keepId: keep.id, removeId: gone.id, moveStock }, `Listo: te quedaste con «${keep.name}».`);
}

async function notDuplicate(pair) {
  await send(pair, { action: "notDuplicate", keepId: pair.a.id, removeId: pair.b.id }, "Entendido: ese par no volverá a salir.");
}

function close() {
  emit("close");
  if (changed) emit("changed");
}

onMounted(load);
</script>

<style scoped>
.dd-bg { position: fixed; inset: 0; z-index: 400; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(15, 23, 42, 0.5); }
.dd { display: flex; flex-direction: column; width: min(100%, 52rem); max-height: 92vh; overflow: hidden; border-radius: 1rem; background: var(--timber-panel, #fff); color: var(--timber-ink, #1a1a1a); }
.dd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 1rem 1.1rem 0.6rem; }
.dd-head h2 { margin: 0 0 0.2rem; font-size: 1.15rem; }
.dd-head p { margin: 0; font-size: 0.86rem; color: var(--timber-muted, #64748b); }
.dd-head p.dd-err { color: var(--timber-danger, #b3261e); }
.dd-x { border: 0; background: none; font-size: 1.6rem; line-height: 1; cursor: pointer; color: inherit; }
.dd-note { margin: 0 1.1rem 0.5rem; padding: 0.5rem 0.7rem; border-radius: 0.7rem; background: var(--timber-surface, #f1f5f9); font-size: 0.85rem; font-weight: 600; }
.dd-list { display: grid; gap: 0.8rem; margin: 0; padding: 0.4rem 1.1rem 1.1rem; overflow-y: auto; list-style: none; }
.dd-pair { display: grid; gap: 0.5rem; padding: 0.8rem; border: 1px solid var(--timber-line, #e3e8f0); border-radius: 0.9rem; }
.dd-why { margin: 0; font-size: 0.74rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; color: var(--timber-muted, #64748b); }
.dd-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.dd-item { display: grid; align-content: start; gap: 0.3rem; min-width: 0; padding: 0.7rem; border-radius: 0.7rem; background: var(--timber-surface, #f8fafc); }
.dd-item strong { overflow-wrap: anywhere; }
.dd-item small { font-size: 0.78rem; color: var(--timber-muted, #64748b); }
.dd-code { font-family: ui-monospace, monospace; font-size: 0.95rem; font-weight: 800; word-break: break-all; }
.dd-code.digit, .dd-code.length { color: var(--timber-danger, #b3261e); }
.dd-status.ok { color: #2e7d4f; font-weight: 700; }
.dd-status.digit, .dd-status.length { color: var(--timber-danger, #b3261e); font-weight: 700; }
.dd-btn { margin-top: 0.3rem; padding: 0.55rem 0.7rem; border: 1px solid var(--timber-line, #cbd5e1); border-radius: 0.7rem; background: var(--timber-panel, #fff); font: inherit; font-weight: 700; cursor: pointer; }
.dd-btn.primary { border-color: transparent; background: var(--timber-primary, #1d4f9c); color: #fff; }
.dd-btn:disabled, .dd-link:disabled { opacity: 0.5; cursor: default; }
.dd-link { padding: 0.2rem 0; border: 0; background: none; color: var(--timber-primary, #1d4f9c); font: inherit; font-size: 0.82rem; font-weight: 700; text-align: left; text-decoration: underline; cursor: pointer; }
.dd-move { display: flex; align-items: center; gap: 0.5rem; font-size: 0.84rem; }
@media (max-width: 560px) { .dd-cols { grid-template-columns: 1fr; } }
</style>

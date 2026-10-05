<template>
  <Teleport to="body">
    <div class="adm-dlg-bg cat-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="cat-dlg-title" @submit.prevent="save">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico"><PosIcon name="box" :size="22" /></span>
          <div>
            <h3 id="cat-dlg-title">Nueva categoría</h3>
            <p>Agrupa tus productos para encontrarlos rápido.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')"><PosIcon name="x" :size="18" /></button>
        </div>

        <label class="adm-field">
          Nombre
          <input ref="nameEl" v-model.trim="name" class="adm-inp" type="text" maxlength="40" required :placeholder="kind === 'supplies' ? 'Ej. Insumos de barra' : 'Ej. Bebidas calientes'" />
        </label>

        <fieldset class="kinds">
          <legend>¿Qué vas a guardar aquí?</legend>
          <label class="kind" :class="{ on: kind === 'sale' }">
            <input v-model="kind" type="radio" name="cat-kind" value="sale" />
            <PosIcon name="tag" :size="22" />
            <span>
              <strong>Productos para vender</strong>
              <small>Al público: salen en la caja con su precio.</small>
            </span>
          </label>
          <label class="kind" :class="{ on: kind === 'supplies' }">
            <input v-model="kind" type="radio" name="cat-kind" value="supplies" />
            <PosIcon name="box" :size="22" />
            <span>
              <strong>Insumos</strong>
              <small>Materia prima para preparar (café, leche, vasos). No salen en la caja; se descuentan con las recetas.</small>
            </span>
          </label>
        </fieldset>

        <p v-if="err" class="adm-err">{{ err }}</p>

        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="saving || !name">{{ saving ? 'Creando…' : 'Crear categoría' }}</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { onMounted, ref } from "vue";
import "../admin.css";
import PosIcon from "./PosIcon.js";
import { apiService } from "../apiService";

const props = defineProps({
  defaultKind: { type: String, default: "sale" },
});
const emit = defineEmits(["close", "created"]);

const name = ref("");
const kind = ref(props.defaultKind === "supplies" ? "supplies" : "sale");
const saving = ref(false);
const err = ref("");
const nameEl = ref(null);

onMounted(() => {
  if (window.matchMedia("(pointer: fine)").matches) nameEl.value?.focus();
});

async function save() {
  if (!name.value) return;
  saving.value = true;
  err.value = "";
  try {
    const created = await apiService.createMenu({ name: name.value, description: "", kind: kind.value });
    emit("created", { ...created, kind: created?.kind || kind.value });
  } catch (e) {
    const d = e?.response?.data;
    err.value = (typeof d === "string" && d) || "No se pudo crear la categoría.";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
/* Encima de la hoja de producto, que también puede abrirla */
.cat-dlg-bg { z-index: 400; }
.kinds { display: grid; gap: 0.5rem; margin: 0; padding: 0; border: none; min-width: 0; }
.kinds legend { padding: 0; margin-bottom: 0.5rem; font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
.kind {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.8rem 0.9rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel-elevated);
  cursor: pointer;
}
.kind input { position: absolute; opacity: 0; pointer-events: none; }
.kind svg { flex-shrink: 0; margin-top: 0.1rem; color: var(--timber-muted); }
.kind span { display: grid; gap: 0.15rem; }
.kind strong { font-size: 0.98rem; }
.kind small { font-size: 0.82rem; line-height: 1.35; color: var(--timber-muted); }
.kind.on { border-color: var(--timber-primary); background: var(--timber-primary-soft); }
.kind.on svg { color: var(--timber-primary); }
.kind:has(input:focus-visible) { outline: 3px solid color-mix(in srgb, var(--timber-primary) 45%, transparent); outline-offset: 2px; }
</style>

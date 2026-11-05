<template>
  <section v-if="catalog && catalog.total" class="adm-card pf-card-stack" aria-labelledby="cat-title">
    <div class="adm-card-head">
      <div>
        <h3 id="cat-title" class="pf-section-title">Productos sin precio</h3>
        <p v-if="catalog.unpriced">
          <strong>{{ catalog.unpriced }}</strong> de {{ catalog.total }} productos vienen del catálogo y no tienen precio, así que no se pueden vender.
        </p>
        <p v-else>Los {{ catalog.total }} productos de esta tienda tienen precio.</p>
      </div>
      <button v-if="detail.canRemoveUnpriced && catalog.unpriced" type="button" class="adm-btn danger-ghost" :disabled="busy" @click="remove">
        {{ busy ? "Eliminando…" : `Eliminar los ${catalog.unpriced}` }}
      </button>
    </div>
    <p v-if="catalog.unpriced" class="adm-hint">No se borra lo que ya se vendió ni lo que tiene existencias.</p>
    <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
    <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>
  </section>
</template>

<script setup>
import { computed, ref } from "vue";
import { apiService } from "../../apiService";
import { promptDialog } from "../../dialog";
import { errText } from "../../textUtils";

const props = defineProps({ detail: { type: Object, required: true } });
const emit = defineEmits(["changed"]);

const catalog = computed(() => props.detail.catalog);
const busy = ref(false);
const error = ref("");
const ok = ref("");

async function remove() {
  const n = catalog.value.unpriced;
  const word = await promptDialog(
    `Vas a ELIMINAR ${n} productos sin precio de «${props.detail.businessName}».\n\nSon del catálogo y no se pueden vender. No se borra lo que ya se vendió ni lo que tiene existencias, y el catálogo no se vuelve a cargar solo.\n\nPara confirmar escribe ELIMINAR.`,
    { placeholder: "ELIMINAR", confirmLabel: "Eliminar productos", tone: "danger" }
  );
  if (word === null) return;
  if (String(word).trim().toUpperCase() !== "ELIMINAR") {
    error.value = "No se eliminó nada: no escribiste ELIMINAR.";
    return;
  }
  busy.value = true;
  error.value = "";
  ok.value = "";
  try {
    const r = await apiService.platformRemoveUnpriced(props.detail.id, "ELIMINAR");
    const kept = r.keptSold + r.keptStock;
    ok.value = `Se eliminaron ${r.removed} productos.${kept ? ` Se conservaron ${kept} (${r.keptSold} ya vendidos, ${r.keptStock} con existencias).` : ""}`;
    emit("changed");
  } catch (e) {
    error.value = errText(e, "No pude eliminar los productos.");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <NoticeDialog
    v-if="d"
    :key="d.title + d.kind"
    top
    open
    v-model="value"
    :icon="icon"
    :yes-icon="d.kind === 'alert' ? '' : d.tone === 'danger' ? 'trash' : 'check'"
    :tone="d.tone"
    :title="d.title"
    :message="d.message"
    :yes-label="d.confirmLabel"
    :no-label="d.cancelLabel"
    :show-no="d.kind !== 'alert' && !d.hideCancel"
    :input="d.kind === 'prompt' ? (d.multiline ? 'textarea' : 'text') : ''"
    :placeholder="d.placeholder"
    @answer="onAnswer"
  />
</template>

<script setup>
// Dibuja la ventana que pidió dialog.js (confirmDialog / alertDialog / promptDialog), con el mismo diseño de la pregunta de imprimir.
import { computed, ref, watch } from "vue";
import NoticeDialog from "./NoticeDialog.vue";
import { answerDialog, dialogState } from "../dialog";

const d = computed(() => dialogState.current);
const value = ref("");
watch(d, (cur) => (value.value = cur?.value || ""), { immediate: true });

const icon = computed(() => (d.value?.tone === "danger" ? "trash" : d.value?.tone === "info" ? "check" : "alert"));

function onAnswer(yes) {
  const cur = d.value;
  if (!cur) return;
  if (cur.kind === "prompt") answerDialog(yes ? value.value : null);
  else if (cur.kind === "confirm") answerDialog(Boolean(yes));
  else answerDialog(true);
}
</script>

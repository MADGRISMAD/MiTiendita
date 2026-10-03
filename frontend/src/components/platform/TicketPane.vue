<template>
  <section class="adm-card pf-card-stack" :aria-busy="loading">
    <p v-if="loading && !ticket" class="pf-muted">Abriendo la conversación…</p>
    <p v-else-if="error && !ticket" class="adm-banner err" role="alert">{{ error }}</p>
    <p v-else-if="!ticket" class="pf-muted">No encontré ese ticket. Puede que ya no te toque a ti.</p>
    <template v-else>
      <header class="pf-thread-head">
        <div>
          <h2>{{ ticket.subject }}</h2>
          <p>
            {{ ticket.to }} · {{ ticket.messages.length }} {{ ticket.messages.length === 1 ? "mensaje" : "mensajes" }}
          </p>
        </div>
        <span class="adm-pill" :class="ticket.status === 'open' ? 'warn' : 'good'">
          {{ ticket.status === "open" ? "Por responder" : "Respondido" }}
        </span>
      </header>

      <p v-if="thread.inboxError" class="adm-banner warn" role="status">{{ thread.inboxError }}</p>

      <ul class="pf-thread" aria-label="Conversación">
        <li v-for="mail in ticket.messages" :key="mail.id || mail.messageId" class="pf-bubble" :class="mail.direction">
          <header>
            <strong>{{ mail.direction === "out" ? "Mi Tiendita" : mail.from }}</strong>
            <time :datetime="mail.at">{{ dateTime(mail.at) }}</time>
          </header>
          <p>{{ freshText(mail.text) }}</p>
        </li>
      </ul>

      <form class="pf-reply" @submit.prevent="send">
        <label class="adm-field">
          <span>Tu respuesta a {{ ticket.to }}</span>
          <textarea
            ref="box"
            v-model="reply"
            class="adm-inp"
            rows="4"
            required
            placeholder="Escribe la respuesta. Va en este mismo hilo."
            @keydown.ctrl.enter.prevent="send"
            @keydown.meta.enter.prevent="send"
          ></textarea>
        </label>
        <p v-if="sendError" class="pf-err" role="alert">{{ sendError }}</p>
        <div class="pf-reply-foot">
          <small>Ctrl + Enter para enviar</small>
          <button type="submit" class="adm-btn primary" :disabled="sending || !reply.trim()">
            {{ sending ? "Enviando…" : "Responder" }}
          </button>
        </div>
      </form>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { apiService } from "../../apiService";
import { dateTime } from "../../platform/format";

const props = defineProps({
  tenantId: { type: String, required: true },
  ticketId: { type: String, default: "" },
});
const emit = defineEmits(["changed"]);

const thread = ref({ tickets: [], messages: [], inboxError: "" });
const loading = ref(false);
const error = ref("");
const reply = ref("");
const sending = ref(false);
const sendError = ref("");
const box = ref(null);
let seq = 0;

const ticket = computed(() => (thread.value.tickets || []).find((t) => t.id === props.ticketId) || null);

async function load() {
  const mine = ++seq;
  loading.value = true;
  error.value = "";
  try {
    const data = await apiService.platformClientMail(props.tenantId);
    if (mine !== seq) return;
    thread.value = { tickets: data.tickets || [], messages: data.messages || [], inboxError: data.inboxError || "" };
  } catch (e) {
    if (mine !== seq) return;
    thread.value = { tickets: [], messages: [], inboxError: "" };
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude cargar los correos.";
  } finally {
    if (mine === seq) loading.value = false;
  }
}

async function send() {
  const text = reply.value.trim();
  if (!text || sending.value || !ticket.value) return;
  sending.value = true;
  sendError.value = "";
  try {
    const data = await apiService.platformSendClientMail(props.tenantId, { ticketId: props.ticketId, message: text });
    thread.value = { tickets: data.tickets || [], messages: data.messages || [], inboxError: data.inboxError || "" };
    reply.value = "";
    emit("changed", { tenantId: props.tenantId, ticketId: props.ticketId, status: ticket.value?.status || "answered" });
  } catch (e) {
    sendError.value = typeof e.response?.data === "string" ? e.response.data : "No pude enviar el correo. Intenta de nuevo.";
  } finally {
    sending.value = false;
  }
}

/** Quita lo citado de respuestas anteriores para leer solo lo nuevo. */
function freshText(value) {
  const lines = String(value || "").split("\n");
  const cut = lines.findIndex((line) => {
    const text = line.trim();
    return (
      text.startsWith(">") ||
      /^-{2,}/.test(text) ||
      /^On .+wrote:$/i.test(text) ||
      /^El .+escribió:$/i.test(text)
    );
  });
  const kept = (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
  return kept || String(value || "").trim();
}

watch(
  () => [props.tenantId, props.ticketId],
  (now, before) => {
    reply.value = "";
    sendError.value = "";
    // Mismo cliente, otro ticket: ya está cargado; si no, se vuelve a pedir (la primera vez no hay «antes»)
    if (!before || now[0] !== before[0] || !ticket.value) load();
  },
  { immediate: true }
);
</script>

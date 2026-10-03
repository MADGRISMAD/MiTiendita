<template>
  <Teleport to="body">
    <div class="adm-dlg-bg" @click.self="$emit('close')">
      <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="nt-title" @submit.prevent="submit">
        <div class="adm-dlg-head">
          <span class="adm-dlg-ico">✉</span>
          <div>
            <h3 id="nt-title">Nuevo ticket</h3>
            <p>Le escribes al cliente y la conversación queda aquí.</p>
          </div>
          <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="$emit('close')">×</button>
        </div>

        <template v-if="!fixedTenantId">
          <label class="adm-field">
            <span>Buscar cliente</span>
            <input v-model="filter" class="adm-inp" type="search" placeholder="Nombre de la tienda" autocomplete="off" />
          </label>
          <label class="adm-field">
            <span>Cliente</span>
            <select v-model="tenantId" class="adm-inp" required>
              <option v-for="t in matches" :key="t.id" :value="t.id">{{ t.businessName }}</option>
            </select>
          </label>
        </template>

        <label class="adm-field">
          <span>Para</span>
          <select v-model="to" class="adm-inp" required :disabled="!emails.length">
            <option v-for="email in emails" :key="email" :value="email">{{ email }}</option>
          </select>
        </label>
        <p v-if="tenantId && !loadingUsers && !emails.length" class="pf-err">Este cliente no tiene un correo registrado.</p>
        <label class="adm-field">
          <span>Asunto</span>
          <input v-model="subject" class="adm-inp" required minlength="3" maxlength="140" placeholder="De qué se trata" />
        </label>
        <label class="adm-field">
          <span>Mensaje</span>
          <textarea v-model="message" class="adm-inp" rows="5" required minlength="8" placeholder="Escribe el primer mensaje"></textarea>
        </label>
        <p v-if="error" class="pf-err" role="alert">{{ error }}</p>
        <div class="adm-dlg-acts">
          <button type="button" class="adm-btn" @click="$emit('close')">Cancelar</button>
          <button type="submit" class="adm-btn primary" :disabled="sending || !tenantId || !to">
            {{ sending ? "Enviando…" : "Abrir ticket" }}
          </button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { apiService } from "../../apiService";

const props = defineProps({
  tenants: { type: Array, default: () => [] },
  fixedTenantId: { type: String, default: "" },
});
const emit = defineEmits(["close", "created"]);

const filter = ref("");
const tenantId = ref(props.fixedTenantId);
const emails = ref([]);
const to = ref("");
const subject = ref("");
const message = ref("");
const error = ref("");
const sending = ref(false);
const loadingUsers = ref(false);

const matches = computed(() => {
  const q = filter.value.trim().toLowerCase();
  const list = [...props.tenants].sort((a, b) => a.businessName.localeCompare(b.businessName, "es"));
  return (q ? list.filter((t) => t.businessName.toLowerCase().includes(q)) : list).slice(0, 80);
});

// Al filtrar, el cliente elegido pasa al primero que coincida
watch(matches, (list) => {
  if (!props.fixedTenantId && list.length && !list.some((t) => t.id === tenantId.value)) tenantId.value = list[0].id;
});

async function loadEmails(id) {
  emails.value = [];
  to.value = "";
  if (!id) return;
  loadingUsers.value = true;
  try {
    const card = await apiService.platformGetTenant(id);
    if (tenantId.value !== id) return;
    const all = [card.ownerEmail, ...(card.users || []).map((u) => u.email)]
      .map((e) => String(e || "").trim().toLowerCase())
      .filter((e) => e.includes("@"));
    emails.value = [...new Set(all)];
    to.value = emails.value[0] || "";
  } catch {
    error.value = "No pude leer los correos de este cliente.";
  } finally {
    loadingUsers.value = false;
  }
}
watch(tenantId, loadEmails, { immediate: true });

async function submit() {
  if (sending.value) return;
  sending.value = true;
  error.value = "";
  try {
    const data = await apiService.platformSendClientMail(tenantId.value, {
      to: to.value,
      subject: subject.value.trim(),
      message: message.value,
    });
    const created = (data.tickets || []).find((t) => t.subject.toLowerCase() === subject.value.trim().toLowerCase());
    emit("created", { tenantId: tenantId.value, ticketId: created?.id || (data.tickets || [])[0]?.id || "" });
  } catch (e) {
    error.value = typeof e.response?.data === "string" ? e.response.data : "No pude enviar el correo.";
  } finally {
    sending.value = false;
  }
}

function onKey(e) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => {
  if (!props.fixedTenantId && matches.value.length && !tenantId.value) tenantId.value = matches.value[0].id;
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

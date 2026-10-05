<template>
  <div class="pf-card-stack">
    <div class="adm-card-head">
      <div>
        <h3 class="pf-section-title">Acceso al portal de socios</h3>
        <p>Con estas cuentas {{ firstName }} y su equipo ven sus tiendas, sus comisiones y reparten el trabajo en <strong>/socio</strong>.</p>
      </div>
      <button type="button" class="adm-btn primary" @click="showNew = true">Dar acceso</button>
    </div>
    <p v-if="ok" class="pf-ok" role="status">{{ ok }}</p>
    <p v-if="error" class="pf-err" role="alert">{{ error }}</p>

    <p v-if="!loading && !team.length" class="adm-empty">
      <strong>Todavía no tiene acceso.</strong><br />Crea su cuenta de <strong>Dueño</strong>; él podrá agregar a sus asesores.
    </p>
    <ul v-else class="pf-list">
      <li v-for="p in team" :key="p.id" class="pf-row static">
        <ClientAvatar :name="fullName(p)" size="2.2rem" />
        <span class="body">
          <span class="top">
            <strong>{{ fullName(p) }}</strong>
            <span class="adm-pill" :class="p.disabled ? '' : p.role === 'partner_admin' ? 'info' : ''">{{ p.disabled ? "Desactivada" : p.roleName }}</span>
          </span>
          <span class="sub">@{{ p.username }} · {{ p.email }} · {{ p.mfaEnabled ? "2FA activa" : "activará 2FA al entrar" }}</span>
        </span>
        <button type="button" class="adm-btn sm" :class="p.disabled ? 'primary' : 'danger-ghost'" :disabled="busy" @click="toggle(p)">
          {{ p.disabled ? "Reactivar" : "Desactivar" }}
        </button>
      </li>
    </ul>

    <MemberDialog
      v-if="showNew"
      :title="`Acceso para el equipo de ${firstName}`"
      default-role="partner_admin"
      :save="(payload) => apiService.platformCreateReferrerUser(detail.id, payload)"
      @close="showNew = false"
      @created="created"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import ClientAvatar from "./ClientAvatar.vue";
import MemberDialog from "../partner/MemberDialog.vue";
import { apiService } from "../../apiService";

const props = defineProps({ detail: { type: Object, required: true } });

const team = ref([]);
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const ok = ref("");
const showNew = ref(false);

const firstName = computed(() => String(props.detail.name || "").split(" ")[0] || "el socio");
const fullName = (p) => `${p.name || ""} ${p.lastName || ""}`.trim() || p.username;
const errText = (e, fallback) => (typeof e.response?.data === "string" ? e.response.data : fallback);

async function load() {
  loading.value = true;
  try {
    team.value = await apiService.platformReferrerUsers(props.detail.id);
  } catch (e) {
    error.value = errText(e, "No pude cargar sus accesos.");
  } finally {
    loading.value = false;
  }
}

async function created(person) {
  showNew.value = false;
  ok.value = `Acceso creado para ${person.username}. Al entrar activará la verificación en dos pasos.`;
  await load();
}

async function toggle(p) {
  busy.value = true;
  error.value = "";
  ok.value = "";
  try {
    team.value = await apiService.platformSetReferrerUserActive(props.detail.id, p.id, p.disabled);
    ok.value = p.disabled ? "Acceso reactivado." : "Acceso desactivado.";
  } catch (e) {
    error.value = errText(e, "No pude cambiar ese acceso.");
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

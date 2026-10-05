<template>
  <PartnerFrame title="Equipo" :subtitle="subtitle">
    <template v-if="canManage" #actions>
      <button type="button" class="adm-btn primary" @click="showNew = true">Agregar persona</button>
    </template>

    <p v-if="flash" class="adm-banner ok" role="status">{{ flash }}</p>
    <p v-if="error" class="adm-banner err" role="alert">{{ error }}</p>

    <section class="adm-card pf-card-stack" :class="{ 'adm-loading': loading }">
      <div class="adm-card-head">
        <div>
          <h2>Quién entra a tu portal</h2>
          <p><strong>Dueño</strong> ve comisiones, reparte tiendas y maneja al equipo. <strong>Asesor</strong> ve y atiende las tiendas.</p>
        </div>
      </div>
      <div class="pf-table-wrap">
        <table class="pf-table">
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Perfil</th>
              <th scope="col">Verificación en 2 pasos</th>
              <th scope="col">Última vez</th>
              <th v-if="canManage" scope="col"><span class="pf-sr">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in team" :key="p.id" :class="{ void: p.disabled }">
              <td>
                <div class="who">
                  <ClientAvatar :name="fullName(p)" />
                  <span>
                    <strong>{{ fullName(p) }}<span v-if="p.username === me" class="adm-pill info" style="margin-left: 0.4rem">Tú</span></strong>
                    <small>{{ p.email }} · @{{ p.username }}</small>
                  </span>
                </div>
              </td>
              <td>
                <select v-if="canManage && p.username !== me && !p.disabled" class="adm-inp" :value="p.role" :disabled="busy === p.id" aria-label="Perfil" @change="setRole(p, $event.target.value)">
                  <option value="partner_staff">Asesor</option>
                  <option value="partner_admin">Dueño</option>
                </select>
                <span v-else class="adm-pill" :class="p.role === 'partner_admin' ? 'info' : ''">{{ p.roleName }}</span>
              </td>
              <td>
                <span v-if="p.mfaEnabled" class="adm-pill good">Activa</span>
                <span v-else class="adm-pill warn">La activa al entrar</span>
              </td>
              <td>{{ p.disabled ? "Desactivada" : p.lastLoginAt ? ago(p.lastLoginAt) : "nunca ha entrado" }}</td>
              <td v-if="canManage">
                <button v-if="p.username !== me" type="button" class="adm-btn sm" :class="p.disabled ? 'primary' : 'danger-ghost'" :disabled="busy === p.id" @click="toggle(p)">
                  {{ p.disabled ? "Reactivar" : confirm === p.id ? "¿Desactivar?" : "Desactivar" }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="adm-hint">Al desactivar a alguien se le cierran las sesiones y sus tiendas quedan sin responsable para que las repartas.</p>
    </section>

    <MemberDialog v-if="showNew" :save="(p) => apiService.partnerCreateMember(p)" @close="showNew = false" @created="created" />
  </PartnerFrame>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import PartnerFrame from "../../components/partner/PartnerFrame.vue";
import MemberDialog from "../../components/partner/MemberDialog.vue";
import ClientAvatar from "../../components/platform/ClientAvatar.vue";
import { apiService } from "../../apiService";
import { authStore, isPartnerAdmin } from "../../authStore";
import { ago } from "../../platform/format";

const team = ref([]);
const loading = ref(true);
const error = ref("");
const flash = ref("");
const showNew = ref(false);
const busy = ref("");
const confirm = ref("");

const canManage = computed(() => isPartnerAdmin());
const me = computed(() => authStore.username || "");
const fullName = (p) => `${p.name || ""} ${p.lastName || ""}`.trim() || p.username;
const subtitle = computed(() => {
  const n = team.value.filter((p) => !p.disabled).length;
  return n ? `${n} ${n === 1 ? "persona activa" : "personas activas"}` : "Cargando…";
});

function say(msg) {
  flash.value = msg;
  setTimeout(() => (flash.value = ""), 5000);
}
const errText = (e, fallback) => (typeof e.response?.data === "string" ? e.response.data : fallback);

async function load() {
  loading.value = true;
  try {
    team.value = await apiService.partnerTeam();
  } catch (e) {
    error.value = errText(e, "No pude cargar a tu equipo.");
  } finally {
    loading.value = false;
  }
}

async function created(person) {
  showNew.value = false;
  say(`Listo: ${person.username} ya puede entrar. La primera vez activará la verificación en dos pasos.`);
  await load();
}

async function toggle(p) {
  if (!p.disabled && confirm.value !== p.id) {
    confirm.value = p.id;
    setTimeout(() => (confirm.value = ""), 4000);
    return;
  }
  confirm.value = "";
  busy.value = p.id;
  error.value = "";
  try {
    await apiService.partnerSetMemberActive(p.id, p.disabled);
    say(p.disabled ? `${fullName(p)} puede volver a entrar.` : `${fullName(p)} ya no puede entrar.`);
    await load();
  } catch (e) {
    error.value = errText(e, "No pude cambiar su acceso.");
  } finally {
    busy.value = "";
  }
}

async function setRole(p, role) {
  busy.value = p.id;
  error.value = "";
  try {
    await apiService.partnerSetMemberRole(p.id, role);
    say(`${fullName(p)} ahora es ${role === "partner_admin" ? "Dueño" : "Asesor"}.`);
    await load();
  } catch (e) {
    error.value = errText(e, "No pude cambiar su perfil.");
    await load();
  } finally {
    busy.value = "";
  }
}

onMounted(load);
</script>

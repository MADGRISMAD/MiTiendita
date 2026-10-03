<template>
  <div class="pf-card-stack">
    <p v-if="!people.length" class="pf-muted">Esta tienda no tiene cuentas.</p>
    <div v-else class="pf-table-wrap">
      <table class="pf-table">
        <thead>
          <tr>
            <th scope="col">Persona</th>
            <th scope="col">Rol</th>
            <th scope="col">Última vez</th>
            <th scope="col"><span class="pf-sr">Contacto</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in people" :key="p.id">
            <td>
              <div class="who">
                <ClientAvatar :name="fullName(p)" size="2.2rem" />
                <span>
                  <strong>{{ fullName(p) }}</strong>
                  <small>{{ p.email || `@${p.username}` }}</small>
                </span>
              </div>
            </td>
            <td>
              <span class="adm-pill" :class="p.role === 'admin' ? 'info' : ''">{{ p.role === "admin" ? "Dueño" : "Cajero" }}</span>
              <span v-if="p.disabled" class="adm-pill" style="margin-left: 0.3rem">Desactivada</span>
              <span v-if="p.mfaEnabled" class="pf-chip" style="margin-left: 0.3rem" title="Tiene verificación en dos pasos">2FA</span>
            </td>
            <td>{{ p.lastLoginAt ? ago(p.lastLoginAt) : "nunca" }}</td>
            <td>
              <div class="acts">
                <a v-if="p.email" class="adm-btn sm" :href="`mailto:${p.email}`">Correo</a>
                <a v-if="digits(p.cellphone)" class="adm-btn sm wa" :href="wa(p.cellphone)" target="_blank" rel="noopener">WhatsApp</a>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import ClientAvatar from "./ClientAvatar.vue";
import { ago } from "../../platform/format";

const props = defineProps({ detail: { type: Object, required: true } });

const people = computed(() => [...(props.detail.users || [])].sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1)));
const fullName = (p) => `${p.name || ""} ${p.lastName || ""}`.trim() || p.username || "Sin nombre";
const digits = (v) => String(v || "").replace(/\D/g, "").replace(/^0+$/, "");
const wa = (v) => `https://wa.me/${digits(v).length === 10 ? `52${digits(v)}` : digits(v)}`;
</script>

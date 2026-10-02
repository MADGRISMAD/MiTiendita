<template>
  <AppShell>
    <div class="adm cus">
      <header class="adm-head">
        <div>
          <h1>Clientes</h1>
          <p>{{ headline }}</p>
        </div>
        <div class="adm-acts">
          <button type="button" class="adm-btn hide-mobile" :disabled="!customers.length" @click="exportCsv">
            <PosIcon name="download" :size="18" /> Exportar
          </button>
          <button type="button" class="adm-btn primary" @click="openCreate">
            <PosIcon name="user-plus" :size="18" /> <span>Nuevo cliente</span>
          </button>
        </div>
      </header>

      <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
      <p v-if="error" class="adm-banner err" role="alert">
        <PosIcon name="alert" :size="18" /> <span>{{ error }}</span>
        <button type="button" class="adm-x" aria-label="Cerrar aviso" @click="error = ''"><PosIcon name="x" :size="16" /></button>
      </p>

      <div v-if="customers.length" class="adm-tools">
        <label class="adm-search">
          <PosIcon name="search" :size="17" />
          <input v-model="q" class="adm-inp" type="search" placeholder="Nombre, teléfono, correo o nota" aria-label="Buscar cliente" />
        </label>
        <div class="adm-tabs" role="group" aria-label="Ordenar">
          <button type="button" :class="{ on: sort === 'az' }" :aria-pressed="sort === 'az'" @click="sort = 'az'">A–Z</button>
          <button type="button" :class="{ on: sort === 'recent' }" :aria-pressed="sort === 'recent'" @click="sort = 'recent'">Recientes</button>
        </div>
      </div>

      <div :class="{ 'adm-loading': loading }">
        <template v-if="groups.length">
          <section v-for="g in groups" :key="g.key" class="cus-group">
            <h2 v-if="g.label" class="cus-letter">{{ g.label }}</h2>
            <div class="cus-grid">
              <article v-for="c in g.items" :key="c.id" class="adm-card cus-card">
                <div class="cus-top">
                  <span class="adm-avatar" :style="hueStyle(c.name)">{{ initials(c.name) }}</span>
                  <button type="button" class="cus-name" @click="openEdit(c)">
                    <strong>{{ c.name }}</strong>
                    <small>{{ c.createdAt ? `Cliente desde ${since(c.createdAt)}` : 'Cliente' }}</small>
                  </button>
                  <button type="button" class="adm-btn icon sm" :aria-label="`Editar a ${c.name}`" @click="openEdit(c)">
                    <PosIcon name="edit" :size="17" />
                  </button>
                </div>
                <ul v-if="c.phone || c.email" class="cus-contact">
                  <li v-if="c.phone"><PosIcon name="phone" :size="15" /> {{ prettyPhone(c.phone) }}</li>
                  <li v-if="c.email"><PosIcon name="mail" :size="15" /> {{ c.email }}</li>
                </ul>
                <p v-if="c.notes" class="cus-notes">{{ c.notes }}</p>
                <div v-if="c.phone || c.email" class="cus-acts">
                  <a v-if="waLink(c.phone)" class="adm-btn wa sm" :href="waLink(c.phone)" target="_blank" rel="noopener">
                    <PosIcon name="chat" :size="16" /> WhatsApp
                  </a>
                  <a v-if="c.phone" class="adm-btn sm" :href="telLink(c.phone)"><PosIcon name="phone" :size="16" /> Llamar</a>
                  <a v-if="c.email" class="adm-btn sm" :href="`mailto:${c.email}`"><PosIcon name="mail" :size="16" /> Correo</a>
                </div>
              </article>
            </div>
          </section>
        </template>
        <div v-else-if="!loading" class="adm-empty">
          <PosIcon name="users" :size="30" />
          <h3>{{ customers.length ? 'Nadie coincide' : 'Aún no tienes clientes guardados' }}</h3>
          <p v-if="customers.length">Prueba con otra parte del nombre o del teléfono.</p>
          <p v-else>Guarda a tus clientes frecuentes con su teléfono para avisarles por WhatsApp cuando llegue lo que buscan.</p>
          <button v-if="!customers.length" type="button" class="adm-btn primary" @click="openCreate">
            <PosIcon name="user-plus" :size="18" /> Agregar el primero
          </button>
        </div>
      </div>

      <!-- Alta / edición -->
      <Teleport to="body">
        <div v-if="showForm" class="adm-dlg-bg" @click.self="showForm = false">
          <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="cus-title" @submit.prevent="save">
            <div class="adm-dlg-head">
              <span v-if="editing" class="adm-avatar" :style="hueStyle(form.name)">{{ initials(form.name || '?') }}</span>
              <span v-else class="adm-dlg-ico"><PosIcon name="user-plus" :size="22" /></span>
              <div>
                <h3 id="cus-title">{{ editing ? 'Editar cliente' : 'Nuevo cliente' }}</h3>
                <p>Solo el nombre es obligatorio.</p>
              </div>
              <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="showForm = false"><PosIcon name="x" :size="18" /></button>
            </div>
            <label class="adm-field">
              <span>Nombre</span>
              <input ref="nameInput" v-model="form.name" class="adm-inp" required maxlength="80" autocomplete="off" placeholder="Doña Mary" />
            </label>
            <div class="adm-row2">
              <label class="adm-field">
                <span>Teléfono <em>(opcional)</em></span>
                <input v-model="form.phone" class="adm-inp" type="tel" inputmode="tel" maxlength="20" autocomplete="off" placeholder="55 1234 5678" @blur="form.phone = prettyPhone(form.phone)" />
              </label>
              <label class="adm-field">
                <span>Correo <em>(opcional)</em></span>
                <input v-model="form.email" class="adm-inp" type="email" maxlength="120" autocomplete="off" placeholder="nombre@correo.com" />
              </label>
            </div>
            <p v-if="phoneHint" class="adm-hint warn-hint">{{ phoneHint }}</p>
            <label class="adm-field">
              <span>Notas <em>(opcional)</em></span>
              <textarea v-model="form.notes" class="adm-inp" rows="3" maxlength="400" placeholder="Le gusta el pan dulce, paga los viernes…"></textarea>
            </label>
            <p v-if="formErr" class="adm-err">{{ formErr }}</p>
            <div class="adm-dlg-acts" :class="{ three: editing }">
              <button v-if="editing" type="button" class="adm-btn danger-ghost" :disabled="saving" @click="remove">
                {{ confirmDelete ? '¿Seguro?' : 'Eliminar' }}
              </button>
              <button type="button" class="adm-btn" @click="showForm = false">Cancelar</button>
              <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </form>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import "../admin.css";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import { apiService } from "../apiService";
import { prettyPhone } from "../phone";

const SORT_KEY = "timber_customers_sort";

const customers = ref([]);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const flash = ref("");
let flashTimer = null;
function say(msg) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ""), 4000);
}

const q = ref("");
const sort = ref(readSort());
function readSort() {
  try {
    return localStorage.getItem(SORT_KEY) === "recent" ? "recent" : "az";
  } catch {
    return "az";
  }
}

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
function digits(s) {
  return String(s || "").replace(/\D/g, "");
}
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toUpperCase();
}
function hueStyle(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return { "--h": h };
}

function waLink(p) {
  const d = digits(p);
  if (d.length < 10) return "";
  return `https://wa.me/${d.length === 10 ? `52${d}` : d}`;
}
function telLink(p) {
  const d = digits(p);
  return `tel:${d.length === 10 ? d : `+${d}`}`;
}
function since(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-MX", { month: "short", year: "numeric" }).replace(".", "");
}

const headline = computed(() => {
  if (loading.value) return "Cargando…";
  const n = customers.value.length;
  if (!n) return "Tu libreta de clientes";
  const withPhone = customers.value.filter((c) => digits(c.phone).length >= 10).length;
  return `${n} ${n === 1 ? "cliente" : "clientes"} · ${withPhone} con WhatsApp`;
});

const filtered = computed(() => {
  const term = fold(q.value.trim());
  const termDigits = digits(q.value);
  const list = customers.value.filter((c) => {
    if (!term) return true;
    return (
      fold(c.name).includes(term) ||
      fold(c.email).includes(term) ||
      fold(c.notes).includes(term) ||
      (termDigits.length >= 3 && digits(c.phone).includes(termDigits))
    );
  });
  if (sort.value === "recent") return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" }));
});

// En A–Z se agrupa por inicial, como una libreta
const groups = computed(() => {
  if (sort.value !== "az" || filtered.value.length < 24) return filtered.value.length ? [{ key: "all", label: "", items: filtered.value }] : [];
  const out = [];
  for (const c of filtered.value) {
    const raw = String(c.name || "").trim().charAt(0).toUpperCase();
    const first = raw === "Ñ" ? "Ñ" : fold(raw).toUpperCase();
    const letter = /[A-ZÑ]/.test(first) ? first : "#";
    let g = out[out.length - 1];
    if (!g || g.key !== letter) {
      g = { key: letter, label: letter, items: [] };
      out.push(g);
    }
    g.items.push(c);
  }
  return out;
});

// ---------- Formulario ----------
const showForm = ref(false);
const editing = ref(null);
const confirmDelete = ref(false);
const formErr = ref("");
const nameInput = ref(null);
const form = reactive({ name: "", phone: "", email: "", notes: "" });

const phoneHint = computed(() => {
  const d = digits(form.phone);
  if (!d) return "";
  if (d.length < 10) return "El teléfono lleva 10 dígitos para poder escribirle por WhatsApp.";
  const dup = customers.value.find((c) => c.id !== editing.value && digits(c.phone) === d);
  return dup ? `Ojo: ${dup.name} ya tiene este teléfono.` : "";
});

function fill(c = null) {
  editing.value = c?.id || null;
  confirmDelete.value = false;
  formErr.value = "";
  form.name = c?.name || "";
  form.phone = c?.phone || "";
  form.email = c?.email || "";
  form.notes = c?.notes || "";
}
function openCreate() {
  fill();
  if (q.value.trim() && !/\d{3,}/.test(q.value)) form.name = q.value.trim();
  showForm.value = true;
  nextTick(() => nameInput.value?.focus());
}
function openEdit(c) {
  fill(c);
  showForm.value = true;
}
function errText(e, fallback) {
  const d = e?.response?.data;
  return typeof d === "string" && d ? d : fallback;
}

async function save() {
  const payload = {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    notes: form.notes.trim(),
  };
  if (!payload.name) {
    formErr.value = "Escribe el nombre del cliente.";
    return;
  }
  saving.value = true;
  formErr.value = "";
  try {
    if (editing.value) {
      const updated = await apiService.updateCustomer(editing.value, payload);
      const idx = customers.value.findIndex((c) => c.id === editing.value);
      if (idx >= 0) customers.value[idx] = { ...customers.value[idx], ...payload, ...(updated || {}) };
      say(`${payload.name} actualizado.`);
    } else {
      const created = await apiService.createCustomer(payload);
      customers.value = [created, ...customers.value];
      say(`${payload.name} agregado.`);
    }
    showForm.value = false;
  } catch (e) {
    formErr.value = errText(e, "No se pudo guardar el cliente.");
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  const id = editing.value;
  const name = form.name;
  saving.value = true;
  try {
    await apiService.deleteCustomer(id);
    customers.value = customers.value.filter((c) => c.id !== id);
    showForm.value = false;
    say(`${name} eliminado.`);
  } catch (e) {
    formErr.value = errText(e, "No se pudo eliminar.");
  } finally {
    saving.value = false;
  }
}

function exportCsv() {
  const cell = (v) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = filtered.value.map((c) =>
    [c.name, c.phone, c.email, c.notes, c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : ""].map(cell).join(",")
  );
  const body = ["Nombre,Telefono,Correo,Notas,Alta", ...rows].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "clientes.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function load() {
  loading.value = true;
  try {
    const list = await apiService.getCustomers();
    customers.value = Array.isArray(list) ? list : [];
  } catch {
    error.value = "No se pudieron cargar los clientes.";
    customers.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Recuerda el orden elegido en este dispositivo
watch(sort, (v) => {
  try {
    localStorage.setItem(SORT_KEY, v);
  } catch {
    /* ignore */
  }
});
</script>

<style scoped>
.cus-group + .cus-group { margin-top: 1rem; }
.cus-letter {
  position: sticky;
  top: -0.75rem;
  z-index: 1;
  margin: 0 0 0.45rem;
  padding: 0.25rem 0;
  background: var(--timber-surface);
  font-size: 0.85rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--timber-primary);
}
.cus-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  gap: 0.65rem;
}
.cus-card { display: grid; align-content: start; gap: 0.6rem; padding: 0.85rem; }
.cus-top { display: flex; align-items: center; gap: 0.65rem; }
.cus-name {
  flex: 1;
  min-width: 0;
  display: grid;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.cus-name strong { overflow: hidden; font-size: 0.98rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.cus-name small { font-size: 0.76rem; color: var(--timber-muted); }
.cus-name:hover strong { color: var(--timber-primary); }
.cus-contact {
  display: grid;
  gap: 0.2rem;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 0.86rem;
}
.cus-contact li { display: flex; align-items: center; gap: 0.4rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cus-contact svg { flex-shrink: 0; color: var(--timber-muted); }
.cus-notes {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  padding: 0.45rem 0.6rem;
  border-left: 3px solid color-mix(in srgb, var(--timber-accent) 60%, transparent);
  border-radius: 0 0.5rem 0.5rem 0;
  background: var(--timber-surface);
  font-size: 0.84rem;
  line-height: 1.4;
  color: var(--timber-muted);
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.cus-acts { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.cus-acts .adm-btn { flex: 1 1 auto; }
.warn-hint { color: var(--timber-warning); font-weight: 700; }

@media (max-width: 767.98px) {
  .cus-letter { top: -0.75rem; }
}
</style>

<template>
  <AppShell>
    <div class="floor">
      <div class="floor-bar">
        <div class="legend">
          <span class="leg free">Libre</span>
          <span class="leg busy">Ocupada</span>
          <span class="leg hint">{{ editMap ? 'Arrastra las mesas' : 'Toca una mesa' }}</span>
        </div>
        <div class="bar-actions">
          <button
            type="button"
            class="map-btn"
            :class="{ on: editMap }"
            @click="toggleEditMap"
          >
            {{ editMap ? 'Listo' : 'Mover mapa' }}
          </button>
          <button type="button" class="add-btn" @click="mostrarModalAgregarMesa">+ Mesa</button>
        </div>
      </div>

      <div
        ref="mapRef"
        class="floor-map"
        :class="{ editing: editMap }"
        :style="mapStyle"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div
          v-for="cell in gridCells"
          :key="`g-${cell.x}-${cell.y}`"
          class="grid-cell"
          :class="{ drop: dropTarget && dropTarget.x === cell.x && dropTarget.y === cell.y }"
          :style="cellStyle(cell.x, cell.y)"
        />

        <button
          v-for="mesa in mesas"
          :key="mesa.id"
          type="button"
          class="table-piece"
          :class="[
            mesa.disponible ? 'is-free' : 'is-busy',
            shapeClass(mesa.capacidad),
            { dragging: drag?.id === mesa.id, 'edit-mode': editMap },
          ]"
          :style="pieceStyle(mesa)"
          @pointerdown="onPointerDown($event, mesa)"
          @click="onTableClick(mesa)"
        >
          <span class="table-unit" aria-hidden="true">
            <span
              v-for="i in seatCount(mesa.capacidad)"
              :key="i"
              class="chair"
              :class="`c${i}`"
            />
            <span class="table-top">
              <span class="table-name">{{ shortName(mesa.nombre) }}</span>
              <span class="table-cap">{{ mesa.capacidad }}p</span>
            </span>
          </span>
        </button>
      </div>

      <p v-if="!mesas.length" class="empty">Aún no hay mesas. Toca “+ Mesa” para empezar.</p>

      <div v-if="modalActivo" class="sheet-bg">
        <div class="sheet">
          <div class="sheet-handle"></div>
          <h2>{{ mesaSeleccionada?.nombre }}</h2>
          <p class="sheet-sub">
            {{ mesaSeleccionada?.disponible ? 'Libre' : 'Ocupada' }}
            · {{ mesaSeleccionada?.capacidad }} personas
            · {{ shapeLabel(mesaSeleccionada?.capacidad) }}
          </p>

          <button type="button" class="big-action primary" @click="irAPedido">
            Tomar pedido
          </button>
          <div class="action-row">
            <button type="button" class="big-action" @click="ocuparMesa">Ocupar</button>
            <button type="button" class="big-action success" @click="desocuparMesa">Liberar</button>
          </div>

          <label class="field">
            Mesero
            <select v-model="selectedWaiterPhone">
              <option value="">Sin asignar</option>
              <option v-for="w in waiters" :key="w.cellphone" :value="w.cellphone">
                {{ w.name }} {{ w.lastName }}
              </option>
            </select>
          </label>
          <button type="button" class="big-action ghost" @click="guardarMesero">Guardar mesero</button>
          <button type="button" class="big-action danger" @click="eliminarMesa(mesaSeleccionada)">Eliminar mesa</button>
          <button type="button" class="big-action ghost" @click="cerrarMesa">Cerrar</button>
        </div>
      </div>

      <div v-if="modalAgregarMesa" class="sheet-bg" >
        <div class="sheet">
          <div class="sheet-handle"></div>
          <h2>Nueva mesa</h2>
          <label class="field">Nombre
            <input v-model="nombreNuevaMesa" type="text" maxlength="30" placeholder="Ej. Mesa 5" />
          </label>
          <label class="field">Capacidad
            <select v-model="capacidadNuevaMesa">
              <option value="2">2 — mesa chica (redonda)</option>
              <option value="4">4 — mesa estándar</option>
              <option value="6">6 — mesa rectangular</option>
              <option value="8">8 — mesa grande</option>
              <option value="10">10 — mesa banquetes</option>
            </select>
          </label>
          <button type="button" class="big-action primary" @click="agregarNuevaMesa">Crear mesa</button>
          <button type="button" class="big-action ghost" @click="cerrarModalAgregarMesa">Cancelar</button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup>
import AppShell from '../components/AppShell.vue';
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { apiService } from '../apiService.ts';

const COLS = 12;
const ROWS = 8;

const router = useRouter();
const mapRef = ref(null);
const mesas = ref([]);
const waiters = ref([]);
const modalActivo = ref(false);
const modalAgregarMesa = ref(false);
const nombreNuevaMesa = ref('');
const capacidadNuevaMesa = ref('4');
const mesaSeleccionada = ref(null);
const selectedWaiterPhone = ref('');
const editMap = ref(false);
const drag = ref(null);
const dropTarget = ref(null);
const skipClick = ref(false);

const gridCells = computed(() => {
  const cells = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
});

const mapStyle = computed(() => ({
  gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${ROWS}, minmax(3.4rem, 1fr))`,
}));

function shapeClass(cap) {
  const n = Number(cap) || 4;
  if (n <= 2) return 'shape-2';
  if (n <= 4) return 'shape-4';
  if (n <= 6) return 'shape-6';
  if (n <= 8) return 'shape-8';
  return 'shape-10';
}

function shapeLabel(cap) {
  const n = Number(cap) || 4;
  if (n <= 2) return 'Redonda chica';
  if (n <= 4) return 'Cuadrada';
  if (n <= 6) return 'Rectangular';
  if (n <= 8) return 'Grande';
  return 'Banquete';
}

function shortName(name) {
  const t = String(name || '').trim();
  const m = t.match(/(\d+)/);
  if (m) return m[1];
  return t.slice(0, 4).toUpperCase();
}

function seatCount(cap) {
  const n = Number(cap) || 4;
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 6) return 6;
  if (n <= 8) return 8;
  return 10;
}

function cellStyle(x, y) {
  return { gridColumn: x + 1, gridRow: y + 1 };
}

function pieceStyle(mesa) {
  const x = Number(mesa.posX) || 0;
  const y = Number(mesa.posY) || 0;
  const span = spanFor(mesa.capacidad);
  const style = {
    gridColumn: `${x + 1} / span ${span.w}`,
    gridRow: `${y + 1} / span ${span.h}`,
  };
  if (drag.value?.id === mesa.id && drag.value.ghost) {
    style.transform = `translate(${drag.value.ghost.dx}px, ${drag.value.ghost.dy}px)`;
    style.zIndex = 20;
  }
  return style;
}

function spanFor(cap) {
  const n = Number(cap) || 4;
  if (n <= 2) return { w: 1, h: 1 };
  if (n <= 4) return { w: 1, h: 1 };
  if (n <= 6) return { w: 2, h: 1 };
  if (n <= 8) return { w: 2, h: 2 };
  return { w: 3, h: 1 };
}

function occupiedKeys(excludeId = null) {
  const set = new Set();
  for (const m of mesas.value) {
    if (excludeId && m.id === excludeId) continue;
    const span = spanFor(m.capacidad);
    const x0 = Number(m.posX) || 0;
    const y0 = Number(m.posY) || 0;
    for (let dy = 0; dy < span.h; dy += 1) {
      for (let dx = 0; dx < span.w; dx += 1) {
        set.add(`${x0 + dx},${y0 + dy}`);
      }
    }
  }
  return set;
}

function canPlace(x, y, cap, excludeId = null) {
  const span = spanFor(cap);
  if (x < 0 || y < 0 || x + span.w > COLS || y + span.h > ROWS) return false;
  const taken = occupiedKeys(excludeId);
  for (let dy = 0; dy < span.h; dy += 1) {
    for (let dx = 0; dx < span.w; dx += 1) {
      if (taken.has(`${x + dx},${y + dy}`)) return false;
    }
  }
  return true;
}

function findFreeSlot(cap, excludeId = null) {
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (canPlace(x, y, cap, excludeId)) return { x, y };
    }
  }
  return { x: 0, y: 0 };
}

async function ensurePositions(list) {
  const assigned = list.map((m) => ({ ...m }));
  const pending = [];

  // Solo las que ya tienen posición cuentan para colisión
  mesas.value = assigned.filter(
    (m) => m.posX != null && m.posY != null && !Number.isNaN(Number(m.posX))
  );

  for (const m of assigned) {
    if (m.posX != null && m.posY != null && !Number.isNaN(Number(m.posX))) continue;
    const slot = findFreeSlot(m.capacidad);
    m.posX = slot.x;
    m.posY = slot.y;
    mesas.value = [...mesas.value, m];
    pending.push(m);
  }

  mesas.value = assigned;
  await Promise.all(
    pending.map((m) =>
      apiService.editTable(m.id, { posX: m.posX, posY: m.posY }).catch(() => null)
    )
  );
}

async function refillMesas() {
  try {
    const list = (await apiService.getTables()) || [];
    mesas.value = list;
    await ensurePositions(list);
  } catch {
    mesas.value = [];
  }
}

async function loadWaiters() {
  try {
    waiters.value = (await apiService.getWaiters()) || [];
  } catch {
    waiters.value = [];
  }
}

function toggleEditMap() {
  editMap.value = !editMap.value;
  drag.value = null;
  dropTarget.value = null;
}

function onTableClick(mesa) {
  if (editMap.value || skipClick.value) {
    skipClick.value = false;
    return;
  }
  abrirMesa(mesa);
}

function abrirMesa(mesa) {
  mesaSeleccionada.value = mesa;
  selectedWaiterPhone.value =
    typeof mesa.mesero === 'string' ? mesa.mesero : mesa.mesero?.cellphone || '';
  modalActivo.value = true;
}

function irAPedido() {
  const m = mesaSeleccionada.value;
  if (!m) return;
  router.push({ path: '/menu', query: { tableId: m.id, tableName: m.nombre } });
}

function mostrarModalAgregarMesa() {
  modalAgregarMesa.value = true;
}
function cerrarModalAgregarMesa() {
  modalAgregarMesa.value = false;
  nombreNuevaMesa.value = '';
}
function cerrarMesa() {
  modalActivo.value = false;
  mesaSeleccionada.value = null;
}

function pointerToCell(clientX, clientY) {
  const el = mapRef.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const x = Math.floor(((clientX - rect.left) / rect.width) * COLS);
  const y = Math.floor(((clientY - rect.top) / rect.height) * ROWS);
  return {
    x: Math.max(0, Math.min(COLS - 1, x)),
    y: Math.max(0, Math.min(ROWS - 1, y)),
  };
}

function onPointerDown(e, mesa) {
  if (!editMap.value) return;
  e.preventDefault();
  e.currentTarget.setPointerCapture?.(e.pointerId);
  drag.value = {
    id: mesa.id,
    startX: e.clientX,
    startY: e.clientY,
    originX: Number(mesa.posX) || 0,
    originY: Number(mesa.posY) || 0,
    capacidad: mesa.capacidad,
    ghost: { dx: 0, dy: 0 },
  };
  dropTarget.value = { x: drag.value.originX, y: drag.value.originY };
}

function onPointerMove(e) {
  if (!drag.value) return;
  const dx = e.clientX - drag.value.startX;
  const dy = e.clientY - drag.value.startY;
  drag.value = { ...drag.value, ghost: { dx, dy } };
  if (Math.abs(dx) + Math.abs(dy) > 6) skipClick.value = true;
  const cell = pointerToCell(e.clientX, e.clientY);
  if (!cell) return;
  if (canPlace(cell.x, cell.y, drag.value.capacidad, drag.value.id)) {
    dropTarget.value = cell;
  }
}

async function onPointerUp() {
  if (!drag.value) return;
  const { id, capacidad, originX, originY } = drag.value;
  const target = dropTarget.value;
  drag.value = null;
  dropTarget.value = null;

  if (!target || (target.x === originX && target.y === originY)) return;
  if (!canPlace(target.x, target.y, capacidad, id)) return;

  const idx = mesas.value.findIndex((m) => m.id === id);
  if (idx < 0) return;
  const prev = mesas.value[idx];
  mesas.value[idx] = { ...prev, posX: target.x, posY: target.y };
  try {
    const updated = await apiService.editTable(id, { posX: target.x, posY: target.y });
    mesas.value[idx] = { ...mesas.value[idx], ...updated };
  } catch {
    mesas.value[idx] = prev;
    alert('No se pudo guardar la posición');
  }
}

async function agregarNuevaMesa() {
  try {
    const capacidad = Number(capacidadNuevaMesa.value) || 4;
    const slot = findFreeSlot(capacidad);
    const response = await apiService.createTable({
      nombre: nombreNuevaMesa.value || `Mesa ${mesas.value.length + 1}`,
      capacidad,
      disponible: true,
      posX: slot.x,
      posY: slot.y,
    });
    mesas.value = [...mesas.value, response];
    cerrarModalAgregarMesa();
  } catch {
    alert('No se pudo crear la mesa');
  }
}

async function eliminarMesa(mesa) {
  if (!mesa) return;
  if (!confirm(`¿Eliminar ${mesa.nombre}?`)) return;
  try {
    await apiService.deleteTable(mesa.id);
    mesas.value = mesas.value.filter((m) => m.id !== mesa.id);
    cerrarMesa();
  } catch {
    alert('No se pudo eliminar');
  }
}

async function guardarMesero() {
  if (!mesaSeleccionada.value) return;
  const updated = await apiService.editTable(mesaSeleccionada.value.id, {
    mesero: selectedWaiterPhone.value || null,
  });
  const idx = mesas.value.findIndex((m) => m.id === updated.id);
  if (idx >= 0) mesas.value[idx] = { ...mesas.value[idx], ...updated };
  mesaSeleccionada.value = { ...mesaSeleccionada.value, ...updated };
}

async function ocuparMesa() {
  const updated = await apiService.editTable(mesaSeleccionada.value.id, {
    disponible: false,
    mesero: selectedWaiterPhone.value || mesaSeleccionada.value.mesero || null,
  });
  const idx = mesas.value.findIndex((m) => m.id === updated.id);
  if (idx >= 0) mesas.value[idx] = { ...mesas.value[idx], ...updated };
  cerrarMesa();
}

async function desocuparMesa() {
  const updated = await apiService.editTable(mesaSeleccionada.value.id, {
    disponible: true,
    personaTitular: null,
  });
  const idx = mesas.value.findIndex((m) => m.id === updated.id);
  if (idx >= 0) mesas.value[idx] = { ...mesas.value[idx], ...updated };
  cerrarMesa();
}

onMounted(async () => {
  await Promise.all([refillMesas(), loadWaiters()]);
});
</script>

<style scoped>
.floor { max-width: 1200px; margin: 0 auto; }
.floor-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
  flex-wrap: wrap;
}
.legend { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
.leg {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
}
.leg.free { background: var(--timber-success-soft); color: var(--timber-success); }
.leg.busy { background: var(--timber-danger-soft); color: var(--timber-danger); }
.leg.hint {
  background: var(--timber-surface);
  color: var(--timber-muted);
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
}
.bar-actions { display: flex; gap: 0.5rem; }
.map-btn, .add-btn {
  min-height: 3rem;
  padding: 0 1.1rem;
  border: none;
  border-radius: 0.8rem;
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
}
.map-btn {
  background: var(--timber-surface);
  color: var(--timber-ink);
  border: 1px solid var(--timber-line);
}
.map-btn.on {
  background: var(--timber-accent, #b8956c);
  color: #1a1a1a;
  border-color: transparent;
}
.add-btn {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  box-shadow: var(--timber-shadow);
}

.floor-map {
  --floor-line: rgba(70, 55, 35, 0.07);
  position: relative;
  display: grid;
  gap: 0;
  min-height: min(68vh, 34rem);
  background-color: #d9cbb3;
  background-image:
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 47px,
      var(--floor-line) 47px,
      var(--floor-line) 48px
    ),
    linear-gradient(180deg, #e2d6c0 0%, #d2c2a6 100%);
  border: 1px solid color-mix(in srgb, var(--timber-line) 80%, #8a734f);
  border-radius: 1rem;
  overflow: hidden;
  touch-action: none;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}
.floor-map.editing {
  outline: 2px solid color-mix(in srgb, var(--timber-primary) 55%, transparent);
  outline-offset: -3px;
}

.grid-cell {
  border: 1px solid transparent;
  border-right-color: rgba(90, 70, 40, 0.06);
  border-bottom-color: rgba(90, 70, 40, 0.06);
  pointer-events: none;
  min-height: 3.4rem;
}
.grid-cell.drop {
  background: color-mix(in srgb, var(--timber-primary) 18%, transparent);
  border-color: color-mix(in srgb, var(--timber-primary) 35%, transparent);
}

/* Celda contenedora: solo alinea, sin fondo */
.table-piece {
  position: relative;
  margin: 0;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
  z-index: 2;
}
.table-piece.edit-mode { cursor: grab; }
.table-piece.dragging {
  cursor: grabbing;
  z-index: 30;
}
.table-piece.dragging .table-unit {
  transform: scale(1.04);
  filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.28));
}

.table-unit {
  position: relative;
  width: 4.5rem;
  height: 4.5rem;
  flex-shrink: 0;
  transition: transform 0.12s ease, filter 0.12s ease;
}

.chair {
  position: absolute;
  width: 0.85rem;
  height: 0.55rem;
  border-radius: 0.2rem;
  background: #4a3f33;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
  pointer-events: none;
  z-index: 0;
}

.table-top {
  position: absolute;
  inset: 18%;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.05rem;
  color: #fff;
  border: 2px solid rgba(255, 255, 255, 0.22);
  box-shadow:
    0 4px 10px rgba(40, 28, 12, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.table-piece.is-free .table-top {
  background: linear-gradient(165deg, #3d8f6a 0%, #2f6f52 100%);
}
.table-piece.is-busy .table-top {
  background: linear-gradient(165deg, #c45c4a 0%, #a64436 100%);
}

.table-name {
  font-family: var(--font-display);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.02em;
}
.table-cap {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.88;
}

/* —— 2 personas: redonda —— */
.shape-2 .table-unit { width: 3.6rem; height: 3.6rem; }
.shape-2 .table-top { inset: 22%; border-radius: 999px; }
.shape-2 .chair { width: 0.7rem; height: 0.48rem; }
.shape-2 .c1 { left: 50%; top: 2%; transform: translateX(-50%); }
.shape-2 .c2 { left: 50%; bottom: 2%; transform: translateX(-50%); }

/* —— 4 personas: cuadrada —— */
.shape-4 .table-unit { width: 4.2rem; height: 4.2rem; }
.shape-4 .table-top { inset: 20%; border-radius: 0.55rem; }
.shape-4 .c1 { left: 50%; top: 2%; transform: translateX(-50%); }
.shape-4 .c2 { right: 2%; top: 50%; transform: translateY(-50%) rotate(90deg); }
.shape-4 .c3 { left: 50%; bottom: 2%; transform: translateX(-50%); }
.shape-4 .c4 { left: 2%; top: 50%; transform: translateY(-50%) rotate(90deg); }

/* —— 6 personas: rectangular —— */
.shape-6 .table-unit { width: 7.2rem; height: 4rem; }
.shape-6 .table-top { inset: 20% 12%; border-radius: 0.7rem; }
.shape-6 .c1 { left: 28%; top: 2%; transform: translateX(-50%); }
.shape-6 .c2 { left: 50%; top: 2%; transform: translateX(-50%); }
.shape-6 .c3 { left: 72%; top: 2%; transform: translateX(-50%); }
.shape-6 .c4 { left: 28%; bottom: 2%; transform: translateX(-50%); }
.shape-6 .c5 { left: 50%; bottom: 2%; transform: translateX(-50%); }
.shape-6 .c6 { left: 72%; bottom: 2%; transform: translateX(-50%); }

/* —— 8 personas: mesa grande —— */
.shape-8 .table-unit { width: 6.6rem; height: 6.6rem; }
.shape-8 .table-top { inset: 18%; border-radius: 0.65rem; }
.shape-8 .c1 { left: 32%; top: 2%; transform: translateX(-50%); }
.shape-8 .c2 { left: 68%; top: 2%; transform: translateX(-50%); }
.shape-8 .c3 { right: 2%; top: 32%; transform: translateY(-50%) rotate(90deg); }
.shape-8 .c4 { right: 2%; top: 68%; transform: translateY(-50%) rotate(90deg); }
.shape-8 .c5 { left: 68%; bottom: 2%; transform: translateX(-50%); }
.shape-8 .c6 { left: 32%; bottom: 2%; transform: translateX(-50%); }
.shape-8 .c7 { left: 2%; top: 68%; transform: translateY(-50%) rotate(90deg); }
.shape-8 .c8 { left: 2%; top: 32%; transform: translateY(-50%) rotate(90deg); }

/* —— 10 personas: banquete —— */
.shape-10 .table-unit { width: 10.5rem; height: 3.8rem; }
.shape-10 .table-top { inset: 22% 8%; border-radius: 999px; }
.shape-10 .chair { width: 0.72rem; }
.shape-10 .c1 { left: 18%; top: 2%; transform: translateX(-50%); }
.shape-10 .c2 { left: 34%; top: 2%; transform: translateX(-50%); }
.shape-10 .c3 { left: 50%; top: 2%; transform: translateX(-50%); }
.shape-10 .c4 { left: 66%; top: 2%; transform: translateX(-50%); }
.shape-10 .c5 { left: 82%; top: 2%; transform: translateX(-50%); }
.shape-10 .c6 { left: 18%; bottom: 2%; transform: translateX(-50%); }
.shape-10 .c7 { left: 34%; bottom: 2%; transform: translateX(-50%); }
.shape-10 .c8 { left: 50%; bottom: 2%; transform: translateX(-50%); }
.shape-10 .c9 { left: 66%; bottom: 2%; transform: translateX(-50%); }
.shape-10 .c10 { left: 82%; bottom: 2%; transform: translateX(-50%); }

.empty {
  text-align: center;
  color: var(--timber-muted);
  margin-top: 2rem;
  font-size: 1.05rem;
}

.sheet-bg {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(10, 16, 14, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: min(32rem, 100%);
  background: var(--timber-panel);
  color: var(--timber-ink);
  border-radius: 1.25rem 1.25rem 0 0;
  padding: 0.75rem 1rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
  display: grid;
  gap: 0.55rem;
  max-height: 88vh;
  overflow: auto;
  animation: slide-up 0.22s ease;
  border: 1px solid var(--timber-line);
}
@keyframes slide-up {
  from { transform: translateY(24px); opacity: 0.6; }
  to { transform: translateY(0); opacity: 1; }
}
.sheet-handle {
  width: 2.5rem;
  height: 0.3rem;
  border-radius: 999px;
  background: var(--timber-line);
  margin: 0.15rem auto 0.35rem;
}
.sheet h2 {
  margin: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.sheet-sub {
  margin: 0;
  text-align: center;
  color: var(--timber-muted);
}
.big-action {
  min-height: 3.35rem;
  border: none;
  border-radius: 0.9rem;
  font-size: 1.05rem;
  font-weight: 700;
  cursor: pointer;
  background: var(--timber-surface);
  color: var(--timber-ink);
}
.big-action.primary {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  box-shadow: var(--timber-shadow);
}
.big-action.success { background: var(--timber-success); color: #fff; }
.big-action.danger { background: var(--timber-danger-soft); color: var(--timber-danger); }
.big-action.ghost { background: transparent; border: 1px solid var(--timber-line); }
.action-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
.field { display: grid; gap: 0.35rem; font-weight: 600; font-size: 0.9rem; }
.field input, .field select {
  min-height: 3rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  padding: 0.65rem 0.8rem;
  font: inherit;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
}

@media (min-width: 900px) {
  .sheet-bg {
    align-items: center;
    padding: 1rem;
  }
  .sheet {
    border-radius: 1.2rem;
    padding: 1.15rem;
  }
}
</style>

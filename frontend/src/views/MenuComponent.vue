<template>
  <AppShell>
    <div class="pos" :class="{ manage: mode === 'manage' }">
      <!-- Aviso de caja abierta mucho tiempo -->
      <div v-if="cashOpenWarning" class="cash-warning-banner">
        ⚠️ ¡Cuidado! La caja lleva abierta más de 12 horas. ¿Olvidaste hacer corte?
      </div>

      <!-- ═══════════ MODO VENTA — escritorio tipo Mr Tienda ═══════════ -->
      <template v-if="mode === 'pos'">
        <div class="desk">
          <!-- Barra de funciones: en móvil sin teclas F ni Cobrar duplicado -->
          <nav class="fkey-bar" aria-label="Funciones rápidas">
            <button type="button" class="fkey" @click="removeSelected" :disabled="selectedIdx < 0">
              <span class="fk only-pc">F2</span>
              <span class="fl">Anular</span>
            </button>
            <button type="button" class="fkey" @click="showPriceCheck = true">
              <span class="fk only-pc">F4</span>
              <span class="fl">Precio</span>
            </button>
            <button type="button" class="fkey" @click="showDiscount = true">
              <span class="fk only-pc">F9</span>
              <span class="fl">Dcto</span>
            </button>
            <button
              type="button"
              class="fkey accent hide-mobile"
              @click="finalizeOrder"
              :disabled="!lines.length || sending"
            >
              <span class="fk only-pc">F12</span>
              <span class="fl">Cobrar</span>
            </button>
            <button type="button" class="fkey ghost" @click="clearCart" :disabled="!lines.length">
              <span class="fl">Vaciar</span>
            </button>
          </nav>

          <div class="status-bar">
            <span class="hide-mobile">{{ businessName }}</span>
            <span>{{ itemCount }} artículos</span>
            <span v-if="ticketDiscount">Dcto {{ ticketDiscount }}%</span>
            <span class="status-hint only-pc">Escáner listo · Enter agrega</span>
            <span class="status-hint only-tablet">Listo para escanear</span>
          </div>

          <div class="desk-top">
            <div class="scan-box" :class="{ flash: scanFlash, err: !!scanError }">
              <label class="scan-label" for="pos-scan">Código / búsqueda</label>
              <input
                id="pos-scan"
                ref="scanInput"
                v-model="scanCode"
                type="text"
                class="scan-input"
                placeholder="Escanea o escribe…"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                @keydown.enter.prevent="onScanEnter"
              />
              <p v-if="scanError" class="scan-msg err">{{ scanError }}</p>
              <p v-else-if="lastAdded" class="scan-msg ok">+ {{ lastAdded.name }}</p>

              <div v-if="nameHits.length" class="hits">
                <button
                  v-for="p in nameHits"
                  :key="p.id"
                  type="button"
                  class="hit"
                  @click="addProduct(p)"
                >
                  <span>{{ p.name }}</span>
                  <strong>{{ money(p.price) }}</strong>
                </button>
              </div>
            </div>

            <aside class="price-board" aria-live="polite">
              <div class="board-screen">
                <div class="board-row">
                  <span class="board-name">{{ displayLast ? displayLast.name : 'Esperando producto' }}</span>
                  <span class="board-price">{{ displayLast ? money(lastLineTotal) : money(0) }}</span>
                </div>
                <div class="board-row sum">
                  <span class="board-kicker">Total</span>
                  <span class="board-num">{{ money(total) }}</span>
                </div>
              </div>
            </aside>
          </div>

          <div class="ticket-wrap">
            <table class="ticket-table">
              <thead>
                <tr>
                  <th class="c-code">Código</th>
                  <th class="c-qty">Cant.</th>
                  <th class="c-name">Descripción</th>
                  <th class="c-price">Precio</th>
                  <th class="c-imp">Importe</th>
                  <th class="c-act"></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pagedRows"
                  :key="row.i + '-' + row.line.id"
                  :class="{ on: selectedIdx === row.i }"
                  @click="selectedIdx = row.i"
                >
                  <td class="c-code">{{ row.line.barcode || row.line.sku || '—' }}</td>
                  <td class="c-qty">
                    <div class="qty">
                      <button type="button" @click.stop="bumpQty(row.i, -1)">−</button>
                      <span>{{ formatQty(row.line.quantity) }}</span>
                      <button type="button" @click.stop="bumpQty(row.i, 1)">+</button>
                    </div>
                  </td>
                  <td class="c-name">{{ row.line.name }}</td>
                  <td class="c-price">{{ money(row.line.price) }}</td>
                  <td class="c-imp">{{ money(lineGross(row.line)) }}</td>
                  <td class="c-act">
                    <button type="button" class="x" @click.stop="removeAt(row.i)" aria-label="Quitar">×</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="!lines.length" class="ticket-empty">
              <template v-if="!menus.length">
                Aún no hay productos.
                <router-link to="/products">Carga el catálogo</router-link>
                para poder cobrar.
              </template>
              <template v-else>
                Escanea productos. El catálogo se administra en Productos.
              </template>
            </p>
            <div v-if="pageCount > 1" class="ticket-pager">
              <button type="button" :disabled="ticketPage <= 0" @click="ticketPage--">‹</button>
              <span>Pág. {{ ticketPage + 1 }} / {{ pageCount }}</span>
              <button type="button" :disabled="ticketPage >= pageCount - 1" @click="ticketPage++">›</button>
            </div>
          </div>

          <footer class="last-bar">
            <div class="last-thumb hide-mobile" :class="{ empty: !displayLast?.imgUrl }">
              <img v-if="displayLast?.imgUrl" :src="displayLast.imgUrl" alt="" @error="$event.target.style.display = 'none'" />
              <span v-else>{{ displayLast ? initial(displayLast.name) : '·' }}</span>
            </div>
            <div class="last-meta">
              <template v-if="displayLast">
                <p class="last-name">{{ displayLast.name }}</p>
                <p class="last-math hide-mobile">
                  {{ formatQty(lastLineQty) }} × {{ money(displayLast.price) }}
                  <template v-if="ticketDiscount"> − {{ ticketDiscount }}%</template>
                  = {{ money(lastLineTotal) }}
                </p>
              </template>
              <p v-else class="last-idle">Escanea para agregar</p>
              <p v-if="msg" class="foot-msg">
                {{ msg }}
                <a
                  v-if="lastTicketId"
                  class="ticket-reprint"
                  :href="`/print/order/${lastTicketId}?mode=receipt`"
                  target="_blank"
                  rel="noopener"
                >Imprimir ticket</a>
              </p>
            </div>
            <button
              type="button"
              class="btn-cobrar"
              :disabled="!lines.length || sending"
              @click="finalizeOrder"
            >
              {{ sending ? '…' : 'COBRAR' }}
            </button>
          </footer>
        </div>
      </template>

      <!-- ═══════════ MODO CATÁLOGO ═══════════ -->
      <template v-else>
        <div class="sell-toolbar">
          <p class="toolbar-title">Catálogo</p>
          <div class="toolbar-right">
            <button type="button" class="seg" @click="goMode('pos')">Vender</button>
            <button type="button" class="seg on">Editar</button>
          </div>
        </div>

        <!-- Alerta de stock bajo -->
        <div v-if="lowStockItems.length" class="low-stock-banner">
          <span class="low-stock-icon">⚠️</span>
          <div class="low-stock-body">
            <strong>Stock bajo ({{ lowStockItems.length }})</strong>
            <span class="low-stock-list">
              {{ lowStockItems.slice(0, 5).map(p => p.name + ' (' + (Number(p.stock) || 0) + ')').join(', ') }}
              <template v-if="lowStockItems.length > 5"> y {{ lowStockItems.length - 5 }} más…</template>
            </span>
          </div>
        </div>

        <!-- Barra de búsqueda y toggle de vista -->
        <div class="catalog-search-bar">
          <input
            v-model="catalogSearch"
            class="catalog-search-input"
            type="text"
            placeholder="Buscar por nombre, código o SKU…"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          />
          <div class="view-toggle">
            <button type="button" :class="{ on: viewMode === 'grid' }" @click="viewMode = 'grid'" title="Vista cuadrícula">▦</button>
            <button type="button" :class="{ on: viewMode === 'list' }" @click="viewMode = 'list'" title="Vista lista">☰</button>
          </div>
        </div>

        <div class="manage-body">
          <aside class="cats-rail">
            <button
              v-for="menu in menus"
              :key="menu.id"
              type="button"
              class="cat"
              :class="{ on: selectedMenuId === menu.id }"
              @click="loadMenuProducts(menu.id)"
            >{{ menu.name }}</button>
            <button type="button" class="cat add" @click="showMenuForm = true">+ Categoría</button>
          </aside>

          <section class="grid-pane">
            <button type="button" class="magic-open" @click="showMagic = true">
              <span class="magic-title">Actualizar precios</span>
              <span class="magic-sub">Foto de lista o de la nota del proveedor</span>
            </button>

            <!-- Vista de cuadrícula (grid) -->
            <div v-if="viewMode === 'grid'" class="products">
              <button
                v-for="producto in filteredProducts"
                :key="producto.id"
                type="button"
                class="prod"
                @click="editFood(producto)"
              >
                <div class="thumb" :class="{ empty: !producto.imgUrl }">
                  <img v-if="producto.imgUrl" :src="producto.imgUrl" :alt="producto.name" loading="lazy" />
                  <span v-else class="thumb-letter">{{ initial(producto.name) }}</span>
                </div>
                <div class="prod-meta">
                  <span class="pname">{{ producto.name }}</span>
                  <span class="psku">{{ producto.barcode || producto.sku || 'Sin código' }} · {{ producto.priceIncludesTax ? 'Bruto' : 'Neto' }}</span>
                  <span v-if="inventoryOn" class="pstock" :class="{ low: Number(producto.stock || 0) <= Number(producto.lowStockThreshold || 5) }">
                    Stock {{ Number(producto.stock) || 0 }}
                  </span>
                  <span class="price">{{ money(producto.price) }}</span>
                  <span v-if="Number(producto.cost)" class="pcost">
                    Costo {{ money(producto.cost) }} · Margen {{ money(producto.price - producto.cost) }}
                  </span>
                </div>
              </button>
              <div v-if="!filteredProducts.length && catalogSearch" class="empty-box">
                <p class="empty">No se encontraron productos con "{{ catalogSearch }}".</p>
              </div>
              <div v-if="!productos.length && !catalogSearch" class="empty-box">
                <p class="empty">
                  {{ menus.length ? "Esta categoría está vacía." : "Aún no hay catálogo." }}
                  Crea una categoría o carga 8 productos de ejemplo para probar la caja.
                </p>
                <button
                  v-if="!menus.length"
                  type="button"
                  class="add-food"
                  :disabled="seeding"
                  @click="seedStarter"
                >{{ seeding ? "Cargando…" : "Cargar 8 productos de ejemplo" }}</button>
                <p v-if="seedErr" class="empty">{{ seedErr }}</p>
              </div>
              <button
                v-if="selectedMenuId"
                type="button"
                class="add-food"
                @click="openNewFood"
              >+ Agregar a mano</button>
            </div>

            <!-- Vista de lista (tabla) -->
            <div v-else class="products-list-wrap">
              <table class="products-list-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Precio</th>
                    <th>Costo</th>
                    <th>Margen</th>
                    <th>Stock</th>
                    <th>Categoría</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="producto in filteredProducts"
                    :key="producto.id"
                    class="list-row"
                    @click="editFood(producto)"
                  >
                    <td class="list-name">{{ producto.name }}</td>
                    <td>{{ money(producto.price) }}</td>
                    <td>{{ Number(producto.cost) ? money(producto.cost) : '—' }}</td>
                    <td>{{ Number(producto.cost) ? money(producto.price - producto.cost) : '—' }}</td>
                    <td :class="{ 'low-text': Number(producto.stock || 0) <= Number(producto.lowStockThreshold || 5) }">
                      {{ Number(producto.stock) || 0 }}
                    </td>
                    <td class="list-cat">{{ menus.find(m => m.id === producto.menuId)?.name || '—' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="!filteredProducts.length && catalogSearch" class="empty">No se encontraron productos con "{{ catalogSearch }}".</p>
              <p v-if="!productos.length && !catalogSearch" class="empty">Sin productos en esta categoría.</p>
              <button
                v-if="selectedMenuId"
                type="button"
                class="add-food"
                @click="openNewFood"
              >+ Agregar a mano</button>
            </div>
          </section>
        </div>
      </template>

      <!-- Precio F4 -->
      <Teleport to="body">
        <div v-if="showPriceCheck" class="sheet-bg" @click.self="closePriceCheck">
          <form class="sheet" @submit.prevent="runPriceCheck">
            <h3>Consulta de precio</h3>
            <p class="sheet-hint">Escanea o escribe el código (F4)</p>
            <input
              ref="priceInput"
              v-model="priceCode"
              class="inp"
              placeholder="Código de barras"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              autofocus
              @keydown.enter.prevent="runPriceCheck"
            />
            <div v-if="priceResult" class="price-card">
              <strong>{{ priceResult.name }}</strong>
              <span>{{ money(priceResult.price) }}</span>
              <em v-if="inventoryOn">
                Stock {{ Number(priceResult.stock) || 0 }}
              </em>
            </div>
            <p v-if="priceErr" class="scan-msg err">{{ priceErr }}</p>
            <button type="submit" class="act primary">Consultar</button>
            <button type="button" class="act" @click="closePriceCheck">Cerrar</button>
          </form>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="missingCode" class="sheet-bg" @click.self="dismissMissing">
          <div class="sheet" role="dialog" aria-labelledby="missing-title">
            <h3 id="missing-title">No está en el catálogo</h3>
            <p class="sheet-hint">
              El código <strong>{{ missingCode }}</strong> no existe.
              Agrégalo para poder venderlo.
            </p>
            <button type="button" class="act primary" @click="startAddMissing">Agregar producto</button>
            <button type="button" class="act" @click="dismissMissing">Ahora no</button>
          </div>
        </div>
      </Teleport>

      <!-- Descuento F9 -->
      <Teleport to="body">
        <div v-if="showDiscount" class="sheet-bg" @click.self="showDiscount = false">
          <form class="sheet" @submit.prevent="applyDiscount">
            <h3>Descuento del ticket</h3>
            <label class="field">
              <span>Porcentaje (0–100)</span>
              <input v-model.number="discountDraft" class="inp" type="number" min="0" max="100" step="1" />
            </label>
            <button type="submit" class="act primary">Aplicar</button>
            <button type="button" class="act" @click="clearDiscount">Quitar descuento</button>
          </form>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="showMenuForm" class="sheet-bg" @click.self="cancelMenuForm">
          <form class="sheet" @submit.prevent="createMenu">
            <h3>Nueva categoría</h3>
            <input v-model="menuForm.name" class="inp" placeholder="Nombre" required />
            <input v-model="menuForm.description" class="inp" placeholder="Descripción" />
            <button type="submit" class="act primary">Crear</button>
            <button type="button" class="act" @click="cancelMenuForm">Cancelar</button>
          </form>
        </div>
      </Teleport>

      <MagicPricesSheet
        v-if="showMagic"
        :menus="menus"
        :default-menu-id="selectedMenuId"
        @close="showMagic = false"
        @applied="onMagicApplied"
        @manual="onMagicManual"
      />

      <!-- Modal de pago / cobro -->
      <Teleport to="body">
        <div v-if="showPayment" class="sheet-bg" @click.self="closePayment">
          <div class="sheet pay-sheet">
            <h3>Cobrar venta</h3>

            <div class="pay-summary">
              <div class="pay-summary-row">
                <span>Subtotal</span>
                <strong>{{ money(subtotalAfterDiscount) }}</strong>
              </div>
              <div class="pay-summary-row">
                <span>IVA ({{ Math.round((Number(venueStore?.taxRate) || 0.16) * 100) }}%)</span>
                <strong>{{ money(tax) }}</strong>
              </div>
              <div class="pay-summary-row pay-total-row">
                <span>Total a pagar</span>
                <strong>{{ money(total) }}</strong>
              </div>
            </div>

            <template v-if="!cashOpen">
              <p class="pay-hint">Abre la caja aquí para cobrar. No te vamos a mandar a otra pantalla.</p>
              <label class="field">
                <span>Efectivo inicial</span>
                <input
                  v-model.number="openingFloat"
                  class="inp pay-inp"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="decimal"
                />
              </label>
              <p v-if="payError" class="scan-msg err">{{ payError }}</p>
              <button type="button" class="act primary pay-confirm" :disabled="cashBusy" @click="openCashFromPay">
                {{ cashBusy ? 'Abriendo…' : 'Abrir caja y cobrar' }}
              </button>
              <button type="button" class="act" @click="closePayment">Cancelar</button>
            </template>

            <template v-else>
              <div class="pay-methods">
                <label class="pay-method-card" :class="{ on: payMethod === 'cash' }">
                  <input v-model="payMethod" type="radio" value="cash" />
                  <span>💵 Efectivo</span>
                </label>
                <label class="pay-method-card" :class="{ on: payMethod === 'card' }">
                  <input v-model="payMethod" type="radio" value="card" />
                  <span>💳 Tarjeta</span>
                </label>
                <label class="pay-method-card" :class="{ on: payMethod === 'split' }">
                  <input v-model="payMethod" type="radio" value="split" />
                  <span>🔀 Mixto</span>
                </label>
              </div>

              <template v-if="payMethod === 'cash'">
                <label class="field">
                  <span>Efectivo recibido</span>
                  <input v-model.number="payCashReceived" class="inp pay-inp" type="number" min="0" step="0.01" placeholder="0.00" />
                </label>
                <div v-if="payChange > 0" class="pay-change">
                  Cambio: <strong>{{ money(payChange) }}</strong>
                </div>
              </template>

              <template v-if="payMethod === 'split'">
                <label class="field">
                  <span>Monto con tarjeta</span>
                  <input v-model.number="payCardAmount" class="inp pay-inp" type="number" min="0" :max="total" step="0.01" placeholder="0.00" />
                </label>
                <div class="pay-split-info">
                  Efectivo: <strong>{{ money(payCashPortion) }}</strong>
                </div>
                <label class="field">
                  <span>Efectivo recibido</span>
                  <input v-model.number="payCashReceived" class="inp pay-inp" type="number" min="0" step="0.01" placeholder="0.00" />
                </label>
                <div v-if="payChange > 0" class="pay-change">
                  Cambio: <strong>{{ money(payChange) }}</strong>
                </div>
              </template>

              <p v-if="payError" class="scan-msg err">{{ payError }}</p>

              <button type="button" class="act primary pay-confirm" :disabled="sending" @click="confirmPayment">
                {{ sending ? 'Cobrando…' : 'Confirmar cobro' }}
              </button>
              <button type="button" class="act" @click="closePayment">Cancelar</button>
            </template>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="showFoodForm" class="sheet-bg product-modal" @click.self="closeFoodForm">
          <form class="sheet product-sheet" @submit.prevent="createFood">
            <div class="product-banner">
              <img
                v-if="foodForm.imgUrl"
                :key="foodForm.imgUrl"
                :src="foodForm.imgUrl"
                alt=""
                @error="$event.target.style.display = 'none'"
              />
              <div class="banner-shade"></div>
              <button type="button" class="sheet-x" aria-label="Cerrar" @click="closeFoodForm">×</button>
              <div class="banner-copy">
                <p class="sheet-kicker">Catálogo</p>
                <h3>{{ editingFood ? "Editar producto" : "Nuevo producto" }}</h3>
              </div>
              <label class="banner-url">
                <input v-model="foodForm.imgUrl" type="url" placeholder="Pega aquí el link de la foto" />
              </label>
            </div>

            <div class="product-body">
              <label class="field wide">
                <span>Nombre</span>
                <input v-model="foodForm.name" class="inp" placeholder="Coca-Cola 600 ml" required />
              </label>

              <label class="field">
                <span>Precio</span>
                <input v-model.number="foodForm.price" class="inp" type="number" min="0" step="0.01" required />
              </label>
              <label class="field">
                <span>Costo</span>
                <input v-model.number="foodForm.cost" class="inp" type="number" min="0" step="0.01" placeholder="0.00" />
              </label>
              <label v-if="inventoryOn" class="field">
                <span>Existencias</span>
                <input v-model.number="foodForm.stock" class="inp" type="number" min="0" step="1" />
              </label>
              <label v-if="inventoryOn" class="field">
                <span>Stock mínimo</span>
                <input v-model.number="foodForm.lowStockThreshold" class="inp" type="number" min="0" step="1" placeholder="5" />
              </label>
              <label v-if="!inventoryOn" class="field">
                <span>Código de barras</span>
                <input v-model="foodForm.barcode" class="inp" placeholder="Escanea o escribe" autocomplete="off" data-scan="barcode" />
              </label>

              <div class="iva-choice wide">
                <p class="iva-q">¿Este precio ya incluye IVA?</p>
                <label class="iva-card" :class="{ on: foodForm.priceMode === 'gross' }">
                  <input v-model="foodForm.priceMode" type="radio" value="gross" />
                  <span>
                    <strong>Sí, ya lo incluye</strong>
                    <small>El cliente paga este precio</small>
                  </span>
                </label>
                <label class="iva-card" :class="{ on: foodForm.priceMode === 'net' }">
                  <input v-model="foodForm.priceMode" type="radio" value="net" />
                  <span>
                    <strong>No, hay que sumarle IVA</strong>
                    <small>Al cobrar se agrega el {{ Math.round(TAX_RATE * 100) }}%</small>
                  </span>
                </label>
                <p class="price-preview">El cliente paga {{ money(foodPricePreview.gross) }}</p>
              </div>

              <label v-if="inventoryOn" class="field">
                <span>Código de barras</span>
                <input v-model="foodForm.barcode" class="inp" placeholder="Escanea o escribe" autocomplete="off" data-scan="barcode" />
              </label>
              <label class="field" :class="{ wide: !inventoryOn }">
                <span>Descripción</span>
                <input v-model="foodForm.description" class="inp" placeholder="Opcional" />
              </label>
              <p v-if="foodError" class="scan-msg err wide">{{ foodError }}</p>
            </div>

            <footer class="product-foot" :class="{ editing: editingFood }">
              <div class="sheet-actions">
                <button type="button" class="act" @click="closeFoodForm">Cancelar</button>
                <button type="submit" class="act primary">Guardar producto</button>
              </div>
              <button v-if="editingFood" type="button" class="delete-link" @click="deleteFood">
                Eliminar este producto
              </button>
            </footer>
          </form>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script>
import AppShell from "../components/AppShell.vue";
import MagicPricesSheet from "../components/MagicPricesSheet.vue";
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiService } from "../apiService";
import { store } from "../store";
import { venueStore, fetchVenueSettings } from "../venueStore";
import { cartTotals, lineBreakdown } from "../tax";
import { apiService as apiSvc } from "../apiService";

export default {
  components: { AppShell, MagicPricesSheet },
  props: {
    initialMode: { type: String, default: "pos" },
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const menus = ref([]);
    const productos = ref([]);
    const selectedMenuId = ref("");
    const seeding = ref(false);
    const seedErr = ref("");
    const mode = ref(props.initialMode === "manage" || route.name === "products" ? "manage" : "pos");

    const scanInput = ref(null);
    const priceInput = ref(null);
    const scanCode = ref("");
    const scanError = ref("");
    const scanFlash = ref(false);
    const lastAdded = ref(null);
    const nameHits = ref([]);
    const scanning = ref(false);
    const selectedIdx = ref(-1);
    const sending = ref(false);
    const msg = ref("");
    const ticketPage = ref(0);
    const PAGE_SIZE = 7;

    const ticketDiscount = ref(0);
    const showDiscount = ref(false);
    const discountDraft = ref(0);
    const showPriceCheck = ref(false);
    const priceCode = ref("");
    const priceResult = ref(null);
    const priceErr = ref("");
    const missingCode = ref("");
    const missingIntent = ref("sale");
    const addAfterSave = ref(false);
    const pendingIntent = ref("sale");
    const pendingBarcode = ref("");
    const foodError = ref("");

    const showMenuForm = ref(false);
    const showFoodForm = ref(false);
    const showMagic = ref(false);
    const editingFood = ref(null);
    const menuForm = reactive({ name: "", description: "" });
    const foodForm = reactive({
      name: "",
      price: 0,
      cost: 0,
      description: "",
      imgUrl: "",
      barcode: "",
      priceMode: "gross", // gross = el precio ya incluye IVA
      stock: 0,
      lowStockThreshold: 5,
    });

    // Búsqueda y vista de lista en modo catálogo
    const catalogSearch = ref("");
    const viewMode = ref("grid"); // "grid" o "list"
    const lowStockItems = ref([]);

    const inventoryOn = computed(() => Boolean(venueStore.inventoryEnabled));
    const TAX_RATE = computed(() => Number(venueStore.taxRate) || 0.16);

    // Estado del modal de pago
    const showPayment = ref(false);
    const payMethod = ref("cash"); // 'cash' | 'card' | 'split'
    const payCashReceived = ref(0);
    const payCardAmount = ref(0);
    const payError = ref("");
    const payChange = computed(() => {
      if (payMethod.value === "card") return 0;
      const cashPart = payMethod.value === "split"
        ? total.value - Number(payCardAmount.value || 0)
        : total.value;
      const received = Number(payCashReceived.value || 0);
      return Math.max(0, Number((received - cashPart).toFixed(2)));
    });
    const payCashPortion = computed(() => {
      if (payMethod.value === "card") return 0;
      if (payMethod.value === "split") return Math.max(0, total.value - Number(payCardAmount.value || 0));
      return total.value;
    });

    // Aviso de caja abierta mucho tiempo
    const cashSession = ref(null);
    const cashOpenWarning = ref(false);
    const cashOpen = computed(() => Boolean(cashSession.value));
    const openingFloat = ref(0);
    const cashBusy = ref(false);
    const lastTicketId = ref("");

    async function loadCashSession() {
      try {
        const data = await apiSvc.getCashSession();
        if (data.open && data.session) {
          cashSession.value = data.session;
          const opened = new Date(data.session.createdAt || data.session.openedAt);
          const hoursOpen = (Date.now() - opened.getTime()) / 3600000;
          cashOpenWarning.value = hoursOpen >= 12;
        } else {
          cashSession.value = null;
          cashOpenWarning.value = false;
        }
      } catch {
        cashSession.value = null;
        cashOpenWarning.value = false;
      }
    }

    async function openCashFromPay() {
      if (cashBusy.value) return;
      cashBusy.value = true;
      payError.value = "";
      try {
        await apiService.openCashSession(Number(openingFloat.value || 0));
        await loadCashSession();
      } catch (e) {
        payError.value = e.response?.data || "No se pudo abrir la caja.";
      } finally {
        cashBusy.value = false;
      }
    }

    function printReceipt(orderId) {
      if (!orderId) return;
      window.open(`/print/order/${orderId}?mode=receipt&autoprint=1`, "_blank", "noopener");
    }

    // Productos filtrados por la barra de búsqueda del catálogo
    const filteredProducts = computed(() => {
      const q = catalogSearch.value.trim().toLowerCase();
      if (!q) return productos.value;
      return productos.value.filter((p) => {
        const name = String(p.name || "").toLowerCase();
        const code = String(p.barcode || p.sku || "").toLowerCase();
        return name.includes(q) || code.includes(q);
      });
    });

    let flashTimer = null;
    let searchTimer = null;
    let priceTimer = null;
    let wedgeBuf = "";
    let wedgeLast = 0;
    let wedgeTimer = null;
    let wedgeArmed = false;
    let lastSaleCode = "";
    let lastSaleAt = 0;
    let lastPriceCode = "";
    let lastPriceAt = 0;

    const businessName = computed(() => venueStore.businessName || "Tienda");
    const lines = computed(() => store.platillosSeleccionados);
    const itemCount = computed(() =>
      lines.value.reduce((s, p) => s + Number(p.quantity || 0), 0)
    );
    const totals = computed(() =>
      cartTotals(lines.value, {
        discountPercent: ticketDiscount.value,
        taxRate: TAX_RATE.value,
      })
    );
    const tax = computed(() => totals.value.tax);
    const total = computed(() => totals.value.total);
    const subtotalAfterDiscount = computed(() => totals.value.total - totals.value.tax);

    const foodPricePreview = computed(() => {
      const p = Number(foodForm.price) || 0;
      const rate = TAX_RATE.value;
      if (foodForm.priceMode === "gross") {
        const net = rate > 0 ? p / (1 + rate) : p;
        return { net, tax: p - net, gross: p };
      }
      return { net: p, tax: p * rate, gross: p * (1 + rate) };
    });

    function lineGross(line) {
      return lineBreakdown(line.price, line.quantity, line.priceIncludesTax, TAX_RATE.value).gross;
    }

    const displayLast = computed(() => {
      if (lastAdded.value) return lastAdded.value;
      if (selectedIdx.value >= 0 && lines.value[selectedIdx.value]) {
        return lines.value[selectedIdx.value];
      }
      return lines.value.length ? lines.value[lines.value.length - 1] : null;
    });

    const lastLineQty = computed(() => {
      if (!displayLast.value) return 0;
      const found = lines.value.find((l) => l.id === displayLast.value.id);
      return found ? found.quantity : 1;
    });
    const lastLineTotal = computed(() => {
      if (!displayLast.value) return 0;
      const found = lines.value.find((l) => l.id === displayLast.value.id);
      const qty = found ? found.quantity : 1;
      const gross = lineBreakdown(
        displayLast.value.price,
        qty,
        displayLast.value.priceIncludesTax,
        TAX_RATE.value
      ).gross;
      const d = Math.min(100, Math.max(0, Number(ticketDiscount.value) || 0));
      return gross * (1 - d / 100);
    });

    const pageCount = computed(() =>
      Math.max(1, Math.ceil(lines.value.length / PAGE_SIZE) || 1)
    );
    const pagedRows = computed(() => {
      const start = ticketPage.value * PAGE_SIZE;
      return lines.value.slice(start, start + PAGE_SIZE).map((line, offset) => ({
        line,
        i: start + offset,
      }));
    });

    watch(selectedIdx, (i) => {
      if (i >= 0) ticketPage.value = Math.floor(i / PAGE_SIZE);
    });

    watch(
      () => lines.value.length,
      () => {
        const maxPage = Math.max(0, pageCount.value - 1);
        if (ticketPage.value > maxPage) ticketPage.value = maxPage;
      }
    );

    function money(n) {
      return Number(n || 0).toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    function formatQty(n) {
      const v = Number(n || 0);
      return Number.isInteger(v) ? String(v) : v.toFixed(3);
    }
    function initial(name) {
      return String(name || "?").trim().charAt(0).toUpperCase();
    }

    function focusScan() {
      nextTick(() => {
        const blocked =
          showPriceCheck.value ||
          showDiscount.value ||
          showFoodForm.value ||
          showMenuForm.value ||
          showMagic.value ||
          showPayment.value ||
          missingCode.value;
        if (mode.value === "pos" && !blocked && scanInput.value) {
          scanInput.value.focus();
        }
      });
    }

    function isCodeQuery(value) {
      return /^\d{6,}$/.test(String(value || "").trim());
    }

    function isScannerPayload(value) {
      const text = String(value || "").trim();
      if (/^\d{4,}$/.test(text)) return true;
      const digits = (text.match(/\d/g) || []).length;
      return text.length >= 8 && digits >= 4 && /^[0-9A-Za-z-]+$/.test(text);
    }

    let muteScanWatchUntil = 0;

    function clearScanField() {
      muteScanWatchUntil = Date.now() + 400;
      scanCode.value = "";
      if (scanInput.value) scanInput.value.value = "";
    }

    function askToAdd(code, intent) {
      missingCode.value = code;
      missingIntent.value = intent;
      scanError.value = "";
      if (intent === "price") {
        priceErr.value = "Producto no encontrado";
        priceCode.value = "";
        if (priceInput.value) priceInput.value.value = "";
        lastPriceCode = "";
      }
    }

    function dismissMissing() {
      missingCode.value = "";
      focusScan();
    }

    function startAddMissing() {
      const code = missingCode.value;
      const intent = missingIntent.value;
      missingCode.value = "";
      openNewFood();
      addAfterSave.value = true;
      pendingIntent.value = intent;
      pendingBarcode.value = code;
      nextTick(() => {
        foodForm.barcode = code;
      });
    }

    function cancelMenuForm() {
      showMenuForm.value = false;
      if (!showFoodForm.value) {
        pendingBarcode.value = "";
        addAfterSave.value = false;
      }
    }

    function goMode(next) {
      mode.value = next;
      scanCode.value = "";
      scanError.value = "";
      nameHits.value = [];
      router.push(next === "manage" ? "/products" : "/pos");
      if (next === "pos") focusScan();
    }

    function addProduct(producto) {
      const idx = store.platillosSeleccionados.findIndex((p) => p.id === producto.id);
      if (idx >= 0) {
        store.platillosSeleccionados[idx].quantity += 1;
        selectedIdx.value = idx;
      } else {
        store.platillosSeleccionados.push({ ...producto, quantity: 1 });
        selectedIdx.value = store.platillosSeleccionados.length - 1;
      }
      lastAdded.value = producto;
      scanError.value = "";
      nameHits.value = [];
      scanFlash.value = true;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        scanFlash.value = false;
      }, 220);
      scanCode.value = "";
      focusScan();
    }

    let queuedCode = "";

    async function applyScannedCode(raw) {
      const code = String(raw || "").trim();
      if (!code || mode.value !== "pos") return;
      if (showFoodForm.value || showMenuForm.value || showDiscount.value || showMagic.value) return;
      if (code === lastSaleCode && Date.now() - lastSaleAt < 450) return;
      if (scanning.value) {
        queuedCode = code;
        return;
      }
      lastSaleCode = code;
      lastSaleAt = Date.now();
      missingCode.value = "";
      scanning.value = true;
      scanError.value = "";
      nameHits.value = [];
      const asCode = isCodeQuery(code) || isScannerPayload(code);
      if (asCode) clearScanField();
      try {
        const res = await apiService.lookupFood(code);
        if (res && res.id) {
          addProduct(res);
          return;
        }
        const matches = Array.isArray(res?.matches) ? res.matches : [];
        if (matches.length === 1) {
          addProduct(matches[0]);
          return;
        }
        if (matches.length > 1) {
          scanCode.value = code;
          nameHits.value = matches;
          scanError.value = `${matches.length} coincidencias — elige una`;
          return;
        }
        clearScanField();
        askToAdd(code, "sale");
      } catch {
        scanError.value = "Error al buscar producto";
        lastSaleCode = "";
      } finally {
        scanning.value = false;
        const next = queuedCode;
        queuedCode = "";
        if (next && next !== code) applyScannedCode(next);
        else if (!missingCode.value && !nameHits.value.length) focusScan();
      }
    }

    function onScanEnter() {
      const typed = String(scanInput.value?.value || scanCode.value || "").trim();
      scanCode.value = typed;
      applyScannedCode(typed);
    }

    watch(scanCode, (val) => {
      if (Date.now() < muteScanWatchUntil) return;
      clearTimeout(searchTimer);
      const q = String(val || "").trim();
      if (!q || mode.value !== "pos") {
        if (!q) nameHits.value = [];
        return;
      }
      if (isCodeQuery(q)) {
        searchTimer = setTimeout(() => {
          if (String(scanCode.value || "").trim() !== q) return;
          if (nameHits.value.length && lastSaleCode === q) return;
          applyScannedCode(q);
        }, 280);
        return;
      }
      if (q.length < 2) return;
      searchTimer = setTimeout(async () => {
        if (String(scanCode.value || "").trim() !== q) return;
        try {
          const res = await apiService.lookupFood(q);
          if (String(scanCode.value || "").trim() !== q) return;
          if (res?.id) nameHits.value = [res];
          else nameHits.value = Array.isArray(res?.matches) ? res.matches : [];
        } catch {
          nameHits.value = [];
        }
      }, 220);
    });

    function bumpQty(i, delta) {
      const line = store.platillosSeleccionados[i];
      if (!line) return;
      const next = Number(line.quantity) + delta;
      if (next <= 0) removeAt(i);
      else line.quantity = next;
      selectedIdx.value = Math.min(i, store.platillosSeleccionados.length - 1);
      focusScan();
    }

    function removeAt(i) {
      store.platillosSeleccionados.splice(i, 1);
      if (!store.platillosSeleccionados.length) selectedIdx.value = -1;
      else selectedIdx.value = Math.min(i, store.platillosSeleccionados.length - 1);
      focusScan();
    }

    function removeSelected() {
      if (selectedIdx.value < 0) return;
      removeAt(selectedIdx.value);
    }

    function clearCart() {
      if (lines.value.length && !window.confirm("¿Vaciar el carrito? Se perderán todos los productos agregados.")) return;
      store.platillosSeleccionados.splice(0, store.platillosSeleccionados.length);
      selectedIdx.value = -1;
      lastAdded.value = null;
      ticketDiscount.value = 0;
      focusScan();
    }

    function applyDiscount() {
      ticketDiscount.value = Math.min(100, Math.max(0, Number(discountDraft.value) || 0));
      showDiscount.value = false;
      focusScan();
    }
    function clearDiscount() {
      ticketDiscount.value = 0;
      discountDraft.value = 0;
      showDiscount.value = false;
      focusScan();
    }

    function closePriceCheck() {
      showPriceCheck.value = false;
      priceCode.value = "";
      priceResult.value = null;
      priceErr.value = "";
      focusScan();
    }

    async function runPriceCheck() {
      const dom = priceInput.value && document.activeElement === priceInput.value ? priceInput.value.value : "";
      const code = String(dom || priceCode.value || "").trim();
      if (!code) return;
      if (code === lastPriceCode && Date.now() - lastPriceAt < 500) return;
      lastPriceCode = code;
      lastPriceAt = Date.now();
      priceCode.value = code;
      priceErr.value = "";
      priceResult.value = null;
      try {
        const res = await apiService.lookupFood(code);
        if (res?.id) priceResult.value = res;
        else if (res?.matches?.length === 1) priceResult.value = res.matches[0];
        else if (res?.matches?.length > 1) priceErr.value = "Varias coincidencias — sé más específico";
        else askToAdd(code, "price");
      } catch {
        priceErr.value = "Error al consultar";
        lastPriceCode = "";
      }
    }

    watch(priceCode, (val) => {
      clearTimeout(priceTimer);
      const q = String(val || "").trim();
      if (!showPriceCheck.value || !isCodeQuery(q)) return;
      priceTimer = setTimeout(() => {
        if (String(priceCode.value || "").trim() !== q) return;
        runPriceCheck();
      }, 280);
    });

    function finalizeOrder() {
      if (!lines.value.length || sending.value) return;
      payMethod.value = "cash";
      payCashReceived.value = 0;
      payCardAmount.value = 0;
      payError.value = "";
      openingFloat.value = 0;
      showPayment.value = true;
      loadCashSession();
    }

    function closePayment() {
      showPayment.value = false;
      payError.value = "";
      focusScan();
    }

    async function confirmPayment() {
      if (!lines.value.length || sending.value) return;
      payError.value = "";

      if (!cashSession.value) {
        payError.value = "Abre la caja para cobrar.";
        return;
      }

      if (payMethod.value === "split") {
        const card = Number(payCardAmount.value || 0);
        if (card <= 0 || card >= total.value) {
          payError.value = "El monto de tarjeta debe ser mayor a 0 y menor al total";
          return;
        }
      }

      if (payMethod.value === "cash" || payMethod.value === "split") {
        const cashNeeded = payCashPortion.value;
        const received = Number(payCashReceived.value || 0);
        if (received > 0 && received < cashNeeded) {
          payError.value = `Efectivo insuficiente. Faltan ${money(cashNeeded - received)}`;
          return;
        }
      }

      sending.value = true;
      msg.value = "";
      try {
        const response = await apiService.createOrder({
          tableId: null,
          tableName: "Mostrador",
          modality: "retail",
          status: "pending",
          discountPercent: ticketDiscount.value || 0,
          taxRate: TAX_RATE.value,
          items: lines.value.map((p) => ({
            foodId: p.id,
            name: p.name,
            price: p.price,
            quantity: p.quantity,
            priceIncludesTax: Boolean(p.priceIncludesTax),
          })),
        });

        await apiService.payOrder(response.id, payMethod.value, {
          cashReceived: payMethod.value !== "card" ? Number(payCashReceived.value || 0) : undefined,
          cardAmount: payMethod.value === "split" ? Number(payCardAmount.value || 0) : undefined,
        });

        const cambio = payChange.value;
        lastTicketId.value = response.id;
        showPayment.value = false;
        clearCart();
        msg.value = cambio > 0
          ? `Ticket ${String(response.id || "").slice(-6).toUpperCase()} cobrado · Cambio: ${money(cambio)}`
          : `Ticket ${String(response.id || "").slice(-6).toUpperCase()} cobrado`;
        printReceipt(response.id);
      } catch (error) {
        payError.value = error.response?.data || "Error al registrar la venta.";
      } finally {
        sending.value = false;
      }
    }

    function resetWedge() {
      clearTimeout(wedgeTimer);
      wedgeBuf = "";
      wedgeArmed = false;
    }

    function fieldOf(el) {
      if (!el || !el.tagName) return "";
      if (el === scanInput.value) return "scan";
      if (el === priceInput.value) return "price";
      if (el.dataset && el.dataset.scan === "barcode") return "barcode";
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return "other";
      return "";
    }

    function commitWedge(code) {
      const clean = String(code || "").trim();
      resetWedge();
      if (!isScannerPayload(clean)) return;
      if (showFoodForm.value || fieldOf(document.activeElement) === "barcode") {
        foodForm.barcode = clean;
        return;
      }
      if (showMenuForm.value || showDiscount.value || showMagic.value) return;
      if (showPriceCheck.value) {
        priceCode.value = clean;
        if (priceInput.value) priceInput.value.value = clean;
        runPriceCheck();
        return;
      }
      clearScanField();
      applyScannedCode(clean);
    }

    function captureWedge(e) {
      if (mode.value !== "pos") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") {
        resetWedge();
        return;
      }

      const field = fieldOf(e.target);
      if (e.key === "Enter" || e.key === "NumpadEnter" || e.key === "Tab") {
        const code = wedgeBuf.trim();
        const wasScan = wedgeArmed && isScannerPayload(code);
        if (wasScan) {
          e.preventDefault();
          e.stopPropagation();
          commitWedge(code);
          return;
        }
        resetWedge();
        if (e.key === "Tab") return;
        if (field === "scan") {
          e.preventDefault();
          const typed = String(scanInput.value?.value || scanCode.value || "").trim();
          applyScannedCode(typed);
          return;
        }
        if (field === "price") {
          e.preventDefault();
          const typed = String(priceInput.value?.value || priceCode.value || "").trim();
          priceCode.value = typed;
          runPriceCheck();
        }
        return;
      }

      if (e.key.length !== 1) return;

      const now = performance.now();
      const gap = wedgeLast ? now - wedgeLast : 999;
      wedgeLast = now;
      if (gap > 40) {
        wedgeBuf = "";
        wedgeArmed = false;
      }
      wedgeBuf += e.key;
      if (gap <= 40 && wedgeBuf.length >= 2) wedgeArmed = true;
      if (wedgeArmed && field === "other") e.preventDefault();

      clearTimeout(wedgeTimer);
      wedgeTimer = setTimeout(() => {
        if (wedgeArmed && isScannerPayload(wedgeBuf)) commitWedge(wedgeBuf);
        else {
          wedgeBuf = "";
          wedgeArmed = false;
        }
      }, 50);
    }

    function onHotkey(e) {
      captureWedge(e);
      if (e.defaultPrevented) return;
      if (mode.value !== "pos") return;
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "F2") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "F4") {
        e.preventDefault();
        showPriceCheck.value = true;
        nextTick(() => priceInput.value?.focus());
      } else if (e.key === "F9") {
        e.preventDefault();
        discountDraft.value = ticketDiscount.value;
        showDiscount.value = true;
      } else if (e.key === "F12") {
        e.preventDefault();
        finalizeOrder();
      } else if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeSelected();
      } else if (!typing && e.key === "ArrowUp") {
        e.preventDefault();
        if (lines.value.length) {
          selectedIdx.value = selectedIdx.value <= 0 ? lines.value.length - 1 : selectedIdx.value - 1;
        }
      } else if (!typing && e.key === "ArrowDown") {
        e.preventDefault();
        if (lines.value.length) {
          selectedIdx.value = (selectedIdx.value + 1) % lines.value.length;
        }
      }
    }

    async function seedStarter() {
      seeding.value = true;
      seedErr.value = "";
      try {
        await apiService.seedStarterCatalog();
        await fetchMenus();
      } catch (error) {
        const raw = error.response?.data;
        seedErr.value = typeof raw === "string" ? raw : raw?.message || "No se pudo cargar el ejemplo.";
      } finally {
        seeding.value = false;
      }
    }

    async function fetchLowStock() {
      try {
        lowStockItems.value = (await apiService.getLowStockFoods()) || [];
      } catch {
        lowStockItems.value = [];
      }
    }

    async function fetchMenus() {
      try {
        menus.value = (await apiService.getAllMenus()) || [];
        if (mode.value === "manage" && menus.value[0]) loadMenuProducts(menus.value[0].id);
      } catch {
        menus.value = [];
      }
      fetchLowStock();
    }

    async function loadMenuProducts(menuId) {
      selectedMenuId.value = menuId;
      try {
        const menu = await apiService.getMenuById(menuId);
        productos.value = Array.isArray(menu.foods) ? menu.foods : [];
      } catch {
        productos.value = [];
      }
    }

    async function createMenu() {
      const created = await apiService.createMenu({ ...menuForm });
      menus.value.push(created);
      menuForm.name = "";
      menuForm.description = "";
      showMenuForm.value = false;
      selectedMenuId.value = created.id;
      if (pendingBarcode.value) {
        showFoodForm.value = true;
        const code = pendingBarcode.value;
        nextTick(() => {
          foodForm.barcode = code;
        });
        return;
      }
      loadMenuProducts(created.id);
    }

    function editFood(producto) {
      editingFood.value = producto;
      foodForm.name = producto.name;
      foodForm.price = producto.price;
      foodForm.cost = Number(producto.cost) || 0;
      foodForm.description = producto.description || "";
      foodForm.imgUrl = producto.imgUrl || "";
      foodForm.barcode = producto.barcode || producto.sku || "";
      foodForm.priceMode = producto.priceIncludesTax ? "gross" : "net";
      foodForm.stock = Number(producto.stock) || 0;
      foodForm.lowStockThreshold = producto.lowStockThreshold != null ? Number(producto.lowStockThreshold) : 5;
      showFoodForm.value = true;
    }

    function openNewFood() {
      closeFoodForm();
      if (!selectedMenuId.value && menus.value[0]) {
        selectedMenuId.value = menus.value[0].id;
      }
      if (!selectedMenuId.value) {
        showMenuForm.value = true;
        return;
      }
      showFoodForm.value = true;
    }

    function onMagicManual() {
      showMagic.value = false;
      openNewFood();
    }

    async function onMagicApplied() {
      await fetchVenueSettings().catch(() => {});
      if (selectedMenuId.value) await loadMenuProducts(selectedMenuId.value);
    }

    function closeFoodForm() {
      showFoodForm.value = false;
      editingFood.value = null;
      foodForm.name = "";
      foodForm.price = 0;
      foodForm.cost = 0;
      foodForm.description = "";
      foodForm.imgUrl = "";
      foodForm.barcode = "";
      foodForm.priceMode = "gross";
      foodForm.stock = 0;
      foodForm.lowStockThreshold = 5;
      foodError.value = "";
      addAfterSave.value = false;
      pendingBarcode.value = "";
      pendingIntent.value = "sale";
    }

    async function createFood() {
      foodError.value = "";
      const shouldAdd = addAfterSave.value;
      const intent = pendingIntent.value;
      const payload = {
        name: foodForm.name,
        price: foodForm.price,
        cost: Number(foodForm.cost) || 0,
        description: foodForm.description,
        imgUrl: (foodForm.imgUrl || "").trim(),
        barcode: (foodForm.barcode || "").trim(),
        sku: (foodForm.barcode || "").trim(),
        priceIncludesTax: foodForm.priceMode === "gross",
        menuId: selectedMenuId.value,
        stock: Number(foodForm.stock) || 0,
        lowStockThreshold: Number(foodForm.lowStockThreshold) || 5,
      };
      try {
        let saved;
        if (editingFood.value) {
          saved = await apiService.editFood(editingFood.value.id, payload);
          const idx = productos.value.findIndex((p) => p.id === saved.id);
          if (idx >= 0) productos.value[idx] = saved;
        } else {
          saved = await apiService.createFood(payload);
          productos.value.push(saved);
        }
        closeFoodForm();
        if (shouldAdd && saved?.id) {
          if (intent === "price") {
            showPriceCheck.value = true;
            priceErr.value = "";
            priceResult.value = saved;
            priceCode.value = saved.barcode || saved.sku || "";
            lastPriceCode = priceCode.value;
            lastPriceAt = Date.now();
          } else {
            addProduct(saved);
          }
        }
      } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        foodError.value =
          (typeof data === "object" && data?.message) ||
          (typeof data === "string" && data) ||
          (status === 403
            ? "No tienes permiso para agregar productos. Pide a un administrador que lo registre."
            : "No se pudo guardar el producto");
      }
    }

    async function deleteFood() {
      if (!editingFood.value) return;
      const name = editingFood.value.name || "este producto";
      if (!window.confirm(`¿Seguro que quieres quitar “${name}” del catálogo?`)) return;
      await apiService.deleteFood(editingFood.value.id);
      productos.value = productos.value.filter((p) => p.id !== editingFood.value.id);
      closeFoodForm();
    }

    watch(
      () => route.name,
      (name) => {
        mode.value = name === "products" ? "manage" : "pos";
        if (mode.value === "pos") focusScan();
        else if (menus.value[0] && !selectedMenuId.value) loadMenuProducts(menus.value[0].id);
      }
    );

    watch(showPriceCheck, (v) => {
      if (v) nextTick(() => priceInput.value?.focus());
    });

    onMounted(async () => {
      await fetchMenus();
      loadCashSession();
      focusScan();
      window.addEventListener("keydown", onHotkey);
      window.addEventListener("focus", focusScan);
    });

    onUnmounted(() => {
      window.removeEventListener("keydown", onHotkey);
      window.removeEventListener("focus", focusScan);
      clearTimeout(flashTimer);
      clearTimeout(searchTimer);
      clearTimeout(priceTimer);
      clearTimeout(wedgeTimer);
    });

    return {
      mode,
      menus,
      productos,
      selectedMenuId,
      seeding,
      seedErr,
      seedStarter,
      businessName,
      scanInput,
      priceInput,
      scanCode,
      scanError,
      scanFlash,
      lastAdded,
      displayLast,
      nameHits,
      lines,
      itemCount,
      totals,
      subtotalAfterDiscount,
      tax,
      total,
      selectedIdx,
      sending,
      msg,
      ticketDiscount,
      showDiscount,
      discountDraft,
      showPriceCheck,
      priceCode,
      priceResult,
      priceErr,
      missingCode,
      foodError,
      dismissMissing,
      startAddMissing,
      cancelMenuForm,
      showMenuForm,
      showFoodForm,
      showMagic,
      onMagicApplied,
      onMagicManual,
      openNewFood,
      menuForm,
      foodForm,
      foodPricePreview,
      editingFood,
      inventoryOn,
      catalogSearch,
      viewMode,
      lowStockItems,
      filteredProducts,
      lastLineQty,
      lastLineTotal,
      ticketPage,
      pageCount,
      pagedRows,
      goMode,
      onScanEnter,
      addProduct,
      bumpQty,
      removeAt,
      removeSelected,
      clearCart,
      finalizeOrder,
      applyDiscount,
      clearDiscount,
      closePriceCheck,
      runPriceCheck,
      loadMenuProducts,
      createMenu,
      createFood,
      editFood,
      closeFoodForm,
      deleteFood,
      lineGross,
      money,
      formatQty,
      initial,
      showPayment,
      payMethod,
      payCashReceived,
      payCardAmount,
      payChange,
      payError,
      payCashPortion,
      closePayment,
      confirmPayment,
      cashOpen,
      cashOpenWarning,
      cashSession,
      openingFloat,
      cashBusy,
      openCashFromPay,
      lastTicketId,
      venueStore,
    };
  },
};
</script>

<style scoped>
.pos {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--timber-surface);
  overflow: hidden;
}

/* —— Escritorio POS —— */
.desk {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--timber-panel);
  overflow: hidden;
}

.fkey-bar {
  display: flex;
  gap: 0.3rem;
  padding: 0.3rem 0.4rem;
  overflow-x: auto;
  background: var(--timber-topbar);
  border-bottom: 1px solid color-mix(in srgb, var(--timber-topbar-text) 12%, transparent);
  flex-shrink: 0;
}
.fkey {
  flex: 0 0 auto;
  min-width: 4.2rem;
  min-height: 2.55rem;
  padding: 0.25rem 0.45rem;
  border: 1px solid color-mix(in srgb, var(--timber-topbar-text) 18%, transparent);
  border-radius: 0.45rem;
  background: color-mix(in srgb, #fff 8%, transparent);
  color: var(--timber-topbar-text);
  display: grid;
  place-content: center;
  gap: 0.05rem;
  cursor: pointer;
  font: inherit;
}
.fkey:disabled { opacity: 0.35; cursor: not-allowed; }
.fkey .fk {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  opacity: 0.7;
}
.fkey .fl { font-size: 0.78rem; font-weight: 700; }
.fkey.accent {
  background: var(--timber-accent);
  color: #1a1208;
  border-color: transparent;
}
.fkey.ghost { opacity: 0.85; }

.status-bar {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.65rem 1rem;
  padding: 0.22rem 0.65rem;
  background: color-mix(in srgb, var(--timber-primary) 88%, #0a1a30);
  color: #dce8f6;
  font-size: 0.72rem;
  font-weight: 600;
  flex-shrink: 0;
  overflow: hidden;
}
.status-hint { margin-left: auto; opacity: 0.75; font-weight: 500; white-space: nowrap; }

.desk-top {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.4rem;
  padding: 0.4rem 0.5rem;
  background: var(--timber-surface);
  border-bottom: 1px solid var(--timber-line);
  flex-shrink: 0;
}

.scan-box {
  position: relative;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 0.6rem;
  padding: 0.4rem 0.55rem 0.45rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.scan-box.flash {
  border-color: var(--timber-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--timber-success) 22%, transparent);
}
.scan-box.err { border-color: var(--timber-danger); }
.scan-label {
  display: block;
  margin: 0 0 0.35rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.scan-input {
  width: 100%;
  min-height: 2.65rem;
  border: 2px solid var(--timber-ink);
  border-radius: 0.45rem;
  padding: 0.35rem 0.65rem;
  font: inherit;
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  box-sizing: border-box;
}
.scan-msg { margin: 0.25rem 0 0; font-size: 0.8rem; font-weight: 700; }
.scan-msg.ok { color: var(--timber-success); }
.scan-msg.err { color: var(--timber-danger); }

.hits {
  position: absolute;
  left: 0.4rem;
  right: 0.4rem;
  top: calc(100% - 0.15rem);
  z-index: 20;
  display: grid;
  gap: 0.25rem;
  max-height: 10rem;
  overflow: auto;
  padding: 0.35rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 0.55rem;
  box-shadow: var(--timber-shadow);
}
.hit {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  text-align: left;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.55rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 600;
  cursor: pointer;
}

.price-board {
  background: var(--timber-topbar);
  border-radius: 0.9rem;
  padding: 0.4rem;
  box-shadow: 0 8px 18px rgba(18, 48, 86, 0.16);
}
.board-screen {
  background: #0b1830;
  border-radius: 0.6rem;
  padding: 0.55rem 0.8rem 0.5rem;
  display: grid;
  gap: 0.2rem;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), inset 0 10px 24px rgba(0, 0, 0, 0.28);
}
.board-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}
.board-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--timber-accent);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.board-price {
  flex-shrink: 0;
  color: var(--timber-accent);
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.board-kicker {
  color: #8eb4e0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.board-num {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: clamp(1.9rem, 4.2vw, 2.7rem);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  line-height: 1;
  color: #5ec8ff;
  text-shadow: 0 0 14px rgba(94, 200, 255, 0.35);
}

.ticket-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  background: var(--timber-panel);
  position: relative;
  display: flex;
  flex-direction: column;
}
.ticket-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}
.ticket-table th {
  background: var(--timber-panel-elevated);
  border-bottom: 1px solid var(--timber-line);
  padding: 0.4rem 0.5rem;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.ticket-table td {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--timber-line);
  vertical-align: middle;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ticket-table tbody tr {
  cursor: pointer;
}
.ticket-table tbody tr.on {
  background: color-mix(in srgb, var(--timber-primary) 12%, transparent);
}
.ticket-table tbody tr:hover {
  background: color-mix(in srgb, var(--timber-primary) 6%, transparent);
}
.c-code {
  width: 18%;
  text-align: left;
  color: var(--timber-muted);
  font-size: 0.8rem;
}
.c-qty {
  width: 7.5rem;
  text-align: center;
}
.c-name {
  width: auto;
  text-align: left;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.01em;
  white-space: normal;
  line-height: 1.2;
}
.c-price,
.c-imp {
  width: 16%;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.c-imp { font-weight: 800; }
.c-act {
  width: 2.5rem;
  text-align: center;
}
.ticket-table th.c-qty,
.ticket-table th.c-price,
.ticket-table th.c-imp,
.ticket-table th.c-act { text-align: center; }
.ticket-table th.c-price,
.ticket-table th.c-imp { text-align: right; }
.ticket-table th.c-code,
.ticket-table th.c-name { text-align: left; }

.qty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  background: var(--timber-surface);
  border-radius: 0.45rem;
  padding: 0.1rem;
  margin: 0 auto;
}
.qty button {
  width: 1.85rem;
  height: 1.85rem;
  border: none;
  border-radius: 0.35rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-weight: 800;
  cursor: pointer;
}
.qty span { min-width: 1.6rem; text-align: center; font-weight: 800; }
.x {
  width: 1.85rem;
  height: 1.85rem;
  border: none;
  border-radius: 0.35rem;
  background: var(--timber-surface);
  color: var(--timber-muted);
  font-size: 1.1rem;
  cursor: pointer;
}
.ticket-empty a { color: var(--timber-primary); font-weight: 800; }
.ticket-empty {
  margin: auto;
  padding: 1rem;
  text-align: center;
  color: var(--timber-muted);
  font-size: 0.9rem;
}
.ticket-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.3rem;
  border-top: 1px solid var(--timber-line);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--timber-muted);
  flex-shrink: 0;
}
.ticket-pager button {
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.4rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 800;
  cursor: pointer;
}
.ticket-pager button:disabled { opacity: 0.35; }

.last-bar {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.4rem 0.55rem;
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  flex-shrink: 0;
  margin-top: auto;
}
.last-meta {
  flex: 1;
  min-width: 0;
}
.last-thumb {
  width: 2.8rem;
  height: 2.8rem;
  border-radius: 0.45rem;
  overflow: hidden;
  background: var(--timber-surface);
  display: grid;
  place-items: center;
  font-weight: 800;
  color: var(--timber-primary);
  font-size: 1rem;
  flex-shrink: 0;
}
.last-thumb img { width: 100%; height: 100%; object-fit: cover; }
.last-name {
  margin: 0;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--timber-success);
  font-size: 0.95rem;
  line-height: 1.2;
}
.last-math {
  margin: 0.15rem 0 0;
  font-weight: 700;
  color: var(--timber-accent);
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
}
.last-idle { margin: 0; color: var(--timber-muted); font-size: 0.88rem; }
.btn-cobrar {
  min-height: 2.85rem;
  min-width: 6.8rem;
  padding: 0 0.9rem;
  border: none;
  border-radius: 0.55rem;
  background: var(--timber-accent);
  color: #1a1208;
  font-weight: 800;
  font-size: 0.95rem;
  letter-spacing: 0.06em;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(224, 138, 30, 0.28);
  flex-shrink: 0;
}
.btn-cobrar:disabled { opacity: 0.45; cursor: not-allowed; }
.foot-msg {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--timber-success);
}
.ticket-reprint {
  margin-left: 0.45rem;
  color: var(--timber-primary);
  font-weight: 800;
}

.price-card {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.45rem 0.75rem;
  padding: 0.85rem 0.9rem;
  border-radius: 0.75rem;
  background: var(--timber-surface);
  border: 1px solid var(--timber-line);
}
.price-card strong { font-size: 1.05rem; }
.price-card span {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--timber-primary);
  font-variant-numeric: tabular-nums;
}
.price-card em {
  flex-basis: 100%;
  font-style: normal;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--timber-muted);
}

/* —— Catálogo —— */
.sell-toolbar {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  padding: 0.65rem 0.75rem;
  background: var(--timber-panel);
  border-bottom: 1px solid var(--timber-line);
  flex-shrink: 0;
}
.toolbar-title {
  margin: 0;
  flex: 1;
  font-family: var(--font-display);
  font-size: 1.2rem;
  font-weight: 700;
}
.toolbar-right {
  display: flex;
  background: var(--timber-surface);
  border-radius: 0.7rem;
  padding: 0.15rem;
  border: 1px solid var(--timber-line);
}
.seg {
  min-height: 2.6rem;
  padding: 0 0.9rem;
  border: none;
  border-radius: 0.55rem;
  background: transparent;
  color: var(--timber-muted);
  font-weight: 700;
  cursor: pointer;
}
.seg.on {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.manage-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}
.cats-rail {
  display: flex;
  gap: 0.4rem;
  overflow-x: auto;
  padding: 0.55rem 0.65rem;
  background: var(--timber-panel);
  border-bottom: 1px solid var(--timber-line);
}
.cat {
  flex: 0 0 auto;
  min-height: 2.75rem;
  padding: 0 0.95rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.65rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  white-space: nowrap;
}
.cat.on {
  background: var(--timber-ink);
  color: var(--timber-panel);
  border-color: transparent;
}
.cat.add {
  border-style: dashed;
  color: var(--timber-primary);
}
.grid-pane {
  min-height: 0;
  overflow: auto;
  padding: 0.55rem;
}
.magic-open {
  display: flex;
  flex-direction: column;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.05rem;
  min-height: 3.15rem;
  margin-bottom: 0.55rem;
  padding: 0.4rem 0.7rem;
  border: none;
  border-radius: 0.85rem;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  font: inherit;
  cursor: pointer;
}
.magic-title { font-weight: 800; font-size: 0.98rem; }
.magic-sub { font-weight: 700; font-size: 0.78rem; opacity: 0.88; }
.products {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 0.45rem;
}
.prod {
  border: 1px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  cursor: pointer;
  text-align: left;
  min-height: 8.2rem;
}
.thumb {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 0.6rem;
  overflow: hidden;
  background: var(--timber-surface);
  display: grid;
  place-items: center;
}
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb-letter {
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--timber-primary);
  opacity: 0.55;
}
.prod-meta { display: grid; gap: 0.1rem; padding: 0 0.15rem 0.15rem; }
.pname {
  font-weight: 700;
  font-size: 0.82rem;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.psku {
  font-size: 0.68rem;
  color: var(--timber-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pstock {
  font-size: 0.72rem;
  font-weight: 800;
  color: var(--timber-success);
  font-variant-numeric: tabular-nums;
}
.pstock.low { color: var(--timber-warning); }
.price {
  font-size: 1.05rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--timber-primary);
}
.empty { color: var(--timber-muted); grid-column: 1 / -1; margin: 1.5rem 0; text-align: center; }
.empty-box { grid-column: 1 / -1; display: grid; gap: 0.65rem; justify-items: center; padding: 0.5rem 0 1rem; }
.empty-box .empty { margin: 0; max-width: 22rem; }
.add-food {
  grid-column: 1 / -1;
  min-height: 3rem;
  border: 1px dashed var(--timber-primary);
  border-radius: 0.85rem;
  background: transparent;
  color: var(--timber-primary);
  font-weight: 700;
  cursor: pointer;
}

.sheet-bg {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(10, 18, 32, 0.55);
  display: flex; align-items: flex-end; justify-content: center;
}
.sheet {
  width: min(28rem, 100%);
  background: var(--timber-panel);
  color: var(--timber-ink);
  border-radius: 1.2rem 1.2rem 0 0;
  padding: 1rem 1rem calc(1.2rem + env(safe-area-inset-bottom));
  display: grid;
  gap: 0.55rem;
  border: 1px solid var(--timber-line);
}
.sheet h3 { margin: 0; font-family: var(--font-display); font-size: 1.3rem; font-weight: 700; }
.product-sheet {
  width: 100%;
  max-height: 92dvh;
  overflow: hidden;
  gap: 0;
  padding: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  border-radius: 1.2rem 1.2rem 0 0;
}
.product-banner {
  position: relative;
  height: 9.5rem;
  background: linear-gradient(160deg, #123056 0%, #1e5aa8 70%, #2f6fbe 100%);
  overflow: hidden;
}
.product-banner img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.banner-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(10, 18, 32, 0.78) 0%, rgba(10, 18, 32, 0.15) 58%, rgba(10, 18, 32, 0.25) 100%);
  pointer-events: none;
}
.banner-copy {
  position: absolute;
  left: 1rem;
  right: 3.4rem;
  bottom: 3.15rem;
  z-index: 1;
}
.product-banner .sheet-kicker { color: #f3c27a; }
.product-banner h3 {
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.product-banner .sheet-x {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  z-index: 2;
  background: rgba(255, 255, 255, 0.94);
}
.banner-url {
  position: absolute;
  left: 0.75rem;
  right: 0.75rem;
  bottom: 0.55rem;
  z-index: 1;
  margin: 0;
}
.banner-url input {
  width: 100%;
  box-sizing: border-box;
  min-height: 2.35rem;
  border: none;
  border-radius: 0.65rem;
  padding: 0.4rem 0.7rem;
  font: inherit;
  font-size: 0.92rem;
  background: rgba(255, 255, 255, 0.96);
  color: var(--timber-ink);
}
.product-body {
  overflow: auto;
  padding: 0.75rem 1rem 0.35rem;
  display: grid;
  gap: 0.55rem;
  align-content: start;
}
.product-foot {
  display: grid;
  gap: 0.15rem;
  padding: 0.65rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel);
}
.sheet-kicker {
  margin: 0 0 0.15rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--timber-primary);
}
.sheet-x {
  width: 2.2rem;
  height: 2.2rem;
  border: none;
  border-radius: 0.6rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem;
}
.field-row.solo { grid-template-columns: 1fr; }
.product-sheet .sheet-actions {
  display: grid;
  grid-template-columns: 1fr 1.25fr;
  gap: 0.55rem;
  align-items: stretch;
  margin: 0;
  position: static;
  padding: 0;
  background: none;
  border: none;
}
.product-sheet .sheet-actions .act {
  width: 100%;
  min-height: 3.35rem;
  margin: 0;
  padding: 0 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  line-height: 1.2;
  box-sizing: border-box;
}
.product-sheet .sheet-actions .act:not(.primary) {
  border: 1.5px solid var(--timber-line);
  background: var(--timber-panel);
}
.delete-link {
  justify-self: center;
  margin: 0;
  padding: 0.35rem 0.5rem 0.15rem;
  border: none;
  background: none;
  color: var(--timber-danger);
  font: inherit;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 0.18em;
}
.product-sheet .field { gap: 0.2rem; }
.product-sheet .inp { min-height: 2.65rem; padding: 0.45rem 0.7rem; }
.product-sheet .wide { grid-column: 1 / -1; }
.sheet-hint { margin: -0.25rem 0 0; color: var(--timber-muted); font-size: 0.88rem; }
.field { display: grid; gap: 0.3rem; font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
.iva-choice {
  display: grid;
  gap: 0.45rem;
}
.iva-q {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--timber-ink);
}
.iva-card {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  margin: 0;
  padding: 0.75rem 0.8rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel);
  cursor: pointer;
}
.iva-card.on {
  border-color: var(--timber-primary);
  background: color-mix(in srgb, var(--timber-primary) 8%, var(--timber-panel));
}
.iva-card input {
  margin-top: 0.2rem;
  width: 1.15rem;
  height: 1.15rem;
  accent-color: var(--timber-primary);
  flex-shrink: 0;
}
.iva-card strong {
  display: block;
  font-size: 0.98rem;
  color: var(--timber-ink);
}
.iva-card small {
  display: block;
  margin-top: 0.15rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--timber-muted);
  line-height: 1.3;
}
.price-preview {
  margin: 0.15rem 0 0;
  font-size: 0.82rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--timber-primary);
}
.sheet .check {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--timber-ink);
}
.sheet .check input { width: 1.1rem; height: 1.1rem; accent-color: var(--timber-primary); }
.inp {
  min-height: 3rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  padding: 0.65rem 0.8rem;
  font: inherit;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  width: 100%;
  box-sizing: border-box;
}
.act {
  min-height: 3.2rem;
  border: none;
  border-radius: 0.85rem;
  font-weight: 700;
  font-size: 1.05rem;
  cursor: pointer;
  background: var(--timber-surface);
  color: var(--timber-ink);
}
.act.primary { background: var(--timber-primary); color: var(--timber-on-primary); }
.act.danger { background: var(--timber-danger-soft); color: var(--timber-danger); }

/* Aviso de caja abierta mucho tiempo */
.cash-warning-banner {
  background: var(--timber-warning-soft, #fff3cd);
  color: var(--timber-warning, #856404);
  border: 1px solid var(--timber-warning, #ffc107);
  border-radius: 0.65rem;
  padding: 0.65rem 0.85rem;
  margin: 0.35rem 0.5rem;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
  flex-shrink: 0;
}

/* Modal de pago */
.pay-sheet { max-width: 26rem; }
.pay-hint {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--timber-muted);
  line-height: 1.4;
}
.pay-summary {
  display: grid;
  gap: 0.35rem;
  padding: 0.75rem 0.85rem;
  background: var(--timber-surface);
  border-radius: 0.75rem;
  border: 1px solid var(--timber-line);
}
.pay-summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
  font-weight: 600;
}
.pay-total-row {
  border-top: 1px solid var(--timber-line);
  padding-top: 0.4rem;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--timber-primary);
}
.pay-methods {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 0.4rem;
}
.pay-method-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.65rem 0.45rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-panel);
  cursor: pointer;
  font-weight: 700;
  font-size: 0.88rem;
  text-align: center;
}
.pay-method-card.on {
  border-color: var(--timber-primary);
  background: color-mix(in srgb, var(--timber-primary) 10%, var(--timber-panel));
}
.pay-method-card input { display: none; }
.pay-inp {
  font-size: 1.25rem !important;
  font-weight: 800 !important;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.pay-change {
  text-align: center;
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--timber-success);
  padding: 0.45rem;
  background: var(--timber-success-soft, #d4edda);
  border-radius: 0.65rem;
}
.pay-split-info {
  text-align: center;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--timber-accent);
  padding: 0.3rem;
}
.pay-confirm {
  font-size: 1.1rem !important;
  min-height: 3.5rem !important;
}

@media (max-width: 767.98px) {
  .fkey {
    min-width: 0;
    flex: 1;
    min-height: 2.75rem;
  }
  .fkey .fl { font-size: 0.78rem; }
  .desk-top {
    grid-template-columns: 1fr;
    gap: 0.35rem;
    padding: 0.35rem 0.45rem;
  }
  .price-board { order: -1; }
  .board-num { font-size: 2.15rem; }
  .scan-input { min-height: 2.85rem; font-size: 1.05rem; }
  .c-code,
  .c-price,
  .ticket-table th.c-code,
  .ticket-table th.c-price { display: none; }
  .c-qty { width: 6.5rem; }
  .c-imp { width: 28%; }
  .btn-cobrar {
    min-width: 6.2rem;
    min-height: 3.1rem;
    font-size: 1rem;
  }
  .toolbar-right { display: none; }
}

@media (min-width: 768px) and (max-width: 1099.98px) {
  .desk-top {
    grid-template-columns: 1.15fr 0.95fr;
  }
  .board-num { font-size: 2.35rem; }
  .fkey { min-width: 4.4rem; }
  .manage-body {
    grid-template-columns: 8.5rem 1fr;
    grid-template-rows: 1fr;
  }
  .cats-rail {
    flex-direction: column;
    overflow: hidden;
    border-bottom: none;
    border-right: 1px solid var(--timber-line);
  }
  .cat { width: 100%; white-space: normal; text-align: left; }
  .c-code { width: 14%; }
  .sheet-bg { align-items: center; padding: 1rem; }
  .sheet { border-radius: 1.15rem; }
}

@media (min-width: 1100px) {
  .desk-top {
    grid-template-columns: minmax(16rem, 1fr) minmax(18rem, 0.9fr);
  }
  .board-num { font-size: 2.85rem; }
  .fkey { min-width: 5rem; min-height: 2.85rem; }
  .manage-body {
    grid-template-columns: 10rem 1fr;
    grid-template-rows: 1fr;
  }
  .cats-rail {
    flex-direction: column;
    overflow: hidden;
    border-bottom: none;
    border-right: 1px solid var(--timber-line);
  }
  .cat { width: 100%; white-space: normal; text-align: left; }
  .sheet-bg { align-items: center; padding: 1rem; }
  .sheet { border-radius: 1.15rem; }
  .toolbar-right .seg:first-child { display: none; }
}

@media (min-width: 768px) {
  .product-sheet {
    width: min(48rem, calc(100vw - 2rem));
    max-height: calc(100dvh - 2rem);
    overflow: hidden;
    border-radius: 1.15rem;
  }
  .product-banner { height: 8.25rem; }
  .product-body {
    overflow: hidden;
    grid-template-columns: 1fr 1fr;
    column-gap: 0.75rem;
    row-gap: 0.45rem;
    padding: 0.7rem 1rem 0.35rem;
  }
  .iva-choice {
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem 0.55rem;
  }
  .iva-q,
  .price-preview { grid-column: 1 / -1; }
  .iva-card { padding: 0.5rem 0.65rem; }
  .product-foot { padding: 0.65rem 1rem 0.8rem; }
  .product-foot.editing {
    grid-template-columns: minmax(16rem, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
  }
  .product-foot.editing .delete-link {
    justify-self: end;
    padding: 0.35rem 0.15rem;
  }
}

@media (min-width: 1100px) {
  .product-sheet { width: min(52rem, calc(100vw - 2rem)); }
}

@media (min-width: 768px) and (max-height: 760px) {
  .product-banner { height: 6.5rem; }
  .banner-copy { bottom: 2.7rem; }
  .product-banner .sheet-kicker { display: none; }
  .product-banner h3 { font-size: 1.05rem; }
  .product-sheet .inp { min-height: 2.35rem; }
  .iva-card { padding: 0.4rem 0.55rem; }
}

/* —— Alerta de stock bajo —— */
.low-stock-banner {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  margin: 0 0.55rem;
  padding: 0.65rem 0.85rem;
  background: color-mix(in srgb, var(--timber-warning) 12%, var(--timber-panel));
  border: 1px solid color-mix(in srgb, var(--timber-warning) 35%, var(--timber-line));
  border-radius: 0.75rem;
  font-size: 0.88rem;
  color: var(--timber-ink);
}
.low-stock-icon { font-size: 1.3rem; flex-shrink: 0; }
.low-stock-body { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.low-stock-body strong { font-size: 0.82rem; color: var(--timber-warning); }
.low-stock-list {
  font-size: 0.8rem;
  color: var(--timber-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* —— Barra de búsqueda del catálogo —— */
.catalog-search-bar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.65rem;
  border-bottom: 1px solid var(--timber-line);
  background: var(--timber-panel);
}
.catalog-search-input {
  flex: 1;
  min-height: 2.5rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.6rem;
  padding: 0.35rem 0.7rem;
  font: inherit;
  font-size: 0.92rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  box-sizing: border-box;
}
.view-toggle {
  display: flex;
  gap: 0.15rem;
  background: var(--timber-surface);
  border-radius: 0.5rem;
  padding: 0.15rem;
  border: 1px solid var(--timber-line);
}
.view-toggle button {
  width: 2.4rem;
  height: 2.4rem;
  border: none;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--timber-muted);
  font-size: 1.1rem;
  cursor: pointer;
  font-weight: 700;
}
.view-toggle button.on {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}

/* —— Costo y margen en tarjeta de producto —— */
.pcost {
  font-size: 0.68rem;
  color: var(--timber-muted);
  font-variant-numeric: tabular-nums;
}

/* —— Vista de lista (tabla de productos) —— */
.products-list-wrap {
  overflow-x: auto;
}
.products-list-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}
.products-list-table th {
  background: var(--timber-panel-elevated);
  border-bottom: 1px solid var(--timber-line);
  padding: 0.5rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--timber-muted);
  text-align: left;
  white-space: nowrap;
}
.products-list-table td {
  padding: 0.55rem 0.6rem;
  border-bottom: 1px solid var(--timber-line);
  vertical-align: middle;
  white-space: nowrap;
}
.list-row { cursor: pointer; }
.list-row:hover { background: color-mix(in srgb, var(--timber-primary) 6%, transparent); }
.list-name { font-weight: 700; white-space: normal; max-width: 14rem; }
.list-cat { color: var(--timber-muted); font-size: 0.82rem; }
.low-text { color: var(--timber-warning); font-weight: 800; }

</style>

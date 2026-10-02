<template>
  <AppShell>
    <div class="pos" :class="{ manage: mode === 'manage' }">
      <!-- Aviso de caja abierta mucho tiempo -->
      <div v-if="cashOpenWarning" class="cash-warning-banner" role="alert">
        <PosIcon name="alert" :size="18" />
        <span>La caja lleva abierta más de 12 horas. Las ventas y el escaneo están bloqueados hasta que hagas el corte.</span>
        <router-link to="/orders">Ir al corte de caja</router-link>
      </div>

      <!-- ═══════════ MODO VENTA ═══════════ -->
      <template v-if="mode === 'pos'">
        <div class="sale">
          <!-- Buscador y catálogo -->
          <section class="browse" aria-label="Buscar productos">
            <div class="finder" :class="{ flash: scanFlash, err: !!scanError }">
              <div class="finder-row">
                <div class="finder-box">
                  <PosIcon name="search" class="finder-ico" />
                  <input
                    id="pos-scan"
                    ref="scanInput"
                    v-model="scanCode"
                    type="search"
                    inputmode="search"
                    enterkeyhint="search"
                    class="scan-input"
                    aria-label="Código de barras o nombre del producto"
                    :disabled="cashBlocked"
                    :placeholder="scanPlaceholder"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    @keydown.enter.prevent="onScanEnter"
                    @keydown="onScanKeydown"
                  />
                  <button
                    v-if="scanCode"
                    type="button"
                    class="finder-clear"
                    aria-label="Limpiar búsqueda"
                    @click="clearSearch"
                  >
                    <PosIcon name="x" />
                  </button>
                </div>
                <button type="button" class="tool" title="Consultar precio (F4)" aria-label="Consultar precio" @click="openPriceCheck">
                  <PosIcon name="tag" />
                  <span class="tool-label">Precio</span>
                </button>
                <button
                  type="button"
                  class="tool"
                  title="Artículo varios (Ins)"
                  aria-label="Artículo varios"
                  :disabled="cashBlocked"
                  @click="openMisc()"
                >
                  <PosIcon name="plus" />
                  <span class="tool-label">Varios</span>
                </button>
              </div>
              <p class="finder-status" :class="'tone-' + status.tone" aria-live="polite">
                <span class="dot" aria-hidden="true"></span>
                <span class="finder-status-text">{{ status.text }}</span>
              </p>
            </div>

            <div v-if="!searching && menus.length > 1" class="chips" role="tablist" aria-label="Categorías">
              <button
                type="button"
                role="tab"
                class="chip"
                :class="{ on: !pickMenuId }"
                :aria-selected="!pickMenuId"
                @click="pickMenuId = ''"
              >
                Todo
              </button>
              <button
                v-for="menu in menus"
                :key="menu.id"
                type="button"
                role="tab"
                class="chip"
                :class="{ on: pickMenuId === menu.id }"
                :aria-selected="pickMenuId === menu.id"
                :style="{ '--hue': hueOf(menu.id) }"
                @click="pickMenuId = menu.id"
              >
                <span class="chip-dot" aria-hidden="true"></span>
                {{ menu.name }}
              </button>
            </div>

            <!-- Resultados de búsqueda -->
            <div v-if="searching" ref="resultsEl" class="results" role="listbox" aria-label="Resultados de búsqueda">
              <p class="results-head">
                <strong>{{ resultsTotal }}</strong>
                {{ resultsTotal === 1 ? 'resultado' : 'resultados' }} para “{{ debouncedTerm }}”
                <span v-if="resultsTotal > results.length"> · se muestran {{ results.length }}</span>
                <span v-if="results.length" class="only-pc"> · ↑ ↓ para elegir, Enter agrega</span>
              </p>
              <button
                v-for="(p, i) in results"
                :key="p.id"
                type="button"
                role="option"
                class="result"
                :class="{ active: i === activeHit, out: isOut(p) }"
                :aria-selected="i === activeHit"
                :disabled="cashBlocked"
                @click="pickResult(p)"
              >
                <span class="avatar" :style="{ '--hue': hueOf(p.menuId) }">
                  <img v-if="hasImg(p)" :src="p.imgUrl" alt="" loading="lazy" @error="brokenImgs.add(p.id)" />
                  <template v-else>{{ initial(p.name) }}</template>
                </span>
                <span class="result-main">
                  <span class="result-name"><template v-for="(seg, k) in highlight(p.name)" :key="k"><mark v-if="seg.m">{{ seg.t }}</mark><template v-else>{{ seg.t }}</template></template></span>
                  <small class="result-sub">
                    {{ p.barcode || p.sku || 'Sin código' }}<template v-if="p.description"> · {{ p.description }}</template>
                  </small>
                </span>
                <span class="result-side">
                  <strong class="result-price">{{ money(lineUnit(p)) }}{{ perUnit(unitOf(p)) }}</strong>
                  <small v-if="inventoryOn" class="stock" :class="stockTone(p)">{{ stockLabel(p) }}</small>
                  <em v-if="qtyInCart(p.id)" class="in-ticket">{{ formatQty(qtyInCart(p.id)) }} en ticket</em>
                </span>
              </button>
              <div v-if="!results.length" class="empty-state">
                <PosIcon name="search" class="big-ico" :size="26" />
                <p><strong>No encontramos “{{ debouncedTerm }}”.</strong></p>
                <p>Revisa cómo está escrito o búscalo por su código.</p>
                <div class="empty-acts">
                  <button type="button" class="soft-btn" :disabled="cashBlocked" @click="openMisc(debouncedTerm)">
                    Vender como artículo varios
                  </button>
                  <button type="button" class="soft-btn" :disabled="cashBlocked" @click="registerFromSearch()">
                    Registrar producto nuevo
                  </button>
                  <button type="button" class="soft-btn" :disabled="cashBlocked" @click="registerFromSearch('kg')">
                    Registrar a granel (por kilo)
                  </button>
                </div>
              </div>
            </div>

            <!-- Mosaico de productos -->
            <div v-else class="tiles">
              <button
                v-for="p in pickList"
                :key="p.id"
                type="button"
                class="tile"
                :class="{ in: qtyInCart(p.id) > 0, out: isOut(p) }"
                :disabled="cashBlocked"
                @click="pickResult(p)"
              >
                <span class="avatar" :style="{ '--hue': hueOf(p.menuId) }">
                  <img v-if="hasImg(p)" :src="p.imgUrl" alt="" loading="lazy" @error="brokenImgs.add(p.id)" />
                  <template v-else>{{ initial(p.name) }}</template>
                  <em v-if="qtyInCart(p.id)" class="badge">{{ formatQty(qtyInCart(p.id)) }}</em>
                </span>
                <span class="tile-name">{{ p.name }}</span>
                <span class="tile-foot">
                  <strong class="tile-price">{{ money(lineUnit(p)) }}{{ perUnit(unitOf(p)) }}</strong>
                  <small v-if="inventoryOn" class="stock" :class="stockTone(p)">{{ stockLabel(p) }}</small>
                </span>
              </button>
              <p v-if="pickTotal > pickList.length" class="tiles-more">
                Se muestran {{ pickList.length }} de {{ pickTotal }}. Usa el buscador para encontrar el resto.
              </p>
              <div v-if="!pickList.length" class="empty-state">
                <PosIcon name="box" class="big-ico" :size="26" />
                <template v-if="!pickFoods.length">
                  <p><strong>Aún no hay productos.</strong></p>
                  <p>Da de alta tu catálogo para empezar a cobrar.</p>
                  <router-link to="/products" class="soft-btn">Ir a Productos</router-link>
                </template>
                <p v-else>Esta categoría está vacía.</p>
              </div>
            </div>

            <p class="keys-legend only-pc">
              <span><kbd>3*</kbd>cantidad al escanear</span>
              <span><kbd>+</kbd><kbd>−</kbd>pieza</span>
              <span><kbd>F2</kbd>quitar</span>
              <span><kbd>F3</kbd>cantidad</span>
              <span><kbd>F4</kbd>precio</span>
              <span><kbd>F6</kbd>espera</span>
              <span><kbd>F9</kbd>descuento</span>
              <span><kbd>Ins</kbd>varios</span>
              <span><kbd>F12</kbd>cobrar</span>
            </p>
          </section>

          <!-- Ticket -->
          <div v-if="showMobileCart" class="ticket-scrim only-mobile" @click="showMobileCart = false"></div>
          <aside class="ticket" :class="{ open: showMobileCart }" aria-label="Ticket de venta">
            <header class="ticket-head">
              <div class="ticket-title">
                <h2>Venta actual</h2>
                <p>
                  {{ lines.length ? `${formatQty(itemCount)} ${itemCount === 1 ? 'artículo' : 'artículos'}` : 'Ticket vacío' }}
                </p>
              </div>
              <button
                type="button"
                class="head-btn"
                :class="{ has: heldTickets.length }"
                title="Tickets en espera (F6)"
                @click="openHeld"
              >
                <PosIcon name="clock" :size="18" />
                <span>En espera</span>
                <b v-if="heldTickets.length">{{ heldTickets.length }}</b>
              </button>
              <button
                type="button"
                class="head-btn icon danger"
                title="Vaciar ticket"
                aria-label="Vaciar ticket"
                :disabled="!lines.length"
                @click="clearCart"
              >
                <PosIcon name="trash" :size="18" />
              </button>
              <button type="button" class="head-btn only-mobile" @click="showMobileCart = false">Seguir</button>
            </header>

            <ol v-if="lines.length" ref="linesEl" class="lines">
              <li
                v-for="(line, i) in lines"
                :key="line.id"
                class="line"
                :class="{ on: selectedIdx === i, bump: bumpId === line.id }"
                @click="selectLine(i)"
              >
                <div class="line-main">
                  <span class="line-name">{{ line.name }}</span>
                  <span class="line-meta">
                    {{ formatQtyUnit(line.quantity, unitOf(line)) }} × {{ money(lineUnit(line)) }}{{ perUnit(unitOf(line)) }}
                    <template v-if="line.isMisc"> · Varios</template>
                    <template v-else-if="line.barcode || line.sku"> · {{ line.barcode || line.sku }}</template>
                  </span>
                </div>
                <strong class="line-imp">{{ money(lineGross(line)) }}</strong>
                <div class="line-ctrl" @click.stop>
                  <div class="stepper">
                    <button type="button" aria-label="Una pieza menos" @click="bumpQty(i, -1)">−</button>
                    <button type="button" class="stepper-val" title="Escribir cantidad (F3)" @click="openQty(i)">
                      {{ formatQty(line.quantity) }}
                    </button>
                    <button type="button" aria-label="Una pieza más" @click="bumpQty(i, 1)">+</button>
                  </div>
                  <button type="button" class="line-x" title="Quitar del ticket (F2)" aria-label="Quitar del ticket" @click="removeAt(i)">
                    <PosIcon name="trash" :size="18" />
                    <span>Quitar</span>
                  </button>
                </div>
              </li>
            </ol>
            <div v-else class="empty-state ticket-empty">
              <div v-if="msg" class="sale-done">
                <PosIcon name="check" class="sale-done-ico" :size="26" />
                <p>{{ msg }}</p>
                <div v-if="printIssue" class="print-issue" role="alert">
                  <p><strong>No se imprimió el ticket.</strong> {{ printIssue }} La venta sí quedó registrada.</p>
                  <div>
                    <button type="button" class="soft-btn" :disabled="printerStore.busy" @click="retryPrint">
                      {{ printerStore.busy ? 'Imprimiendo…' : 'Reintentar' }}
                    </button>
                    <button type="button" class="soft-btn" @click="printLastInBrowser">Imprimir con el navegador</button>
                  </div>
                </div>
                <button
                  v-else-if="lastTicketId && directPrinting()"
                  type="button"
                  class="soft-btn"
                  :disabled="printerStore.busy"
                  @click="retryPrint"
                >
                  <PosIcon name="printer" :size="18" />
                  {{ printerStore.busy ? 'Imprimiendo…' : 'Reimprimir ticket' }}
                </button>
                <a v-else-if="lastTicketId" :href="reprintHref" target="_blank" rel="noopener" class="soft-btn">
                  <PosIcon name="printer" :size="18" />
                  Reimprimir ticket
                </a>
              </div>
              <template v-else>
                <PosIcon :name="cashBlocked ? 'alert' : 'barcode'" class="big-ico" :class="{ warn: cashBlocked }" :size="26" />
                <p><strong>{{ cashBlocked ? 'Caja bloqueada' : 'Listo para vender' }}</strong></p>
                <p>
                  {{
                    cashBlocked
                      ? 'Haz el corte de caja para seguir cobrando.'
                      : compactPos
                        ? 'Toca un producto o búscalo por nombre.'
                        : 'Escanea un código o toca un producto para agregarlo.'
                  }}
                </p>
              </template>
            </div>

            <footer class="ticket-foot">
              <dl class="sums">
                <div>
                  <dt>Subtotal</dt>
                  <dd>{{ money(totals.subtotal) }}</dd>
                </div>
                <div v-if="ticketDiscount" class="disc">
                  <dt>Descuento {{ ticketDiscount }}%</dt>
                  <dd>−{{ money(totals.discountAmount) }}</dd>
                </div>
                <div class="muted">
                  <dt>IVA incluido</dt>
                  <dd>{{ money(tax) }}</dd>
                </div>
              </dl>
              <div class="grand">
                <span>Total</span>
                <strong>{{ money(total) }}</strong>
              </div>
              <div class="quick">
                <button type="button" title="Cantidad del renglón (F3)" :disabled="!lines.length" @click="openQty()">
                  <PosIcon name="hash" :size="18" />
                  Cantidad
                </button>
                <button
                  type="button"
                  title="Descuento al ticket (F9)"
                  :class="{ on: ticketDiscount }"
                  :disabled="!lines.length"
                  @click="openDiscount"
                >
                  <PosIcon name="percent" :size="18" />
                  {{ ticketDiscount ? `Dcto ${ticketDiscount}%` : 'Descuento' }}
                </button>
                <button type="button" title="Poner en espera (F6)" :disabled="!lines.length" @click="holdTicket">
                  <PosIcon name="pause" :size="18" />
                  En espera
                </button>
              </div>
              <button
                type="button"
                class="pay-btn"
                :disabled="!lines.length || sending || cashBlocked"
                @click="finalizeOrder"
              >
                <span>{{ sending ? 'Cobrando…' : 'Cobrar' }}</span>
                <strong>{{ money(total) }}</strong>
                <kbd class="only-pc">F12</kbd>
              </button>
            </footer>
          </aside>

          <!-- Barra de cobro (celular) -->
          <div v-if="msg && !lines.length" class="m-done only-mobile">
            <PosIcon name="check" :size="18" />
            <span>{{ msg }}</span>
            <a v-if="lastTicketId" :href="reprintHref" target="_blank" rel="noopener">Reimprimir</a>
          </div>
          <footer class="m-pay only-mobile">
            <button type="button" class="m-pay-ticket" @click="showMobileCart = true">
              <span class="m-pay-count">{{ formatQty(itemCount) }}</span>
              <span class="m-pay-copy">
                <strong>{{ money(total) }}</strong>
                <small>{{ mobileHint }}</small>
              </span>
            </button>
            <button
              type="button"
              class="m-pay-go"
              :disabled="!lines.length || sending || cashBlocked"
              @click="finalizeOrder"
            >
              {{ sending ? '…' : 'Cobrar' }}
            </button>
          </footer>
        </div>
      </template>

      <!-- ═══════════ MODO CATÁLOGO ═══════════ -->
      <template v-else>
        <div class="cat-page">
          <header class="cat-head">
            <div class="cat-title">
              <h1>Productos</h1>
              <p>
                {{ pickFoods.length }} {{ pickFoods.length === 1 ? 'producto' : 'productos' }} ·
                {{ menus.length }} {{ menus.length === 1 ? 'categoría' : 'categorías' }}
              </p>
            </div>
            <div class="cat-head-acts">
              <router-link to="/inventory" class="btn">Compras e inventario</router-link>
              <button type="button" class="btn" :disabled="!pickFoods.length" @click="exportCatalog">
                Exportar CSV
              </button>
              <button
                v-if="aiEnabled"
                type="button"
                class="btn magic-btn"
                :disabled="cashBlocked"
                :title="cashBlocked ? 'Bloqueado hasta el corte de caja' : 'Inventario Mágico · Precio Mágico: con una foto o el texto de la nota del proveedor registra la compra, suma existencias y te avisa si subió el costo'"
                @click="openMagic"
              >
                <PosIcon name="spark" :size="18" /> Registro mágico
              </button>
              <button type="button" class="btn primary hide-mobile" @click="openNewFood">
                <PosIcon name="plus" :size="18" /> Nuevo producto
              </button>
            </div>
          </header>

          <div class="kpis hide-mobile">
            <button type="button" class="kpi" :class="{ on: statusFilter === 'all' }" @click="statusFilter = 'all'">
              <span>Productos</span><strong>{{ pickFoods.length }}</strong>
            </button>
            <div v-if="inventoryOn" class="kpi static">
              <span>Valor del inventario</span><strong>{{ moneyShort(Math.round(catalogStats.value)) }}</strong>
              <small>a costo</small>
            </div>
            <button v-if="inventoryOn" type="button" class="kpi warn" :class="{ on: statusFilter === 'low' }" @click="statusFilter = 'low'">
              <span>Stock bajo</span><strong>{{ catalogStats.low }}</strong>
            </button>
            <button v-if="inventoryOn" type="button" class="kpi danger" :class="{ on: statusFilter === 'out' }" @click="statusFilter = 'out'">
              <span>Agotados</span><strong>{{ catalogStats.out }}</strong>
            </button>
            <button type="button" class="kpi" :class="{ on: statusFilter === 'nocode' }" @click="statusFilter = 'nocode'">
              <span>Sin código</span><strong>{{ catalogStats.nocode }}</strong>
            </button>
            <button type="button" class="kpi" :class="{ on: statusFilter === 'nocost' }" @click="statusFilter = 'nocost'">
              <span>Sin costo</span><strong>{{ catalogStats.nocost }}</strong>
            </button>
          </div>

          <div class="cat-body">
            <aside class="cat-rail" aria-label="Categorías">
              <button type="button" class="rail-item" :class="{ on: !catFilter }" @click="catFilter = ''">
                <span class="rail-name">Todas</span><em>{{ pickFoods.length }}</em>
              </button>
              <button
                v-for="menu in menus"
                :key="menu.id"
                type="button"
                class="rail-item"
                :class="{ on: catFilter === menu.id }"
                :style="{ '--hue': hueOf(menu.id) }"
                @click="catFilter = menu.id"
              >
                <span class="chip-dot" aria-hidden="true"></span>
                <span class="rail-name">{{ menu.name }}</span><em>{{ catCount(menu.id) }}</em>
              </button>
              <div class="rail-acts">
                <button type="button" class="soft-btn" @click="showMenuForm = true">+ Categoría</button>
                <button v-if="menus.length" type="button" class="link-btn" @click="openCats">Editar</button>
              </div>
            </aside>

            <section class="cat-main">
              <div class="cat-sticky">
              <div class="cat-tools">
                <div class="finder-box">
                  <PosIcon name="search" class="finder-ico" />
                  <input
                    v-model="catalogSearch"
                    class="scan-input cat-search"
                    type="search"
                    :placeholder="catalogPlaceholder"
                    autocomplete="off"
                    autocorrect="off"
                    spellcheck="false"
                    @keydown.enter.prevent="onCatalogEnter"
                  />
                </div>
                <select v-model="sortBy" class="inp cat-sort" aria-label="Ordenar">
                  <option value="name">Nombre A–Z</option>
                  <option value="price-desc">Precio mayor</option>
                  <option value="price-asc">Precio menor</option>
                  <option v-if="inventoryOn" value="stock">Menos existencias</option>
                  <option value="margin">Menor ganancia</option>
                </select>
                <div class="view-toggle hide-mobile">
                  <button type="button" :class="{ on: viewMode === 'list' }" title="Lista" @click="viewMode = 'list'">☰</button>
                  <button type="button" :class="{ on: viewMode === 'grid' }" title="Mosaico" @click="viewMode = 'grid'">▦</button>
                </div>
              </div>

              <div class="cat-chips">
                <button
                  v-for="f in statusFilters"
                  :key="f.id"
                  type="button"
                  class="chip"
                  :class="{ on: statusFilter === f.id }"
                  @click="statusFilter = f.id"
                >
                  {{ f.label }}<em v-if="f.count != null" class="chip-count">{{ f.count }}</em>
                </button>
                <span class="cat-count hide-mobile">{{ catalogRows.length }} {{ catalogRows.length === 1 ? 'producto' : 'productos' }}</span>
              </div>
              </div>

              <div class="cat-list">
                <div v-if="catalogRows.length" class="m-rows only-mobile">
                  <button v-for="p in visibleRows" :key="p.id" type="button" class="m-row" @click="editFood(p)">
                    <span class="avatar" :style="{ '--hue': hueOf(p.menuId) }">
                      <img v-if="hasImg(p)" :src="p.imgUrl" alt="" loading="lazy" @error="brokenImgs.add(p.id)" />
                      <template v-else>{{ initial(p.name) }}</template>
                    </span>
                    <span class="m-row-main">
                      <strong>{{ p.name }}</strong>
                      <small>
                        {{ codeOf(p) || 'Sin código' }}
                        <template v-if="!catFilter"> · {{ menuName(p.menuId) }}</template>
                      </small>
                    </span>
                    <span class="m-row-side">
                      <strong>{{ money(p.price) }}</strong>
                      <span v-if="inventoryOn" class="pill" :class="stockTone(p)">{{ stockLabel(p) }}</span>
                      <small v-else-if="marginPct(p) != null" :class="marginTone(p)">{{ marginPct(p) }}% ganancia</small>
                    </span>
                  </button>
                </div>

                <table v-if="viewMode === 'list' && catalogRows.length" class="cat-table hide-mobile">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th class="hide-mobile">Código</th>
                      <th class="only-pc">Categoría</th>
                      <th class="num">Precio</th>
                      <th class="num hide-mobile">Costo</th>
                      <th class="num hide-mobile">Ganancia</th>
                      <th v-if="inventoryOn" class="num">Existencias</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="p in visibleRows" :key="p.id" @click="editFood(p)">
                      <td>
                        <div class="cell-prod">
                          <span class="avatar sm" :style="{ '--hue': hueOf(p.menuId) }">
                            <img v-if="hasImg(p)" :src="p.imgUrl" alt="" loading="lazy" @error="brokenImgs.add(p.id)" />
                            <template v-else>{{ initial(p.name) }}</template>
                          </span>
                          <span class="cell-text">
                            <strong>{{ p.name }}</strong>
                            <small v-if="p.description">{{ p.description }}</small>
                            <small class="only-mobile">{{ p.barcode || p.sku || 'Sin código' }}</small>
                          </span>
                        </div>
                      </td>
                      <td class="hide-mobile mono" :class="{ muted: !(p.barcode || p.sku) }">{{ p.barcode || p.sku || 'Sin código' }}</td>
                      <td class="only-pc">
                        <span class="cell-cat" :style="{ '--hue': hueOf(p.menuId) }">
                          <span class="chip-dot"></span>{{ menuName(p.menuId) }}
                        </span>
                      </td>
                      <td class="num strong">{{ money(p.price) }}</td>
                      <td class="num hide-mobile" :class="{ muted: !Number(p.cost) }">{{ Number(p.cost) ? money(p.cost) : '—' }}</td>
                      <td class="num hide-mobile">
                        <template v-if="Number(p.cost)">
                          <span :class="marginTone(p)">{{ marginPct(p) }}%</span>
                          <small class="muted cell-sub">{{ money(p.price - p.cost) }}</small>
                        </template>
                        <span v-else class="muted">—</span>
                      </td>
                      <td v-if="inventoryOn" class="num">
                        <span class="pill" :class="stockTone(p)">{{ stockLabel(p) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>

                <div v-else-if="catalogRows.length" class="tiles cat-tiles hide-mobile">
                  <button v-for="p in visibleRows" :key="p.id" type="button" class="tile" @click="editFood(p)">
                    <span class="avatar" :style="{ '--hue': hueOf(p.menuId) }">
                      <img v-if="hasImg(p)" :src="p.imgUrl" alt="" loading="lazy" @error="brokenImgs.add(p.id)" />
                      <template v-else>{{ initial(p.name) }}</template>
                    </span>
                    <span class="tile-name">{{ p.name }}</span>
                    <span class="tile-foot">
                      <strong class="tile-price">{{ money(p.price) }}</strong>
                      <small v-if="inventoryOn" class="stock" :class="stockTone(p)">{{ stockLabel(p) }}</small>
                    </span>
                  </button>
                </div>

                <button v-if="catalogRows.length > visibleRows.length" type="button" class="soft-btn more-btn" @click="catLimit += 150">
                  Mostrar más ({{ catalogRows.length - visibleRows.length }} restantes)
                </button>

                <div v-if="!catalogRows.length" class="empty-state">
                  <PosIcon name="box" class="big-ico" :size="26" />
                  <template v-if="!pickFoods.length">
                    <p><strong>Aún no hay productos.</strong></p>
                    <p>Agrégalos uno por uno o carga 8 de ejemplo para probar la caja.</p>
                    <div class="empty-acts">
                      <button type="button" class="soft-btn" @click="openNewFood">Nuevo producto</button>
                      <button type="button" class="soft-btn" :disabled="seeding || cashBlocked" @click="seedStarter">
                        {{ seeding ? 'Cargando…' : 'Cargar 8 de ejemplo' }}
                      </button>
                    </div>
                    <p v-if="seedErr">{{ seedErr }}</p>
                  </template>
                  <template v-else>
                    <p><strong>Nada coincide con los filtros.</strong></p>
                    <div class="empty-acts">
                      <button type="button" class="soft-btn" @click="resetCatalogFilters">Quitar filtros</button>
                      <button v-if="catalogSearch.trim()" type="button" class="soft-btn" @click="newFromSearch">
                        Crear “{{ catalogSearch.trim() }}”
                      </button>
                    </div>
                  </template>
                </div>
              </div>
            </section>
          </div>
        </div>

        <button type="button" class="fab only-mobile" aria-label="Nuevo producto" @click="openNewFood">
          <PosIcon name="plus" :size="26" />
        </button>

        <!-- Administrar categorías -->
        <Teleport to="body">
          <div v-if="showCats" class="dlg-bg">
            <div class="dlg" role="dialog" aria-labelledby="cats-title">
              <header class="dlg-head">
                <span class="dlg-ico"><PosIcon name="box" /></span>
                <div>
                  <h3 id="cats-title">Categorías</h3>
                  <p>Cambia el nombre o elimina. Al eliminar, sus productos se pasan a otra categoría.</p>
                </div>
                <button type="button" class="dlg-x" aria-label="Cerrar" @click="showCats = false"><PosIcon name="x" /></button>
              </header>
              <ul class="held-list">
                <li v-for="menu in menus" :key="menu.id">
                  <input v-model="catDrafts[menu.id]" class="inp" maxlength="40" @keydown.enter.prevent="renameMenu(menu)" @blur="renameMenu(menu)" />
                  <span class="cat-count">{{ catCount(menu.id) }}</span>
                  <button type="button" class="btn icon ghost" title="Eliminar" aria-label="Eliminar categoría" :disabled="catBusy" @click="askDeleteMenu(menu)">
                    <PosIcon name="trash" :size="18" />
                  </button>
                </li>
              </ul>
              <template v-if="menuToDelete">
                <div class="pay-open">
                  <p>
                    <strong>Eliminar “{{ menuToDelete.name }}”.</strong>
                    <template v-if="catCount(menuToDelete.id)">
                      Sus {{ catCount(menuToDelete.id) }} productos se moverán a:
                    </template>
                  </p>
                  <select v-if="catCount(menuToDelete.id)" v-model="moveTarget" class="inp">
                    <option v-for="m in menus.filter((x) => x.id !== menuToDelete.id)" :key="m.id" :value="m.id">{{ m.name }}</option>
                  </select>
                  <p v-if="catCount(menuToDelete.id) && menus.length < 2" class="dlg-note">
                    Crea otra categoría primero para no perder los productos.
                  </p>
                </div>
                <div class="dlg-acts">
                  <button type="button" class="btn" :disabled="catBusy" @click="menuToDelete = null">Cancelar</button>
                  <button
                    type="button"
                    class="btn primary"
                    :disabled="catBusy || (catCount(menuToDelete.id) > 0 && !moveTarget)"
                    @click="confirmDeleteMenu"
                  >
                    {{ catBusy ? 'Eliminando…' : 'Eliminar categoría' }}
                  </button>
                </div>
              </template>
              <p v-if="catErr" class="dlg-err">{{ catErr }}</p>
            </div>
          </div>
        </Teleport>
      </template>

      <!-- Consulta de precio (F4) -->
      <Teleport to="body">
        <div v-if="showPriceCheck" class="dlg-bg">
          <form class="dlg" role="dialog" aria-labelledby="price-title" @submit.prevent="runPriceCheck">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="tag" /></span>
              <div>
                <h3 id="price-title">Consultar precio</h3>
                <p>Escanea o escribe el código. No se agrega al ticket.</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" @click="closePriceCheck"><PosIcon name="x" /></button>
            </header>
            <input
              ref="priceInput"
              v-model="priceCode"
              class="inp big"
              placeholder="Código de barras o nombre"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              @keydown.enter.prevent="runPriceCheck"
            />
            <div v-if="priceResult" class="price-card">
              <span class="price-card-name">{{ priceResult.name }}</span>
              <strong class="price-card-price">{{ money(priceResult.price) }}</strong>
              <span class="price-card-meta">
                {{ priceResult.barcode || priceResult.sku || 'Sin código' }}
                <template v-if="inventoryOn">
                  · <span class="stock" :class="stockTone(priceResult)">{{ stockLabel(priceResult) }}</span>
                </template>
              </span>
            </div>
            <p v-if="priceErr" class="dlg-err">{{ priceErr }}</p>
            <div class="dlg-acts">
              <button type="button" class="btn" @click="closePriceCheck">Cerrar</button>
              <button
                v-if="priceResult"
                type="button"
                class="btn primary"
                :disabled="cashBlocked"
                @click="addFromPriceCheck"
              >
                Agregar al ticket
              </button>
              <button v-else type="submit" class="btn primary">Consultar</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Código que no existe -->
      <Teleport to="body">
        <div v-if="missingCode" class="dlg-bg">
          <div class="dlg" role="dialog" aria-labelledby="missing-title">
            <header class="dlg-head">
              <span class="dlg-ico warn"><PosIcon name="alert" /></span>
              <div>
                <h3 id="missing-title">No está en el catálogo</h3>
                <p>
                  El código <strong>{{ missingCode }}</strong> no existe. Regístralo para venderlo o cóbralo como
                  artículo varios.
                </p>
              </div>
            </header>
            <div class="dlg-stack">
              <button type="button" class="btn primary" @click="startAddMissing">Registrar producto</button>
              <button v-if="missingIntent === 'sale'" type="button" class="btn" @click="missingToMisc">
                Cobrar como artículo varios
              </button>
              <button type="button" class="btn ghost" @click="dismissMissing">Ahora no</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Descuento (F9) -->
      <Teleport to="body">
        <div v-if="showDiscount" class="dlg-bg">
          <form class="dlg" role="dialog" aria-labelledby="disc-title" @submit.prevent="applyDiscount">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="percent" /></span>
              <div>
                <h3 id="disc-title">Descuento al ticket</h3>
                <p>Se aplica a todo el ticket.</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" @click="closeDiscount"><PosIcon name="x" /></button>
            </header>
            <div class="presets">
              <button
                v-for="d in [5, 10, 15, 20, 25, 50]"
                :key="d"
                type="button"
                :class="{ on: Number(discountDraft) === d }"
                @click="discountDraft = d"
              >
                {{ d }}%
              </button>
            </div>
            <label class="field">
              <span>Porcentaje (0–100)</span>
              <input
                ref="discountInput"
                v-model.number="discountDraft"
                v-select-on-focus
                class="inp big num"
                type="number"
                min="0"
                max="100"
                step="1"
                inputmode="decimal"
              />
            </label>
            <p v-if="lines.length" class="dlg-note">
              Ahorro {{ money(discountPreview.discountAmount) }} · el cliente paga
              <strong>{{ money(discountPreview.total) }}</strong>
            </p>
            <div class="dlg-acts">
              <button type="button" class="btn" @click="clearDiscount">Quitar descuento</button>
              <button type="submit" class="btn primary">Aplicar</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Cantidad (F3) -->
      <Teleport to="body">
        <div v-if="showQty" class="dlg-bg">
          <form class="dlg dlg-qty" role="dialog" aria-labelledby="qty-title" @submit.prevent="applyQty">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="hash" /></span>
              <div>
                <h3 id="qty-title">Cantidad</h3>
                <p>{{ qtyLine?.name }}</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" @click="closeQty"><PosIcon name="x" /></button>
            </header>
            <input
              ref="qtyInput"
              v-model="qtyDraft"
              v-select-on-focus
              class="inp big num"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              aria-label="Cantidad"
              @input="qtyFresh = false"
            />
            <p class="dlg-note">
              {{ money(qtyLine?.price) }} c/u · importe <strong>{{ money(qtyPreview) }}</strong>
              <span class="hide-mobile"> · acepta decimales para kilos o metros</span>
            </p>
            <div class="presets">
              <button v-for="v in qtyPresets" :key="v.value" type="button" @click="setQtyDraft(v.value)">{{ v.label }}</button>
            </div>
            <div class="keypad hide-pc">
              <button v-for="k in ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0']" :key="k" type="button" @click="keypadPress(k)">
                {{ k }}
              </button>
              <button type="button" aria-label="Borrar" @click="keypadPress('del')">⌫</button>
            </div>
            <p v-if="qtyErr" class="dlg-err">{{ qtyErr }}</p>
            <div class="dlg-acts">
              <button type="button" class="btn" @click="closeQty">Cancelar</button>
              <button type="submit" class="btn primary">Aceptar</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Venta a granel: peso o importe -->
      <Teleport to="body">
        <div v-if="showWeigh" class="dlg-bg">
          <form class="dlg dlg-qty" role="dialog" aria-labelledby="weigh-title" @submit.prevent="applyWeigh">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="hash" /></span>
              <div>
                <h3 id="weigh-title">{{ weighItem?.name }}</h3>
                <p>{{ money(lineUnit(weighItem)) }}{{ perUnit(weighUnit) }}</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" @click="closeWeigh"><PosIcon name="x" /></button>
            </header>
            <div
              v-if="weighByScale"
              class="scale-panel"
              :class="[scaleRead.state, { mute: !scaleHasData, clear: scaleRead.waitingClear }]"
              role="status"
              aria-live="polite"
            >
              <p class="scale-hint">{{ weighHint }}</p>
              <strong class="scale-kg">{{ scaleHasData ? formatQtyUnit(weighQty, weighUnit) : '— — —' }}</strong>
              <span class="scale-amount">{{ scaleHasData && weighQty > 0 ? money(weighAmount) : '' }}</span>
              <div class="scale-bar" aria-hidden="true">
                <i :style="{ width: `${Math.min(100, (scaleRead.heldMs / 2000) * 100)}%` }"></i>
              </div>
              <small>Se agrega solo cuando el peso se queda quieto 2 segundos. O escribe el peso o el importe abajo.</small>
            </div>
            <div class="methods two" role="radiogroup" aria-label="Capturar por">
              <label class="method" :class="{ on: weighMode === 'qty' }">
                <input v-model="weighMode" type="radio" name="weigh-mode" value="qty" @change="resetWeighDraft" />
                <span>{{ weighUnit === 'l' ? 'Litros' : weighUnit === 'g' ? 'Gramos' : 'Peso (kg)' }}</span>
              </label>
              <label class="method" :class="{ on: weighMode === 'amount' }">
                <input v-model="weighMode" type="radio" name="weigh-mode" value="amount" @change="resetWeighDraft" />
                <span>Importe ($)</span>
              </label>
            </div>
            <input
              ref="weighInput"
              v-model="weighDraft"
              v-select-on-focus
              class="inp big num"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              :aria-label="weighMode === 'amount' ? 'Importe en pesos' : 'Cantidad'"
              :placeholder="weighMode === 'amount' ? '$0.00' : weighUnit === 'g' ? '0' : '0.000'"
              @input="weighErr = ''"
            />
            <p class="dlg-note">
              <strong>{{ formatQtyUnit(weighQty, weighUnit) }}</strong> × {{ money(lineUnit(weighItem)) }}{{ perUnit(weighUnit) }}
              = <strong>{{ money(weighAmount) }}</strong>
            </p>
            <div class="keypad hide-pc">
              <button v-for="k in ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0']" :key="k" type="button" @click="weighKey(k)">
                {{ k }}
              </button>
              <button type="button" aria-label="Borrar" @click="weighKey('del')">⌫</button>
            </div>
            <p v-if="weighErr" class="dlg-err">{{ weighErr }}</p>
            <div class="dlg-acts">
              <button type="button" class="btn" @click="closeWeigh">Cancelar</button>
              <button type="submit" class="btn primary">Agregar</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Artículo varios (Ins) -->
      <Teleport to="body">
        <div v-if="showMisc" class="dlg-bg">
          <form class="dlg" role="dialog" aria-labelledby="misc-title" @submit.prevent="addMisc">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="plus" /></span>
              <div>
                <h3 id="misc-title">Artículo varios</h3>
                <p>Para lo que no tiene código o todavía no está en el catálogo.</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" @click="closeMisc"><PosIcon name="x" /></button>
            </header>
            <label class="field">
              <span>Precio por pieza</span>
              <input
                ref="miscPriceInput"
                v-model="miscForm.price"
                v-select-on-focus
                class="inp big num"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                placeholder="0.00"
              />
            </label>
            <div class="field-pair">
              <label class="field">
                <span>Cantidad</span>
                <input v-model="miscForm.qty" v-select-on-focus class="inp num" type="number" min="0" step="any" inputmode="decimal" />
              </label>
              <label class="field">
                <span>Descripción <em>(opcional)</em></span>
                <input v-model="miscForm.name" class="inp" maxlength="60" placeholder="Varios" />
              </label>
            </div>
            <p class="dlg-note">El precio ya incluye IVA. No descuenta inventario.</p>
            <p v-if="miscErr" class="dlg-err">{{ miscErr }}</p>
            <div class="dlg-acts">
              <button type="button" class="btn" @click="closeMisc">Cancelar</button>
              <button type="submit" class="btn primary">Agregar al ticket</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- Tickets en espera (F6) -->
      <Teleport to="body">
        <div v-if="showHeld" class="dlg-bg">
          <div class="dlg" role="dialog" aria-labelledby="held-title">
            <header class="dlg-head">
              <span class="dlg-ico"><PosIcon name="clock" /></span>
              <div>
                <h3 id="held-title">Tickets en espera</h3>
                <p>Atiende a otro cliente sin perder la venta que llevas.</p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cerrar" @click="closeHeld"><PosIcon name="x" /></button>
            </header>
            <button v-if="lines.length" type="button" class="btn primary" @click="holdTicket">
              <PosIcon name="pause" :size="18" />
              Poner en espera el actual ({{ money(total) }})
            </button>
            <ul v-if="heldTickets.length" class="held-list">
              <li v-for="t in heldTickets" :key="t.id">
                <div class="held-info">
                  <strong>{{ money(heldTotal(t)) }}</strong>
                  <span>{{ formatQty(heldItems(t)) }} art. · {{ heldTime(t.at) }}</span>
                  <small>{{ heldPreview(t) }}</small>
                </div>
                <button type="button" class="btn primary" @click="resumeHeld(t.id)">Retomar</button>
                <button type="button" class="btn icon ghost" aria-label="Descartar ticket" title="Descartar" @click="dropHeld(t.id)">
                  <PosIcon name="trash" :size="18" />
                </button>
              </li>
            </ul>
            <p v-else class="dlg-note">No hay tickets en espera.</p>
            <p v-if="heldTickets.length && lines.length" class="dlg-note">
              Al retomar uno, el ticket actual queda en espera.
            </p>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="showMenuForm" class="sheet-bg">
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
        v-if="aiEnabled && showMagic"
        :menus="menus"
        :default-menu-id="selectedMenuId"
        :suppliers="suppliers"
        @close="showMagic = false"
        @applied="onMagicApplied"
        @manual="onMagicManual"
      />

      <!-- Cobro -->
      <Teleport to="body">
        <div v-if="showPayment" class="dlg-bg">
          <form
            class="dlg pay"
            role="dialog"
            aria-labelledby="pay-title"
            @submit.prevent="cashOpen ? confirmPayment() : openCashFromPay()"
          >
            <header class="dlg-head">
              <span class="dlg-ico accent"><PosIcon name="cash" /></span>
              <div>
                <h3 id="pay-title">Cobrar venta</h3>
                <p>
                  {{ formatQty(itemCount) }} {{ itemCount === 1 ? 'artículo' : 'artículos' }}
                  <template v-if="ticketDiscount"> · descuento {{ ticketDiscount }}%</template>
                </p>
              </div>
              <button type="button" class="dlg-x" aria-label="Cancelar cobro" :disabled="sending || cashBusy" @click="closePayment">
                <PosIcon name="x" />
              </button>
            </header>

            <div class="pay-total">
              <span>Total a pagar</span>
              <strong>{{ money(chargeTotal) }}</strong>
              <small>
                IVA incluido {{ money(tax) }}<template v-if="cardFeeAmount"> · comisión por tarjeta {{ money(cardFeeAmount) }}</template>
              </small>
            </div>

            <template v-if="!cashOpen">
              <div class="pay-open">
                <p><strong>La caja está cerrada.</strong> Ábrela aquí mismo para cobrar; no saldrás de esta pantalla.</p>
                <label class="field">
                  <span>Efectivo inicial en caja</span>
                  <input
                    ref="openingInput"
                    v-model.number="openingFloat"
                    v-select-on-focus
                    class="inp big num"
                    type="number"
                    min="0"
                    step="1"
                    inputmode="decimal"
                    placeholder="0"
                  />
                </label>
              </div>
              <p v-if="payError" class="dlg-err">{{ payError }}</p>
              <div class="dlg-acts">
                <button type="button" class="btn" @click="closePayment">Cancelar</button>
                <button type="submit" class="btn primary" :disabled="cashBusy">
                  {{ cashBusy ? 'Abriendo…' : 'Abrir caja y cobrar' }}
                </button>
              </div>
            </template>

            <template v-else>
              <div class="methods" role="radiogroup" aria-label="Forma de pago">
                <label v-for="m in payMethods" :key="m.id" class="method" :class="{ on: payMethod === m.id }">
                  <input v-model="payMethod" type="radio" name="pay-method" :value="m.id" />
                  <PosIcon :name="m.icon" />
                  <span>{{ m.label }}</span>
                </label>
              </div>

              <template v-if="payMethod === 'split'">
                <label class="field">
                  <span>Parte con tarjeta</span>
                  <input
                    v-model.number="payCardAmount"
                    v-select-on-focus
                    class="inp num"
                    type="number"
                    min="0"
                    :max="total"
                    step="0.01"
                    inputmode="decimal"
                    placeholder="0.00"
                  />
                </label>
                <p class="dlg-note">Resto en efectivo: <strong>{{ money(payCashPortion) }}</strong></p>
              </template>

              <template v-if="payMethod === 'cash' || payMethod === 'split'">
                <label class="field">
                  <span>Efectivo recibido</span>
                  <input
                    ref="cashReceivedInput"
                    v-model.number="payCashReceived"
                    v-select-on-focus
                    class="inp big num"
                    type="number"
                    min="0"
                    step="0.01"
                    inputmode="decimal"
                    :placeholder="money(payCashPortion)"
                  />
                </label>
                <div v-if="quickCash.length" class="bills">
                  <button
                    v-for="(v, k) in quickCash"
                    :key="v"
                    type="button"
                    class="bill"
                    :class="{ on: Number(payCashReceived) === v }"
                    @click="setReceived(v)"
                  >
                    {{ k === 0 ? 'Exacto' : moneyShort(v) }}
                  </button>
                </div>
                <div class="change" :class="{ short: payShort > 0, zero: !payShort && !payChange }">
                  <span>{{ payShort > 0 ? 'Faltan' : 'Cambio' }}</span>
                  <strong>{{ money(payShort > 0 ? payShort : payChange) }}</strong>
                </div>
              </template>

              <template v-else-if="payMethod === 'card'">
                <label v-if="cardFeeOn" class="fee-row">
                  <input v-model="cardFee" type="checkbox" />
                  <span>
                    <strong>Comisión por tarjeta ({{ feePctText }})</strong>
                    <small>+{{ money(cardFeeFor(total)) }} para cubrir lo que cobra la terminal</small>
                  </span>
                </label>
                <p class="pay-note">
                  Cobra <strong>{{ money(chargeTotal) }}</strong> en la terminal y confirma cuando salga aprobado.
                </p>
              </template>
              <template v-else-if="payMethod === 'transfer' || payMethod === 'other'">
                <p class="pay-note">
                  <template v-if="payMethod === 'transfer'">
                    Confirma que la transferencia de <strong>{{ money(total) }}</strong> ya llegó a la cuenta.
                  </template>
                  <template v-else>
                    Registra el cobro de <strong>{{ money(total) }}</strong> por otro medio (vales, pago en línea…). No entra al efectivo del cajón.
                  </template>
                </p>
                <label class="field">
                  <span>{{ payMethod === 'transfer' ? 'Folio SPEI o últimos dígitos (opcional)' : 'Referencia (opcional)' }}</span>
                  <input
                    v-model.trim="payReference"
                    class="inp"
                    type="text"
                    maxlength="60"
                    autocomplete="off"
                    :placeholder="payMethod === 'transfer' ? 'Ej. 4821 o clave de rastreo' : 'Ej. vale 0012'"
                  />
                </label>
              </template>

              <p v-if="payError" class="dlg-err">{{ payError }}</p>

              <div class="dlg-acts">
                <button type="button" class="btn" :disabled="sending" @click="closePayment">Cancelar</button>
                <button ref="payConfirmBtn" type="submit" class="btn accent" :disabled="sending || cashBlocked">
                  {{ sending ? 'Cobrando…' : 'Confirmar cobro' }}
                  <kbd class="only-pc">Enter</kbd>
                </button>
              </div>
            </template>
          </form>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="showFoodForm" class="sheet-bg product-modal">
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
                          </div>

            <div class="product-body">
              <label class="field wide">
                <span>Nombre</span>
                <input v-model="foodForm.name" class="inp" :placeholder="namePlaceholder" required />
              </label>

              <label class="field m-wide">
                <span>Categoría</span>
                <select v-model="foodForm.menuId" class="inp" @change="onFormMenuChange">
                  <option v-for="m in menus" :key="m.id" :value="m.id">{{ m.name }}</option>
                  <option value="__new">+ Nueva categoría…</option>
                </select>
              </label>
              <div class="field m-wide">
                <span>Código de barras o clave</span>
                <div class="code-row">
                  <input
                    v-model="foodForm.barcode"
                    class="inp"
                    placeholder="Escanea o escribe"
                    autocomplete="off"
                    data-scan="barcode"
                    @keydown.enter.prevent
                  />
                  <button type="button" class="btn" title="Crear un código interno para imprimir en etiqueta" @click="generateCode">
                    Generar
                  </button>
                </div>
                <p v-if="duplicateCode" class="dup-warn" role="alert">
                  <PosIcon name="alert" :size="16" />
                  <span>Este código ya es de <b>{{ duplicateCode.name }}</b>.</span>
                  <button type="button" @click="editFood(duplicateCode)">Abrir ese producto</button>
                </p>
              </div>

              <label class="field wide">
                <span>{{ descriptionLabel }} <em>(opcional, también se busca en la caja)</em></span>
                <input v-model="foodForm.description" class="inp" :placeholder="descriptionPlaceholder" />
              </label>

              <div class="price-trio wide">
                <label class="field">
                  <span>Costo</span>
                  <input v-model.number="foodForm.cost" class="inp num" type="number" min="0" step="0.01" placeholder="0.00" />
                </label>
                <label class="field">
                  <span>Ganancia %</span>
                  <input
                    v-model="foodMarkup"
                    class="inp num"
                    type="number"
                    step="1"
                    placeholder="—"
                    :disabled="!(Number(foodForm.cost) > 0)"
                    title="Sobre el costo. Al cambiarla se calcula el precio."
                  />
                </label>
                <label class="field">
                  <span>{{ foodForm.saleUnit !== 'pz' ? `Precio por ${SALE_UNITS[foodForm.saleUnit].label.toLowerCase()}` : 'Precio' }}<span v-if="foodForm.saleUnit === 'pz'" class="hide-mobile"> de venta</span></span>
                  <input v-model.number="foodForm.price" class="inp num strong" type="number" min="0" step="0.01" required />
                </label>
              </div>

              <div class="field wide">
                <span>¿Cómo se vende?</span>
                <div class="unit-picks" role="radiogroup" aria-label="Unidad de venta">
                  <label v-for="(u, id) in SALE_UNITS" :key="id" class="unit-pick" :class="{ on: foodForm.saleUnit === id }">
                    <input v-model="foodForm.saleUnit" type="radio" name="sale-unit" :value="id" />
                    <strong>{{ id === 'pz' ? 'Por pieza' : `Por ${u.label.toLowerCase()}` }}</strong>
                    <small>{{ id === 'pz' ? 'Coca, jabón, galletas' : id === 'kg' ? 'Tomate, queso, frijol' : id === 'g' ? 'Especias, chiles secos' : 'Leche, aceite a granel' }}</small>
                  </label>
                </div>
                <small v-if="foodForm.saleUnit !== 'pz'" class="unit-help">
                  El precio es por {{ SALE_UNITS[foodForm.saleUnit].label.toLowerCase() }}. Al venderlo se pesa en la báscula o se escribe el
                  peso o el importe.
                </small>
              </div>

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
                    <small>Al cobrar se agrega el {{ taxPercent }}%</small>
                  </span>
                </label>
                <p class="price-preview">
                  El cliente paga {{ money(foodPricePreview.gross) }}
                  <template v-if="Number(foodForm.cost) > 0"> · ganas {{ money(foodForm.price - foodForm.cost) }} por unidad</template>
                </p>
              </div>

              <template v-if="inventoryOn">
                <label class="field">
                  <span>Existencias{{ cashBlocked ? ' (bloqueado: haz el corte)' : '' }}</span>
                  <input v-model.number="foodForm.stock" class="inp" type="number" min="0" step="any" :disabled="cashBlocked" />
                </label>
                <label class="field">
                  <span>Avisar cuando queden</span>
                  <input v-model.number="foodForm.lowStockThreshold" class="inp" type="number" min="0" step="any" placeholder="5" />
                </label>
                <label class="check-wide wide">
                  <input v-model="foodForm.tracksExpiry" type="checkbox" />
                  <span>Este producto caduca (lotes y FEFO)</span>
                </label>
                <div v-if="suppliers.length" class="field wide">
                  <span>Proveedores</span>
                  <div class="supplier-picks">
                    <label v-for="s in suppliers" :key="s.id">
                      <input v-model="foodForm.supplierIds" type="checkbox" :value="s.id" />
                      {{ s.name }}
                    </label>
                  </div>
                </div>
              </template>

              <label class="field wide">
                <span>Foto (link)</span>
                <input v-model="foodForm.imgUrl" class="inp" type="url" placeholder="Pega aquí el link de la foto" />
              </label>
              <p v-if="foodError" class="scan-msg err wide">{{ foodError }}</p>
            </div>

            <footer class="product-foot" :class="{ editing: editingFood }">
              <div class="sheet-actions">
                <button type="button" class="act" @click="closeFoodForm">Cancelar</button>
                <button type="submit" class="act primary">Guardar<span class="hide-mobile"> producto</span></button>
              </div>
              <button v-if="editingFood" type="button" class="delete-link dup-link" @click="duplicateFood">
                Duplicar<span class="hide-mobile"> producto</span>
              </button>
              <button
                v-if="editingFood"
                type="button"
                class="delete-link"
                :disabled="cashBlocked"
                @click="deleteFood"
              >
                Eliminar<span class="hide-mobile"> este producto</span>
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
import PosIcon from "../components/PosIcon.js";
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiService } from "../apiService";
import { store } from "../store";
import { venueStore, fetchVenueSettings } from "../venueStore";
import { billingStore } from "../billingStore";
import { cardFeeRateOf, cartTotals, lineBreakdown, rateOf } from "../tax";
import { storeClock } from "../storeTime";
import { connectScale, scaleLive, scaleStore, weighBeep } from "../scale";
import {
  SALE_UNITS,
  createStableWeigh,
  formatQtyUnit,
  isBulk,
  parseScaleBarcode,
  perUnit,
  pluKeys,
  qtyForAmount,
  qtyFromGrams,
  roundQty,
  unitOf,
} from "../bulk";
import { apiService as apiSvc } from "../apiService";
import { authStore } from "../authStore";
import { isNetworkError, newClientSaleId } from "../net";
import {
  applyPendingStock,
  loadCatalog,
  loadCashSession as loadCachedCash,
  lookupInCatalog,
  saveCatalog,
  saveCashSession as saveCachedCash,
  listPending,
  saleToPrintOrder,
} from "../offlineDb";
import { directPrinting, printReceiptDirect, printerStore } from "../thermalPrinter";
import { flushOfflineSales, offlineStore, queueSale } from "../offlineSync";

const vSelectOnFocus = {
  mounted(el) {
    el.addEventListener("focus", () => {
      // setTimeout para que funcione también en móvil/Safari
      setTimeout(() => el.select?.(), 0);
    });
  },
};

/** Minúsculas y sin acentos, conservando la longitud del texto (para resaltar coincidencias). */
function fold(value) {
  const str = String(value || "");
  let out = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const f = c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += f.length === 1 ? f : c;
  }
  return out;
}

/** "3*7501055300075" → { qty: 3, rest: "7501055300075" } */
function parseQtyPrefix(text) {
  const raw = String(text || "");
  const m = raw.match(/^\s*(\d{1,4}(?:[.,]\d{1,3})?)\s*\*\s*(.*)$/);
  if (!m) return { qty: 1, rest: raw.trim(), hasQty: false };
  const qty = Number(m[1].replace(",", "."));
  return qty > 0 ? { qty, rest: m[2].trim(), hasQty: true } : { qty: 1, rest: m[2].trim(), hasQty: false };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const CATEGORY_HUES = [212, 28, 152, 274, 342, 46, 190, 118, 8, 236];

export default {
  components: { AppShell, MagicPricesSheet, PosIcon },
  directives: { selectOnFocus: vSelectOnFocus },
  props: {
    initialMode: { type: String, default: "pos" },
  },
  setup(props) {
    const route = useRoute();
    const router = useRouter();
    const menus = ref([]);
    const productos = ref([]);
    const pickFoods = ref([]);
    const pickMenuId = ref("");
    const showMobileCart = ref(false);
    const compactPos = ref(
      typeof window !== "undefined" && window.matchMedia("(max-width: 767.98px)").matches
    );
    const selectedMenuId = ref("");
    const seeding = ref(false);
    const seedErr = ref("");
    const mode = ref(props.initialMode === "manage" || route.name === "products" ? "manage" : "pos");

    const scanInput = ref(null);
    const priceInput = ref(null);
    const openingInput = ref(null);
    const cashReceivedInput = ref(null);
    const scanCode = ref("");
    const scanError = ref("");
    const scanFlash = ref(false);
    const lastAdded = ref(null);
    const nameHits = ref([]);
    const hitsFor = ref("");
    const scanning = ref(false);
    const selectedIdx = ref(-1);
    const sending = ref(false);
    const msg = ref("");
    const debouncedTerm = ref("");
    const activeHit = ref(-1);
    const resultsEl = ref(null);
    const linesEl = ref(null);
    const bumpId = ref(null);
    const brokenImgs = reactive(new Set());
    const PICK_LIMIT = 120;

    // Cantidad (F3)
    const showQty = ref(false);
    const qtyIdx = ref(-1);
    const qtyDraft = ref("");
    const qtyFresh = ref(true);
    const qtyErr = ref("");
    const qtyInput = ref(null);
    const qtyPresets = [
      { label: "¼", value: "0.25" },
      { label: "½", value: "0.5" },
      { label: "¾", value: "0.75" },
      { label: "2", value: "2" },
      { label: "6", value: "6" },
      { label: "12", value: "12" },
    ];

    // Artículo varios (Ins)
    const showMisc = ref(false);
    const miscForm = reactive({ name: "", price: "", qty: 1 });
    const miscErr = ref("");
    const miscPriceInput = ref(null);

    // Tickets en espera (F6)
    const showHeld = ref(false);
    const heldTickets = ref(loadHeld());

    const discountInput = ref(null);
    const payConfirmBtn = ref(null);

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
    const aiEnabled = computed(
      () => billingStore.loaded && billingStore.aiEnabled === true && !billingStore.isPerpetual
    );
    const editingFood = ref(null);
    // Otro producto de la tienda con el mismo código (se cobraría el equivocado)
    const duplicateCode = computed(() => {
      const code = String(foodForm.barcode || "").trim();
      if (!code) return null;
      const own = editingFood.value ? String(editingFood.value.id) : "";
      return (
        pickFoods.value.find(
          (p) => String(p.id) !== own && (String(p.barcode || "").trim() === code || String(p.sku || "").trim() === code)
        ) || null
      );
    });
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
      tracksExpiry: false,
      supplierIds: [],
      menuId: "",
      saleUnit: "pz",
    });

    // Búsqueda y vista de lista en modo catálogo
    const catalogSearch = ref("");
    const viewMode = ref("list"); // "grid" o "list"
    const catFilter = ref("");
    const statusFilter = ref("all");
    const sortBy = ref("name");
    const catLimit = ref(150);
    const showCats = ref(false);
    const catDrafts = reactive({});
    const menuToDelete = ref(null);
    const moveTarget = ref("");
    const catBusy = ref(false);
    const catErr = ref("");
    const lowStockItems = ref([]);
    const suppliers = ref([]);

    const inventoryOn = computed(() => Boolean(venueStore.inventoryEnabled));
    const TAX_RATE = computed(() => rateOf(venueStore.taxRate));
    const taxPercent = computed(() => Number((TAX_RATE.value * 100).toFixed(2)));

    // Estado del modal de pago
    const showPayment = ref(false);
    const payMethod = ref("cash"); // 'cash' | 'card' | 'transfer' | 'split' | 'other'
    const payMethods = [
      { id: "cash", label: "Efectivo", icon: "cash" },
      { id: "card", label: "Tarjeta", icon: "card" },
      { id: "transfer", label: "Transferencia", icon: "transfer" },
      { id: "split", label: "Mixto", icon: "split" },
      { id: "other", label: "Otro", icon: "receipt" },
    ];
    const payReference = ref("");
    const payCashReceived = ref("");
    const payCardAmount = ref("");
    const payError = ref("");
    const takesCash = computed(() => payMethod.value === "cash" || payMethod.value === "split");
    const payCashPortion = computed(() => {
      if (payMethod.value === "cash") return round2(total.value);
      if (payMethod.value === "split") return Math.max(0, round2(total.value - Number(payCardAmount.value || 0)));
      return 0;
    });
    const payChange = computed(() => {
      if (!takesCash.value) return 0;
      const received = Number(payCashReceived.value || 0);
      return Math.max(0, round2(received - payCashPortion.value));
    });
    const payShort = computed(() => {
      if (!takesCash.value) return 0;
      const received = Number(payCashReceived.value || 0);
      if (!(received > 0)) return 0;
      return Math.max(0, round2(payCashPortion.value - received));
    });
    // Exacto + billetes que el cliente probablemente entregue
    const quickCash = computed(() => {
      const due = payCashPortion.value;
      if (!(due > 0)) return [];
      const out = [due];
      for (const step of [10, 20, 50, 100, 200, 500, 1000]) {
        const v = Math.ceil(due / step) * step;
        if (v > due && !out.includes(v)) out.push(v);
      }
      return out.slice(0, 5);
    });

    // Aviso de caja abierta mucho tiempo
    const cashSession = ref(null);
    const cashOpenWarning = ref(false);
    const cashOpen = computed(() => Boolean(cashSession.value));
    const openingFloat = ref("");
    const cashBusy = ref(false);
    const lastTicketId = ref("");
    const lastTicketOffline = ref(false);
    const cashBlocked = computed(() => cashOpenWarning.value);
    const BLOCK_MSG = "Caja abierta más de 12 horas. Realiza el corte de caja para continuar.";

    // Enfoca el campo correcto del modal de pago
    function focusPayField() {
      nextTick(() => {
        if (!showPayment.value) return;
        if (!cashOpen.value) openingInput.value?.focus();
        else if (takesCash.value) cashReceivedInput.value?.focus();
        else payConfirmBtn.value?.focus();
      });
    }

    async function loadCashSession() {
      try {
        const data = await apiSvc.getCashSession();
        if (data.open && data.session) {
          cashSession.value = data.session;
          await saveCachedCash(authStore.tenantId, data.session);
          const opened = new Date(data.session.createdAt || data.session.openedAt);
          const hoursOpen = (Date.now() - opened.getTime()) / 3600000;
          cashOpenWarning.value = hoursOpen >= 12;
        } else {
          cashSession.value = null;
          cashOpenWarning.value = false;
          await saveCachedCash(authStore.tenantId, null);
        }
      } catch (error) {
        if (isNetworkError(error)) {
          const cached = await loadCachedCash(authStore.tenantId);
          cashSession.value = cached;
          if (cached) {
            const opened = new Date(cached.createdAt || cached.openedAt);
            const hoursOpen = (Date.now() - opened.getTime()) / 3600000;
            cashOpenWarning.value = hoursOpen >= 12;
          } else {
            cashOpenWarning.value = false;
          }
          return;
        }
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
        focusPayField();
      } catch (e) {
        payError.value = isNetworkError(e)
          ? "Necesitas internet para abrir la caja la primera vez."
          : e.response?.data || "No se pudo abrir la caja.";
      } finally {
        cashBusy.value = false;
      }
    }

    function printInBrowser(orderId, offline = false) {
      if (!orderId) return;
      const path = offline
        ? `/print/offline/${orderId}?autoprint=1`
        : `/print/order/${orderId}?mode=receipt&autoprint=1`;
      window.open(path, "_blank", "noopener");
    }

    // Ticket de la última venta: con térmica configurada sale directo; si falla, se ofrece reintentar o el navegador
    const printIssue = ref("");
    let lastPrint = null; // { order, offline, cash }
    async function printDirect(job, { drawer = false } = {}) {
      printIssue.value = "";
      try {
        await printReceiptDirect(job.order, { openDrawer: drawer && job.cash });
      } catch (error) {
        printIssue.value = error.message || "La impresora no respondió.";
      }
    }
    function printReceipt(order, offline = false, cash = false) {
      if (!order?.id) return;
      lastPrint = { order, offline, cash };
      if (directPrinting()) printDirect(lastPrint, { drawer: true });
      else printInBrowser(order.id, offline);
    }
    function retryPrint() {
      if (lastPrint) printDirect(lastPrint);
    }
    function printLastInBrowser() {
      printIssue.value = "";
      if (lastPrint) printInBrowser(lastPrint.order.id, lastPrint.offline);
    }

    async function lookupFoodSmart(code) {
      try {
        return await apiService.lookupFood(code);
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        return lookupInCatalog(pickFoods.value, code);
      }
    }

    // —— Catálogo ——
    const statusFilters = computed(() => {
      const st = catalogStats.value;
      const list = [{ id: "all", label: "Todos", count: pickFoods.value.length }];
      if (inventoryOn.value) {
        list.push(
          { id: "low", label: "Stock bajo", count: st.low },
          { id: "out", label: "Agotados", count: st.out },
          { id: "expiry", label: "Caducan", count: st.expiry }
        );
      }
      list.push({ id: "nocode", label: "Sin código", count: st.nocode }, { id: "nocost", label: "Sin costo", count: st.nocost });
      return list;
    });
    function codeOf(p) {
      return String(p?.barcode || p?.sku || "").trim();
    }
    function marginPct(p) {
      const cost = Number(p?.cost) || 0;
      if (!(cost > 0)) return null;
      return Math.round(((Number(p.price) - cost) / cost) * 100);
    }
    function marginTone(p) {
      const m = marginPct(p);
      if (m == null) return "";
      return m < 0 ? "stock out" : m < 10 ? "stock low" : "stock ok";
    }
    function menuName(id) {
      return menus.value.find((m) => String(m.id) === String(id))?.name || "Sin categoría";
    }
    function catCount(id) {
      return pickFoods.value.filter((p) => String(p.menuId || "") === String(id)).length;
    }
    const catalogStats = computed(() => {
      const out = { value: 0, low: 0, out: 0, nocode: 0, nocost: 0, expiry: 0 };
      for (const p of pickFoods.value) {
        const stock = Number(p.stock) || 0;
        if (stock > 0) out.value += stock * (Number(p.cost) || 0);
        if (isOut(p)) out.out += 1;
        else if (isLow(p)) out.low += 1;
        if (!codeOf(p)) out.nocode += 1;
        if (!(Number(p.cost) > 0)) out.nocost += 1;
        if (p.tracksExpiry) out.expiry += 1;
      }
      return out;
    });
    const catalogRows = computed(() => {
      const tokens = fold(catalogSearch.value).split(/\s+/).filter(Boolean);
      let list = pickFoods.value.filter((p) => {
        if (catFilter.value && String(p.menuId || "") !== String(catFilter.value)) return false;
        switch (statusFilter.value) {
          case "low":
            if (!isLow(p)) return false;
            break;
          case "out":
            if (!isOut(p)) return false;
            break;
          case "expiry":
            if (!p.tracksExpiry) return false;
            break;
          case "nocode":
            if (codeOf(p)) return false;
            break;
          case "nocost":
            if (Number(p.cost) > 0) return false;
            break;
        }
        if (!tokens.length) return true;
        const hay = fold(`${p.name} ${codeOf(p)} ${p.description || ""}`);
        return tokens.every((t) => hay.includes(t));
      });
      const byName = (x, y) => String(x.name).localeCompare(String(y.name), "es");
      const sorters = {
        name: byName,
        "price-desc": (x, y) => Number(y.price) - Number(x.price) || byName(x, y),
        "price-asc": (x, y) => Number(x.price) - Number(y.price) || byName(x, y),
        stock: (x, y) => (Number(x.stock) || 0) - (Number(y.stock) || 0) || byName(x, y),
        margin: (x, y) => (marginPct(x) ?? 1e9) - (marginPct(y) ?? 1e9) || byName(x, y),
      };
      return [...list].sort(sorters[sortBy.value] || byName);
    });
    const visibleRows = computed(() => catalogRows.value.slice(0, catLimit.value));
    watch([catalogSearch, catFilter, statusFilter, sortBy], () => {
      catLimit.value = 150;
    });
    watch(catFilter, (id) => {
      if (id) selectedMenuId.value = id;
    });
    function resetCatalogFilters() {
      catalogSearch.value = "";
      catFilter.value = "";
      statusFilter.value = "all";
    }
    const catalogPlaceholder = computed(() => {
      const type = venueStore.businessType;
      if (type === "pharmacy") return "Buscar por nombre, sustancia o código…";
      if (type === "hardware") return "Buscar por nombre, medida o clave…";
      return "Buscar por nombre, marca o código…";
    });
    const namePlaceholder = computed(() => {
      const type = venueStore.businessType;
      if (type === "pharmacy") return "Paracetamol 500 mg 10 tabletas";
      if (type === "hardware") return "Tornillo para madera 1\" (pieza)";
      return "Coca-Cola 600 ml";
    });
    const descriptionLabel = computed(() => {
      const type = venueStore.businessType;
      if (type === "pharmacy") return "Sustancia activa y laboratorio";
      if (type === "hardware") return "Medida, material o marca";
      return "Marca o descripción";
    });
    const descriptionPlaceholder = computed(() => {
      const type = venueStore.businessType;
      if (type === "pharmacy") return "Paracetamol · Genérico";
      if (type === "hardware") return "Acero galvanizado · Truper";
      return "Marca, sabor o presentación";
    });

    /** Enter en el buscador: un código exacto abre el producto; uno nuevo ofrece registrarlo. */
    function onCatalogEnter() {
      const q = catalogSearch.value.trim();
      if (!q) return;
      const exact = pickFoods.value.find((p) => fold(codeOf(p)) === fold(q));
      if (exact) {
        editFood(exact);
        catalogSearch.value = "";
        return;
      }
      if (catalogRows.value.length === 1) {
        editFood(catalogRows.value[0]);
        return;
      }
      if (!catalogRows.value.length) newFromSearch();
    }
    function newFromSearch() {
      const q = catalogSearch.value.trim();
      const looksLikeCode = /^[0-9A-Za-z-]+$/.test(q) && /\d/.test(q);
      openNewFood();
      nextTick(() => {
        if (looksLikeCode) foodForm.barcode = q;
        else foodForm.name = q;
      });
      catalogSearch.value = "";
    }

    // Código interno EAN-13 con prefijo 20 (reservado para uso dentro de la tienda)
    function generateCode() {
      let max = 0;
      for (const p of pickFoods.value) {
        const c = codeOf(p);
        if (/^20\d{11}$/.test(c)) max = Math.max(max, Number(c.slice(2, 12)));
      }
      const base = "20" + String(max + 1).padStart(10, "0");
      let sum = 0;
      for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 ? 3 : 1);
      foodForm.barcode = base + ((10 - (sum % 10)) % 10);
    }

    // Ganancia sobre el costo; al escribirla se calcula el precio
    const foodMarkup = computed({
      get() {
        const cost = Number(foodForm.cost) || 0;
        if (!(cost > 0)) return "";
        return Math.round(((Number(foodForm.price) - cost) / cost) * 100);
      },
      set(v) {
        const cost = Number(foodForm.cost) || 0;
        const pct = Number(v);
        if (!(cost > 0) || v === "" || !Number.isFinite(pct)) return;
        foodForm.price = round2(cost * (1 + pct / 100));
      },
    });

    async function onFormMenuChange() {
      if (foodForm.menuId !== "__new") return;
      const name = String(window.prompt("Nombre de la nueva categoría") || "").trim();
      if (!name) {
        foodForm.menuId = selectedMenuId.value || menus.value[0]?.id || "";
        return;
      }
      try {
        const created = await apiService.createMenu({ name, description: "" });
        menus.value.push(created);
        foodForm.menuId = created.id;
      } catch (e) {
        foodError.value = (typeof e.response?.data === "string" && e.response.data) || "No se pudo crear la categoría.";
        foodForm.menuId = selectedMenuId.value || menus.value[0]?.id || "";
      }
    }

    function openCats() {
      for (const m of menus.value) catDrafts[m.id] = m.name;
      menuToDelete.value = null;
      catErr.value = "";
      showCats.value = true;
    }
    async function renameMenu(menu) {
      const name = String(catDrafts[menu.id] || "").trim();
      if (!name || name === menu.name) {
        catDrafts[menu.id] = menu.name;
        return;
      }
      catErr.value = "";
      try {
        await apiService.editMenu(menu.id, { name });
        menu.name = name;
      } catch (e) {
        catDrafts[menu.id] = menu.name;
        catErr.value = (typeof e.response?.data === "string" && e.response.data) || "No se pudo renombrar.";
      }
    }
    function askDeleteMenu(menu) {
      catErr.value = "";
      menuToDelete.value = menu;
      moveTarget.value = menus.value.find((m) => m.id !== menu.id)?.id || "";
    }
    async function confirmDeleteMenu() {
      const menu = menuToDelete.value;
      if (!menu) return;
      const items = pickFoods.value.filter((p) => String(p.menuId || "") === String(menu.id));
      if (items.length && !moveTarget.value) return;
      catBusy.value = true;
      catErr.value = "";
      try {
        // El servidor borra los productos de la categoría: primero muévelos
        for (const p of items) {
          await apiService.editFood(p.id, { menuId: moveTarget.value });
          p.menuId = moveTarget.value;
        }
        await apiService.deleteMenu(menu.id);
        menus.value = menus.value.filter((m) => m.id !== menu.id);
        if (catFilter.value === menu.id) catFilter.value = "";
        if (selectedMenuId.value === menu.id) selectedMenuId.value = menus.value[0]?.id || "";
        menuToDelete.value = null;
      } catch (e) {
        catErr.value = (typeof e.response?.data === "string" && e.response.data) || "No se pudo eliminar la categoría.";
      } finally {
        catBusy.value = false;
      }
    }

    function exportCatalog() {
      const cell = (v) => {
        const t = String(v ?? "");
        return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
      };
      const header = ["Producto", "Código", "Categoría", "Descripción", "Precio", "Costo", "Existencias", "Mínimo", "Incluye IVA"];
      const rows = catalogRows.value.map((p) =>
        [
          p.name,
          codeOf(p),
          menuName(p.menuId),
          p.description || "",
          Number(p.price || 0).toFixed(2),
          Number(p.cost || 0).toFixed(2),
          Number(p.stock) || 0,
          p.lowStockThreshold ?? 5,
          p.priceIncludesTax ? "Sí" : "No",
        ].map(cell).join(",")
      );
      const blob = new Blob(["\uFEFF" + [header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "productos.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    let flashTimer = null;
    let bumpTimer = null;
    let searchTimer = null;
    let priceTimer = null;
    let compactMq = null;
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
    const pickFiltered = computed(() => {
      if (!pickMenuId.value) return pickFoods.value;
      return pickFoods.value.filter((p) => String(p.menuId || "") === String(pickMenuId.value));
    });
    const pickList = computed(() => pickFiltered.value.slice(0, PICK_LIMIT));
    const pickTotal = computed(() => pickFiltered.value.length);

    // Búsqueda local: sin acentos, por varias palabras, en nombre, código y descripción
    const searchIndex = computed(() =>
      pickFoods.value.map((p) => ({
        p,
        name: fold(p.name),
        code: fold(p.barcode || p.sku || ""),
        desc: fold(p.description || ""),
      }))
    );
    const searchTerm = computed(() => parseQtyPrefix(scanCode.value).rest);
    const searchTokens = computed(() => fold(debouncedTerm.value).split(/\s+/).filter(Boolean));
    const searching = computed(() => Boolean(debouncedTerm.value));
    const ranked = computed(() => {
      const tokens = searchTokens.value;
      if (!tokens.length) return [];
      const full = tokens.join(" ");
      const scored = [];
      for (const row of searchIndex.value) {
        const hay = `${row.name} ${row.code} ${row.desc}`;
        if (!tokens.every((t) => hay.includes(t))) continue;
        let score = 0;
        if (row.code && row.code === full) score += 1000;
        else if (row.code && row.code.startsWith(full)) score += 200;
        if (row.name === full) score += 500;
        if (row.name.startsWith(tokens[0])) score += 100;
        for (const t of tokens) {
          if (row.name.includes(t)) score += 20;
          if (row.name.startsWith(t) || row.name.includes(` ${t}`)) score += 15;
        }
        if (inventoryOn.value && !(Number(row.p.stock) > 0)) score -= 5;
        scored.push({ p: row.p, score });
      }
      scored.sort((a, b) => b.score - a.score || String(a.p.name).localeCompare(String(b.p.name), "es"));
      // Sin catálogo local (o desactualizado): usa las coincidencias que mandó el servidor
      if (!scored.length && hitsFor.value === debouncedTerm.value) return nameHits.value;
      return scored.map((s) => s.p);
    });
    const results = computed(() => ranked.value.slice(0, 60));
    const resultsTotal = computed(() => ranked.value.length);

    let termTimer = null;
    watch(searchTerm, (q) => {
      clearTimeout(termTimer);
      // Pocos dígitos suelen ser el inicio de un escaneo o de "3*": no busques todavía
      if (!q || (/^\d+$/.test(q) && q.length < 4)) {
        debouncedTerm.value = "";
        return;
      }
      termTimer = setTimeout(() => {
        debouncedTerm.value = q;
      }, 120);
    });
    watch(debouncedTerm, (q) => {
      activeHit.value = q && !isCodeQuery(q) ? 0 : -1;
    });
    watch(activeHit, (i) => {
      if (i < 0) return;
      nextTick(() => {
        resultsEl.value?.querySelectorAll(".result")[i]?.scrollIntoView({ block: "nearest" });
      });
    });

    /** Parte el nombre en tramos para marcar lo que coincide con la búsqueda. */
    function highlight(text) {
      const src = String(text || "");
      const tokens = searchTokens.value;
      if (!tokens.length || !src) return [{ t: src, m: false }];
      const folded = fold(src);
      const marks = new Array(src.length).fill(false);
      for (const tk of tokens) {
        let from = 0;
        let idx = folded.indexOf(tk, from);
        while (idx !== -1) {
          for (let k = idx; k < idx + tk.length; k++) marks[k] = true;
          from = idx + tk.length;
          idx = folded.indexOf(tk, from);
        }
      }
      const out = [];
      let cur = "";
      let curMark = marks[0];
      for (let k = 0; k < src.length; k++) {
        if (marks[k] !== curMark) {
          if (cur) out.push({ t: cur, m: curMark });
          cur = "";
          curMark = marks[k];
        }
        cur += src[k];
      }
      if (cur) out.push({ t: cur, m: curMark });
      return out;
    }

    function hueOf(id) {
      const key = String(id || "");
      if (!key) return 215;
      let hash = 0;
      for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
      return CATEGORY_HUES[hash % CATEGORY_HUES.length];
    }
    function hasImg(p) {
      return Boolean(p?.imgUrl) && !brokenImgs.has(p.id);
    }
    function stockNum(p) {
      return Number(p?.stock) || 0;
    }
    function isOut(p) {
      return inventoryOn.value && !p?.isMisc && stockNum(p) <= 0;
    }
    function isLow(p) {
      if (!inventoryOn.value || p?.isMisc) return false;
      const min = p?.lowStockThreshold != null ? Number(p.lowStockThreshold) : 5;
      return stockNum(p) > 0 && stockNum(p) <= min;
    }
    const allowNoStock = computed(() => Boolean(venueStore.allowNegativeStock));
    /** Piezas que faltan si el renglón de `p` llega a `qty` (0 si alcanzan o no se lleva inventario). */
    function stockGap(p, qty) {
      if (!inventoryOn.value || !p || p.isMisc) return 0;
      const row = pickFoods.value.find((f) => String(f.id) === String(p.id)) || p;
      return Math.max(0, Number(qty || 0) - stockNum(row));
    }
    function noStockText(p) {
      const row = pickFoods.value.find((f) => String(f.id) === String(p.id)) || p;
      const n = Math.max(0, stockNum(row));
      return n > 0 ? `Sin existencias suficientes: ${p.name} (quedan ${formatQty(n)})` : `Sin existencias: ${p.name}`;
    }
    function stockTone(p) {
      return isOut(p) ? "out" : isLow(p) ? "low" : "ok";
    }
    function stockLabel(p) {
      const n = stockNum(p);
      const u = unitOf(p);
      const q = (v) => (u === "pz" ? formatQty(v) : formatQtyUnit(v, u));
      if (n < 0) return `Agotado (${q(n)})`;
      if (n <= 0) return "Agotado";
      if (isLow(p)) return `Quedan ${q(n)}`;
      return `${q(n)} disp.`;
    }

    function qtyInCart(id) {
      const line = lines.value.find((p) => p.id === id);
      return line ? Number(line.quantity || 0) : 0;
    }
    function isCompactPos() {
      return typeof window !== "undefined" && window.matchMedia("(max-width: 767.98px)").matches;
    }
    function onCompactChange(e) {
      compactPos.value = !!e.matches;
      if (compactPos.value) scanInput.value?.blur();
      else {
        showMobileCart.value = false;
        focusScan();
      }
    }
    const totals = computed(() =>
      cartTotals(lines.value, {
        discountPercent: ticketDiscount.value,
        taxRate: TAX_RATE.value,
      })
    );
    const tax = computed(() => totals.value.tax);
    const total = computed(() => totals.value.total);

    // Comisión por pago con tarjeta (Configuración → Ventas e IVA). Viene marcada; el cajero la puede quitar
    const cardFeeOn = computed(() => Boolean(venueStore.cardFeeEnabled));
    const cardFee = ref(false);
    const feeRate = computed(() => cardFeeRateOf(venueStore.cardFeePercent));
    const feePctText = computed(() => `${Number((feeRate.value * 100).toFixed(2))}%`);
    function cardFeeFor(amount) {
      return round2(Number(amount || 0) * feeRate.value);
    }
    const cardFeeAmount = computed(() =>
      payMethod.value === "card" && cardFeeOn.value && cardFee.value ? cardFeeFor(total.value) : 0
    );
    const chargeTotal = computed(() => round2(total.value + cardFeeAmount.value));

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
    /** Precio c/u con IVA: el mismo que, por la cantidad, da el importe del renglón. */
    function lineUnit(line) {
      return lineBreakdown(line.price, 1, line.priceIncludesTax, TAX_RATE.value).unitGross;
    }

    const lastLineQty = computed(() => {
      if (!lastAdded.value) return 0;
      const found = lines.value.find((l) => l.id === lastAdded.value.id);
      return found ? Number(found.quantity) : 0;
    });
    const qtyLine = computed(() => lines.value[qtyIdx.value] || null);
    const qtyPreview = computed(() => {
      const line = qtyLine.value;
      if (!line) return 0;
      const q = Number(String(qtyDraft.value || "").replace(",", ".")) || 0;
      return lineBreakdown(line.price, q, line.priceIncludesTax, TAX_RATE.value).gross;
    });
    const discountPreview = computed(() =>
      cartTotals(lines.value, {
        discountPercent: Math.min(100, Math.max(0, Number(discountDraft.value) || 0)),
        taxRate: TAX_RATE.value,
      })
    );
    const reprintHref = computed(() =>
      lastTicketOffline.value
        ? `/print/offline/${lastTicketId.value}`
        : `/print/order/${lastTicketId.value}?mode=receipt`
    );

    const scanPlaceholder = computed(() => {
      if (cashBlocked.value) return "Bloqueado: haz el corte de caja";
      if (compactPos.value) return "Buscar producto";
      const type = venueStore.businessType;
      if (type === "pharmacy") return "Escanea o busca por nombre, sustancia o código";
      if (type === "hardware") return "Escanea o busca por nombre, medida o clave";
      return "Escanea o busca por nombre o código";
    });

    const status = computed(() => {
      if (printIssue.value && !lines.value.length) {
        return { tone: "err", text: `No se imprimió el ticket: ${printIssue.value}` };
      }
      if (cashBlocked.value) {
        return { tone: "err", text: "Caja bloqueada: haz el corte de caja para seguir vendiendo." };
      }
      if (scanError.value) return { tone: "err", text: scanError.value };
      if (scanning.value) return { tone: "busy", text: "Buscando…" };
      const pre = parseQtyPrefix(scanCode.value);
      if (pre.hasQty) {
        return { tone: "busy", text: `Cantidad × ${formatQty(pre.qty)}: escanea o busca el producto` };
      }
      if (lastAdded.value && lastLineQty.value > 0) {
        const p = lastAdded.value;
        if (stockGap(p, lastLineQty.value) > 0) {
          return { tone: "warn", text: `Agregado: ${p.name} · sin existencias suficientes; la venta quedará para revisar` };
        }
        return { tone: "ok", text: `Agregado: ${p.name} · ${formatQtyUnit(lastLineQty.value, unitOf(p))} × ${money(lineUnit(p))}${perUnit(unitOf(p))}` };
      }
      if (!offlineStore.online) return { tone: "warn", text: "Sin internet · vendes con el catálogo guardado" };
      return {
        tone: "idle",
        text: compactPos.value ? "Toca un producto o búscalo" : "Escáner listo · escribe para buscar o escanea el código",
      };
    });

    const mobileHint = computed(() => {
      if (cashBlocked.value) return "Haz el corte de caja";
      if (!lines.value.length) {
        return heldTickets.value.length ? `${heldTickets.value.length} en espera · toca para ver` : "Ticket vacío";
      }
      return lastAdded.value ? lastAdded.value.name : "Ver ticket";
    });

    watch(selectedIdx, (i) => {
      if (i < 0) return;
      nextTick(() => {
        linesEl.value?.children?.[i]?.scrollIntoView({ block: "nearest" });
      });
    });

    function money(n) {
      return Number(n || 0).toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    function moneyShort(n) {
      const v = Number(n || 0);
      if (!Number.isInteger(v)) return money(v);
      return v.toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
    function formatQty(n) {
      const v = Number(n || 0);
      return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
    }
    function initial(name) {
      return String(name || "?").trim().charAt(0).toUpperCase();
    }

    function focusScan() {
      if (isCompactPos() || cashBlocked.value) return;
      nextTick(() => {
        const blocked =
          showPriceCheck.value ||
          showDiscount.value ||
          showFoodForm.value ||
          showMenuForm.value ||
          showMagic.value ||
          showPayment.value ||
          showQty.value ||
          showWeigh.value ||
          showMisc.value ||
          showHeld.value ||
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

    // —— Venta a granel: teclado de peso o importe ——
    const showWeigh = ref(false);
    const weighItem = ref(null);
    const weighMode = ref("qty"); // 'qty' (kg, g, l) | 'amount' (pesos)
    const weighDraft = ref("");
    const weighErr = ref("");
    const weighInput = ref(null);
    const weighUnit = computed(() => unitOf(weighItem.value));

    // Báscula conectada: el peso se toma solo cuando se queda quieto 2 s
    const SCALE_HOLD_MS = 2000;
    const scaleRead = ref({ state: "empty", kg: 0, heldMs: 0, waitingClear: false });
    const scaleNow = ref(Date.now());
    let scaleDetector = null;
    let scaleTimer = null;
    /** El diálogo está pesando con la báscula (no escribiendo a mano). */
    const weighByScale = computed(
      () =>
        showWeigh.value &&
        scaleStore.enabled &&
        scaleStore.connected &&
        (weighUnit.value === "kg" || weighUnit.value === "g") &&
        weighMode.value === "qty" &&
        !String(weighDraft.value || "").trim()
    );
    const scaleHasData = computed(() => scaleNow.value && scaleLive(scaleNow.value));
    function scaleQtyOf(kg) {
      return weighUnit.value === "g" ? Math.round((Number(kg) || 0) * 1000) : roundQty(kg, "kg");
    }
    const weighHint = computed(() => {
      if (!scaleHasData.value) return "La báscula no manda peso. Revisa el cable o escribe el peso abajo.";
      const r = scaleRead.value;
      if (r.waitingClear) return "Retira lo que hay en la báscula.";
      if (r.state === "empty") return `Pon ${weighItem.value?.name || "el producto"} en la báscula`;
      if (r.state === "stable") return "¡Listo!";
      return "Pesando… no lo muevas";
    });
    function stopScaleWatch() {
      clearInterval(scaleTimer);
      scaleTimer = null;
      scaleDetector = null;
    }
    function startScaleWatch() {
      stopScaleWatch();
      if (!scaleStore.enabled) return;
      if (!scaleStore.connected) connectScale().catch(() => {});
      // Lo que ya estaba encima al abrir no cuenta: hay que cambiarlo o retirarlo
      const baseline = scaleLive() ? Number(scaleStore.kg) || 0 : 0;
      scaleDetector = createStableWeigh({ holdMs: SCALE_HOLD_MS, baselineKg: baseline });
      scaleRead.value = { state: "empty", kg: baseline, heldMs: 0, waitingClear: baseline >= 0.01 };
      scaleTimer = setInterval(() => {
        const now = Date.now();
        scaleNow.value = now;
        if (!weighByScale.value || !scaleDetector) return;
        if (!scaleLive(now)) {
          scaleRead.value = { state: "empty", kg: 0, heldMs: 0, waitingClear: false };
          return;
        }
        const r = scaleDetector.feed(Number(scaleStore.kg), now);
        scaleRead.value = r;
        if (r.state === "stable") {
          const q = scaleQtyOf(r.kg);
          if (q > 0) {
            weighBeep();
            stopScaleWatch();
            const p = weighItem.value;
            showWeigh.value = false;
            weighItem.value = null;
            addProduct(p, q, { weighed: true });
          }
        }
      }, 150);
    }

    const weighQty = computed(() => {
      const p = weighItem.value;
      if (!p) return 0;
      if (weighByScale.value) return scaleHasData.value ? Math.max(0, scaleQtyOf(scaleRead.value.kg)) : 0;
      const v = Number(String(weighDraft.value || "").replace(",", ".")) || 0;
      if (v <= 0) return 0;
      return weighMode.value === "amount" ? qtyForAmount(v, lineUnit(p), weighUnit.value) : roundQty(v, weighUnit.value);
    });
    const weighAmount = computed(() => {
      const p = weighItem.value;
      return p ? lineBreakdown(p.price, weighQty.value, p.priceIncludesTax, TAX_RATE.value).gross : 0;
    });
    function openWeigh(p) {
      weighItem.value = p;
      weighMode.value = "qty";
      weighDraft.value = "";
      weighErr.value = "";
      nameHits.value = [];
      clearScanField();
      showWeigh.value = true;
      startScaleWatch();
      // Con báscula no se enfoca el campo: el teclado del celular taparía el peso
      if (!scaleStore.enabled) nextTick(() => weighInput.value?.focus());
    }
    function closeWeigh() {
      stopScaleWatch();
      showWeigh.value = false;
      weighItem.value = null;
      weighErr.value = "";
      focusScan();
    }
    function resetWeighDraft() {
      weighDraft.value = "";
      weighErr.value = "";
      nextTick(() => weighInput.value?.focus());
    }
    function weighKey(key) {
      let cur = String(weighDraft.value || "");
      weighErr.value = "";
      if (key === "del") cur = cur.slice(0, -1);
      else if (key === ".") {
        if (!cur.includes(".")) cur = (cur || "0") + ".";
      } else if (cur.length < 9) {
        cur = cur === "0" ? key : cur + key;
      }
      weighDraft.value = cur;
    }
    function applyWeigh() {
      const p = weighItem.value;
      if (!p) return closeWeigh();
      const q = weighQty.value;
      if (!(q > 0)) {
        weighErr.value = weighMode.value === "amount" ? "Escribe el importe en pesos." : "Escribe cuánto se lleva.";
        return;
      }
      if (q > 99999) {
        weighErr.value = "La cantidad es demasiado grande.";
        return;
      }
      stopScaleWatch();
      showWeigh.value = false;
      weighItem.value = null;
      addProduct(p, q, { weighed: true });
    }

    /** Código de báscula (EAN-13 20–29): agrega el producto con su peso o importe. false si no aplica. */
    function addFromScale(code) {
      const parsed = parseScaleBarcode(code, venueStore.scaleBarcodeMode === "price" ? "price" : "weight");
      if (!parsed) return false;
      const keys = pluKeys(parsed.plu);
      const product = pickFoods.value.find(
        (f) => isBulk(f) && keys.some((k) => String(f.barcode || "") === k || String(f.sku || "") === k)
      );
      if (!product) return false;
      const u = unitOf(product);
      const qty = parsed.grams != null ? qtyFromGrams(parsed.grams, u) : qtyForAmount(parsed.amount, lineUnit(product), u);
      if (!(qty > 0)) return false;
      addProduct(product, qty, { weighed: true });
      return true;
    }

    /**
     * Agrega al ticket. Un producto a granel abre el teclado de peso o importe,
     * salvo que la cantidad ya venga dada (báscula, «0.75*» en el buscador): opts.weighed.
     */
    function addProduct(producto, qty = 1, opts = {}) {
      if (cashBlocked.value) {
        scanError.value = BLOCK_MSG;
        nameHits.value = [];
        return;
      }
      if (isBulk(producto) && !opts.weighed) {
        openWeigh(producto);
        return;
      }
      const amount = Number(qty) > 0 ? roundQty(Number(qty), unitOf(producto)) : 1;
      const idx = store.platillosSeleccionados.findIndex((p) => p.id === producto.id);
      const inCart = idx >= 0 ? Number(store.platillosSeleccionados[idx].quantity) || 0 : 0;
      if (!allowNoStock.value && stockGap(producto, inCart + amount) > 0) {
        scanError.value = noStockText(producto);
        nameHits.value = [];
        hitsFor.value = "";
        scanCode.value = "";
        if (!isCompactPos()) focusScan();
        return;
      }
      if (idx >= 0) {
        const line = store.platillosSeleccionados[idx];
        line.quantity = Math.round((Number(line.quantity) + amount) * 1000) / 1000;
        selectedIdx.value = idx;
      } else {
        store.platillosSeleccionados.push({ ...producto, quantity: amount });
        selectedIdx.value = store.platillosSeleccionados.length - 1;
      }
      lastAdded.value = producto;
      bumpId.value = producto.id;
      clearTimeout(bumpTimer);
      bumpTimer = setTimeout(() => {
        bumpId.value = null;
      }, 700);
      msg.value = "";
      scanError.value = "";
      nameHits.value = [];
      hitsFor.value = "";
      scanFlash.value = true;
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        scanFlash.value = false;
      }, 220);
      scanCode.value = "";
      if (isCompactPos()) {
        scanInput.value?.blur();
        try {
          navigator.vibrate?.(12);
        } catch {
          /* ignore */
        }
        return;
      }
      focusScan();
    }

    /** Agrega un producto elegido con el dedo o el ratón (respeta "3*" escrito en el buscador). */
    function pickResult(producto) {
      const { qty, hasQty } = parseQtyPrefix(scanCode.value);
      clearScanField();
      addProduct(producto, qty, { weighed: hasQty });
    }

    function clearSearch() {
      clearScanField();
      scanError.value = "";
      nameHits.value = [];
      hitsFor.value = "";
      focusScan();
    }

    function registerFromSearch(saleUnit = "pz") {
      const term = debouncedTerm.value;
      if (isCodeQuery(term) || isScannerPayload(term)) {
        clearScanField();
        askToAdd(term, "sale");
        return;
      }
      clearScanField();
      openNewFood();
      addAfterSave.value = true;
      pendingIntent.value = "sale";
      nextTick(() => {
        foodForm.name = term;
        foodForm.saleUnit = SALE_UNITS[saleUnit] ? saleUnit : "pz";
      });
    }

    function moveHit(delta) {
      const n = results.value.length;
      if (!n) return;
      const cur = activeHit.value < 0 ? (delta > 0 ? -1 : 0) : activeHit.value;
      activeHit.value = (cur + delta + n) % n;
    }

    function moveSelection(delta) {
      const n = lines.value.length;
      if (!n) return;
      if (selectedIdx.value < 0) selectedIdx.value = delta > 0 ? 0 : n - 1;
      else selectedIdx.value = (selectedIdx.value + delta + n) % n;
    }

    function selectLine(i) {
      selectedIdx.value = i;
      focusScan();
    }

    /** Flechas, +/− y Supr dentro del buscador. */
    function onScanKeydown(e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        if (searching.value && results.value.length) moveHit(delta);
        else moveSelection(delta);
        return;
      }
      const empty = !String(e.target?.value || "").length;
      if (!empty || selectedIdx.value < 0) return;
      if (e.key === "+" || e.key === "-") {
        e.preventDefault();
        bumpQty(selectedIdx.value, e.key === "+" ? 1 : -1);
      } else if (e.key === "Delete") {
        e.preventDefault();
        removeSelected();
      }
    }

    let queuedCode = "";

    async function applyScannedCode(raw) {
      const text = String(raw || "").trim();
      const { qty, rest: code, hasQty } = parseQtyPrefix(text);
      if (!code || mode.value !== "pos") return;
      if (cashBlocked.value) {
        scanError.value = BLOCK_MSG;
        clearScanField();
        return;
      }
      if (
        showFoodForm.value ||
        showMenuForm.value ||
        showDiscount.value ||
        showMagic.value ||
        showPayment.value ||
        showQty.value ||
        showWeigh.value ||
        showMisc.value ||
        showHeld.value
      ) {
        return;
      }
      if (code === lastSaleCode && Date.now() - lastSaleAt < 450) return;
      if (scanning.value) {
        queuedCode = text;
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
        if (addFromScale(code)) return;
        const res = await lookupFoodSmart(code);
        if (res && res.id) {
          addProduct(res, qty, { weighed: hasQty });
          return;
        }
        const matches = Array.isArray(res?.matches) ? res.matches : [];
        if (matches.length === 1) {
          addProduct(matches[0], qty, { weighed: hasQty });
          return;
        }
        if (matches.length > 1) {
          // Varias coincidencias: quedan en la lista para elegir con ↑ ↓ y Enter
          scanCode.value = text;
          nameHits.value = matches;
          hitsFor.value = code;
          debouncedTerm.value = code;
          activeHit.value = 0;
          return;
        }
        if (asCode) {
          clearScanField();
          askToAdd(code, "sale");
          return;
        }
        // Texto sin coincidencias: la lista ofrece cobrarlo como varios o registrarlo
        nameHits.value = [];
        hitsFor.value = code;
        debouncedTerm.value = code;
      } catch {
        scanError.value = pickFoods.value.length
          ? "Error al buscar producto"
          : "Sin internet y no hay catálogo guardado. Entra una vez con red.";
        lastSaleCode = "";
      } finally {
        scanning.value = false;
        const next = queuedCode;
        queuedCode = "";
        if (next && next !== text) applyScannedCode(next);
        else if (!missingCode.value && !nameHits.value.length) focusScan();
      }
    }

    function onScanEnter() {
      const typed = String(scanInput.value?.value || scanCode.value || "").trim();
      const { qty, rest, hasQty } = parseQtyPrefix(typed);
      const codeLike = isCodeQuery(rest) || isScannerPayload(rest);
      const hit = results.value[activeHit.value];
      // Texto escrito a mano: Enter agrega el resultado marcado en la lista
      if (!codeLike && rest && rest === debouncedTerm.value && hit) {
        clearScanField();
        addProduct(hit, qty, { weighed: hasQty });
        return;
      }
      scanCode.value = typed;
      applyScannedCode(typed);
    }

    watch(scanCode, (val) => {
      if (Date.now() < muteScanWatchUntil) return;
      clearTimeout(searchTimer);
      if (scanError.value && scanError.value !== BLOCK_MSG) scanError.value = "";
      const raw = String(val || "").trim();
      const q = parseQtyPrefix(raw).rest;
      if (!q || mode.value !== "pos") {
        if (!q) {
          nameHits.value = [];
          hitsFor.value = "";
        }
        return;
      }
      if (cashBlocked.value) return;
      if (isCodeQuery(q)) {
        // Lectores sin Enter: si el código no es parte de otros, búscalo solo
        searchTimer = setTimeout(() => {
          if (String(scanCode.value || "").trim() !== raw) return;
          if (nameHits.value.length && lastSaleCode === q) return;
          const needle = fold(q);
          const partial = searchIndex.value.filter((r) => r.code.includes(needle));
          if (partial.length && !partial.some((r) => r.code === needle)) return;
          applyScannedCode(raw);
        }, 280);
        return;
      }
      // Con catálogo local la búsqueda es instantánea; sin él, pregunta al servidor
      if (q.length < 2 || pickFoods.value.length) return;
      searchTimer = setTimeout(async () => {
        if (String(scanCode.value || "").trim() !== raw) return;
        try {
          const res = await lookupFoodSmart(q);
          if (String(scanCode.value || "").trim() !== raw) return;
          nameHits.value = res?.id ? [res] : Array.isArray(res?.matches) ? res.matches : [];
          hitsFor.value = q;
        } catch {
          nameHits.value = [];
        }
      }, 220);
    });

    watch(cashBlocked, (blocked) => {
      if (!blocked) {
        if (scanError.value === BLOCK_MSG) scanError.value = "";
        if (payError.value === BLOCK_MSG) payError.value = "";
        if (foodError.value === BLOCK_MSG) foodError.value = "";
        focusScan();
      } else {
        resetWedge();
        nameHits.value = [];
        scanInput.value?.blur();
      }
    });

    // Al cambiar el método de pago, enfoca el campo de efectivo
    watch(payMethod, () => {
      if (showPayment.value && cashOpen.value) focusPayField();
    });

    function bumpQty(i, delta) {
      const line = store.platillosSeleccionados[i];
      if (!line) return;
      const next = Math.round((Number(line.quantity) + delta) * 1000) / 1000;
      if (next <= 0) {
        removeAt(i);
        return;
      }
      if (delta > 0 && !allowNoStock.value && stockGap(line, next) > 0) {
        scanError.value = noStockText(line);
        return;
      }
      line.quantity = next;
      selectedIdx.value = i;
      focusScan();
    }

    function removeAt(i) {
      const [gone] = store.platillosSeleccionados.splice(i, 1);
      if (gone && lastAdded.value && lastAdded.value.id === gone.id) lastAdded.value = null;
      if (!store.platillosSeleccionados.length) selectedIdx.value = -1;
      else selectedIdx.value = Math.min(i, store.platillosSeleccionados.length - 1);
      focusScan();
    }

    function removeSelected() {
      if (selectedIdx.value < 0) return;
      removeAt(selectedIdx.value);
    }

    /** Deja el ticket en blanco sin preguntar (después de cobrar o de ponerlo en espera). */
    function resetTicket() {
      store.platillosSeleccionados.splice(0, store.platillosSeleccionados.length);
      selectedIdx.value = -1;
      lastAdded.value = null;
      ticketDiscount.value = 0;
      discountDraft.value = 0;
      showMobileCart.value = false;
    }

    function clearCart() {
      if (lines.value.length && !window.confirm("¿Vaciar el ticket? Se quitarán todos los productos agregados.")) return;
      resetTicket();
      focusScan();
    }

    function openDiscount() {
      if (!lines.value.length) return;
      discountDraft.value = ticketDiscount.value;
      showDiscount.value = true;
    }
    function closeDiscount() {
      showDiscount.value = false;
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

    // —— Cantidad (F3): admite decimales para kilos, metros o litros ——
    function openQty(i = selectedIdx.value >= 0 ? selectedIdx.value : lines.value.length - 1) {
      if (i < 0 || !lines.value[i]) return;
      qtyIdx.value = i;
      selectedIdx.value = i;
      qtyDraft.value = formatQty(lines.value[i].quantity);
      qtyFresh.value = true;
      qtyErr.value = "";
      showQty.value = true;
    }
    function closeQty() {
      showQty.value = false;
      qtyErr.value = "";
      focusScan();
    }
    function setQtyDraft(value) {
      qtyDraft.value = String(value);
      qtyFresh.value = false;
      qtyErr.value = "";
    }
    function keypadPress(key) {
      let cur = qtyFresh.value ? "" : String(qtyDraft.value || "");
      qtyFresh.value = false;
      qtyErr.value = "";
      if (key === "del") cur = cur.slice(0, -1);
      else if (key === ".") {
        if (!cur.includes(".")) cur = (cur || "0") + ".";
      } else if (cur.length < 9) {
        cur = cur === "0" ? key : cur + key;
      }
      qtyDraft.value = cur;
    }
    function applyQty() {
      const line = store.platillosSeleccionados[qtyIdx.value];
      if (!line) {
        closeQty();
        return;
      }
      const value = Number(String(qtyDraft.value || "").replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) {
        qtyErr.value = "Escribe una cantidad mayor a 0.";
        return;
      }
      if (value > 99999) {
        qtyErr.value = "La cantidad es demasiado grande.";
        return;
      }
      if (value > Number(line.quantity) && !allowNoStock.value && stockGap(line, value) > 0) {
        qtyErr.value = noStockText(line);
        return;
      }
      line.quantity = Math.round(value * 1000) / 1000;
      selectedIdx.value = qtyIdx.value;
      closeQty();
    }

    // —— Artículo varios (Ins): venta sin código, no toca inventario ——
    function openMisc(prefill = "") {
      if (cashBlocked.value) return;
      const text = String(prefill || "").trim();
      const asNumber = Number(text.replace(",", "."));
      miscForm.name = text && !Number.isFinite(asNumber) ? text.slice(0, 60) : "";
      miscForm.price = text && Number.isFinite(asNumber) && asNumber > 0 ? asNumber : "";
      miscForm.qty = 1;
      miscErr.value = "";
      showMisc.value = true;
    }
    function closeMisc() {
      showMisc.value = false;
      miscErr.value = "";
      focusScan();
    }
    function addMisc() {
      const price = round2(miscForm.price);
      const qty = Number(String(miscForm.qty || "").replace(",", "."));
      if (!(price > 0)) {
        miscErr.value = "Escribe el precio.";
        return;
      }
      if (!(qty > 0)) {
        miscErr.value = "La cantidad debe ser mayor a 0.";
        return;
      }
      const item = {
        id: `misc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: String(miscForm.name || "").trim() || "Varios",
        price,
        priceIncludesTax: true,
        isMisc: true,
        barcode: "",
      };
      showMisc.value = false;
      clearScanField();
      addProduct(item, Math.round(qty * 1000) / 1000, { weighed: true });
    }
    function missingToMisc() {
      missingCode.value = "";
      openMisc();
    }

    // —— Tickets en espera (F6): se guardan en este equipo ——
    function heldKey() {
      return `timber_pos_held_${authStore.tenantId || "local"}`;
    }
    function loadHeld() {
      try {
        const list = JSON.parse(localStorage.getItem(heldKey()) || "[]");
        return Array.isArray(list) ? list.filter((t) => t && Array.isArray(t.lines)) : [];
      } catch {
        return [];
      }
    }
    function saveHeld() {
      try {
        localStorage.setItem(heldKey(), JSON.stringify(heldTickets.value));
      } catch {
        /* sin espacio o almacenamiento bloqueado: la lista sigue en memoria */
      }
    }
    function holdTicket() {
      if (!lines.value.length) {
        openHeld();
        return;
      }
      heldTickets.value = [
        {
          id: `h${Date.now().toString(36)}`,
          at: Date.now(),
          discount: ticketDiscount.value || 0,
          lines: JSON.parse(JSON.stringify(lines.value)),
        },
        ...heldTickets.value,
      ].slice(0, 20);
      saveHeld();
      resetTicket();
      msg.value = "";
      showHeld.value = false;
      focusScan();
    }
    function openHeld() {
      showMobileCart.value = false;
      showHeld.value = true;
    }
    function closeHeld() {
      showHeld.value = false;
      focusScan();
    }
    function resumeHeld(id) {
      const ticket = heldTickets.value.find((t) => t.id === id);
      if (!ticket) return;
      const rest = heldTickets.value.filter((t) => t.id !== id);
      if (lines.value.length) {
        rest.unshift({
          id: `h${Date.now().toString(36)}`,
          at: Date.now(),
          discount: ticketDiscount.value || 0,
          lines: JSON.parse(JSON.stringify(lines.value)),
        });
      }
      heldTickets.value = rest;
      saveHeld();
      resetTicket();
      store.platillosSeleccionados.push(...ticket.lines);
      ticketDiscount.value = Number(ticket.discount) || 0;
      selectedIdx.value = ticket.lines.length - 1;
      msg.value = "";
      showHeld.value = false;
      focusScan();
    }
    function dropHeld(id) {
      if (!window.confirm("¿Descartar este ticket en espera?")) return;
      heldTickets.value = heldTickets.value.filter((t) => t.id !== id);
      saveHeld();
    }
    function heldTotal(t) {
      return cartTotals(t.lines, { discountPercent: t.discount || 0, taxRate: TAX_RATE.value }).total;
    }
    function heldItems(t) {
      return t.lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    }
    function heldPreview(t) {
      const names = t.lines.slice(0, 3).map((l) => l.name);
      return names.join(", ") + (t.lines.length > 3 ? ` y ${t.lines.length - 3} más` : "");
    }
    function heldTime(at) {
      try {
        return storeClock(at, venueStore.timezone);
      } catch {
        return "";
      }
    }

    function openPriceCheck() {
      showPriceCheck.value = true;
    }
    function closePriceCheck() {
      showPriceCheck.value = false;
      priceCode.value = "";
      priceResult.value = null;
      priceErr.value = "";
      focusScan();
    }
    function addFromPriceCheck() {
      const product = priceResult.value;
      closePriceCheck();
      if (product) addProduct(product);
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
        const res = await lookupFoodSmart(code);
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

    async function finalizeOrder() {
      if (cashBlocked.value) {
        scanError.value = BLOCK_MSG;
        showMobileCart.value = false;
        return;
      }
      if (!lines.value.length || sending.value) return;
      payMethod.value = "cash";
      cardFee.value = cardFeeOn.value;
      payCashReceived.value = "";
      payCardAmount.value = "";
      payReference.value = "";
      payError.value = "";
      openingFloat.value = "";
      showMobileCart.value = false;
      showPayment.value = true;
      focusPayField();
      const wasOpen = cashOpen.value;
      await loadCashSession();
      if (cashOpen.value !== wasOpen) focusPayField();
    }

    function closePayment() {
      showPayment.value = false;
      payError.value = "";
      focusScan();
    }

    function setReceived(value) {
      payCashReceived.value = value;
      payError.value = "";
      nextTick(() => cashReceivedInput.value?.focus());
    }

    async function confirmPayment() {
      if (cashBlocked.value) {
        payError.value = BLOCK_MSG;
        return;
      }
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

      if (takesCash.value && payShort.value > 0) {
        payError.value = `Efectivo insuficiente. Faltan ${money(payShort.value)}`;
        return;
      }

      sending.value = true;
      msg.value = "";
      const clientSaleId = newClientSaleId();
      const items = lines.value.map((p) => ({
        foodId: p.isMisc ? null : p.id,
        name: p.name,
        price: p.price,
        quantity: p.quantity,
        saleUnit: unitOf(p),
        priceIncludesTax: Boolean(p.priceIncludesTax),
      }));
      const payload = {
        clientSaleId,
        tableId: null,
        tableName: "Mostrador",
        modality: "retail",
        status: "pending",
        discountPercent: ticketDiscount.value || 0,
        taxRate: TAX_RATE.value,
        items,
        paymentMethod: payMethod.value,
        cashReceived: takesCash.value ? Number(payCashReceived.value || 0) : undefined,
        cardAmount: payMethod.value === "split" ? Number(payCardAmount.value || 0) : undefined,
        paymentReference:
          payMethod.value === "transfer" || payMethod.value === "other"
            ? String(payReference.value || "").trim().slice(0, 60) || undefined
            : undefined,
        cardExtraIva: cardFeeAmount.value > 0,
        cardExtraTax: cardFeeAmount.value,
        soldAt: new Date().toISOString(),
        subtotal: Number(totals.value?.subtotal || 0),
        subtotalNet: Number(totals.value?.subtotalNet || 0),
        discountAmount: Number(totals.value?.discountAmount || 0),
        tax: Number(tax.value || 0),
        total: Number(chargeTotal.value || 0),
        change: Number(payChange.value || 0),
      };
      try {
        let order;
        let offline = false;
        try {
          order = await apiService.syncSale({ ...payload, offline: false });
        } catch (error) {
          if (!isNetworkError(error)) throw error;
          await queueSale({ ...payload, offline: true });
          order = { id: clientSaleId };
          offline = true;
        }
        // Refleja la venta en las existencias que se ven en pantalla
        if (offline || inventoryOn.value) {
          for (const item of items) {
            if (!item.foodId) continue;
            const row = pickFoods.value.find((p) => String(p.id) === String(item.foodId));
            if (row) {
              row.stock = (Number(row.stock) || 0) - Number(item.quantity || 0);
            }
          }
        }

        const cambio = payChange.value;
        lastTicketId.value = order.id;
        lastTicketOffline.value = offline;
        showPayment.value = false;
        resetTicket();
        focusScan();
        const folio = String(order.id || "").slice(-6).toUpperCase();
        msg.value = offline
          ? (cambio > 0
            ? `Ticket ${folio} cobrado sin internet · Cambio: ${money(cambio)} · se sincroniza al volver`
            : `Ticket ${folio} cobrado sin internet · se sincroniza al volver`)
          : (cambio > 0
            ? `Ticket ${folio} cobrado · Cambio: ${money(cambio)}`
            : `Ticket ${folio} cobrado`);
        const cashSale = payload.paymentMethod === "cash" || payload.paymentMethod === "split";
        printReceipt(
          offline
            ? saleToPrintOrder({ clientSaleId, payload, status: "pending", createdAt: Date.now() })
            : { ...order, offlinePending: false },
          offline,
          cashSale
        );
        if (!offline) flushOfflineSales();
      } catch (error) {
        payError.value =
          (typeof error.response?.data === "string" && error.response.data) ||
          error.response?.data?.message ||
          error.message ||
          "Error al registrar la venta.";
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
      if (
        showMenuForm.value ||
        showDiscount.value ||
        showMagic.value ||
        showPayment.value ||
        showQty.value ||
        showWeigh.value ||
        showMisc.value ||
        showHeld.value
      ) {
        return;
      }
      if (showPriceCheck.value) {
        priceCode.value = clean;
        if (priceInput.value) priceInput.value.value = clean;
        runPriceCheck();
        return;
      }
      // Respeta "3*" escrito en el buscador antes de escanear
      const pre = parseQtyPrefix(scanInput.value?.value || scanCode.value || "");
      const prefix = pre.hasQty && (!pre.rest || pre.rest === clean) ? `${pre.qty}*` : "";
      clearScanField();
      applyScannedCode(prefix + clean);
    }

    function captureWedge(e) {
      if (mode.value !== "pos") return;
      if (cashBlocked.value && !showPriceCheck.value) return;
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

    const anyDialog = computed(() =>
      Boolean(
        showPriceCheck.value ||
          showDiscount.value ||
          showFoodForm.value ||
          showMenuForm.value ||
          showMagic.value ||
          showPayment.value ||
          showQty.value ||
          showWeigh.value ||
          showMisc.value ||
          showHeld.value ||
          missingCode.value
      )
    );

    /** Esc: cierra lo que esté encima; si no hay nada, limpia la búsqueda. */
    function closeTopLayer() {
      if (missingCode.value) dismissMissing();
      else if (showWeigh.value) closeWeigh();
      else if (showQty.value) closeQty();
      else if (showMisc.value) closeMisc();
      else if (showHeld.value) closeHeld();
      else if (showDiscount.value) closeDiscount();
      else if (showPriceCheck.value) closePriceCheck();
      else if (showPayment.value) {
        if (!sending.value && !cashBusy.value) closePayment();
      } else if (showMobileCart.value) showMobileCart.value = false;
      else if (scanCode.value) clearSearch();
      else return false;
      return true;
    }

    function onHotkey(e) {
      captureWedge(e);
      if (e.defaultPrevented) return;
      if (mode.value !== "pos") return;
      if (e.key === "Escape") {
        if (showFoodForm.value || showMenuForm.value || showMagic.value) return;
        if (closeTopLayer()) e.preventDefault();
        return;
      }
      if (showPayment.value && e.key === "F12") {
        e.preventDefault();
        if (cashOpen.value) confirmPayment();
        else openCashFromPay();
        return;
      }
      if (anyDialog.value) return;
      const tag = (e.target && e.target.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (e.key === "F2") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "F3") {
        e.preventDefault();
        openQty();
      } else if (e.key === "F4") {
        e.preventDefault();
        openPriceCheck();
      } else if (e.key === "F6") {
        e.preventDefault();
        if (lines.value.length) holdTicket();
        else openHeld();
      } else if (e.key === "F9") {
        e.preventDefault();
        openDiscount();
      } else if (e.key === "F12") {
        e.preventDefault();
        finalizeOrder();
      } else if (e.key === "Insert") {
        e.preventDefault();
        openMisc();
      } else if (typing) {
        return;
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        moveSelection(e.key === "ArrowDown" ? 1 : -1);
      } else if ((e.key === "+" || e.key === "-") && selectedIdx.value >= 0) {
        e.preventDefault();
        bumpQty(selectedIdx.value, e.key === "+" ? 1 : -1);
      }
    }

    async function seedStarter() {
      if (cashBlocked.value) {
        seedErr.value = BLOCK_MSG;
        return;
      }
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
        lowStockItems.value = (pickFoods.value || []).filter(
          (p) => Number(p.stock || 0) <= Number(p.lowStockThreshold || 5)
        );
      }
    }

    async function fetchMenus() {
      try {
        menus.value = (await apiService.getAllMenus()) || [];
        if (mode.value === "manage" && menus.value[0]) loadMenuProducts(menus.value[0].id);
        pickFoods.value = (await apiService.getAllFoods()) || [];
        try {
          suppliers.value = (await apiService.getSuppliers()) || [];
        } catch {
          suppliers.value = [];
        }
        // Si el caché local falla, el catálogo que ya llegó del servidor se queda en pantalla
        await saveCatalog(authStore.tenantId, {
          foods: pickFoods.value,
          menus: menus.value,
        }).catch(() => {});
      } catch (error) {
        if (isNetworkError(error)) {
          const cached = await loadCatalog(authStore.tenantId);
          menus.value = cached.menus || [];
          pickFoods.value = cached.foods || [];
        } else {
          menus.value = [];
          pickFoods.value = [];
        }
      }
      try {
        const pending = await listPending(authStore.tenantId);
        pickFoods.value = applyPendingStock(pickFoods.value, pending);
      } catch {
        /* ignore */
      }
      fetchLowStock();
    }

    async function loadMenuProducts(menuId) {
      selectedMenuId.value = menuId;
      try {
        const menu = await apiService.getMenuById(menuId);
        productos.value = Array.isArray(menu.foods) ? menu.foods : [];
      } catch (error) {
        if (isNetworkError(error)) {
          productos.value = (pickFoods.value || []).filter(
            (p) => String(p.menuId || "") === String(menuId)
          );
        } else {
          productos.value = [];
        }
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
      catFilter.value = created.id;
    }

    async function ensureSuppliers() {
      if (suppliers.value.length) return;
      try {
        suppliers.value = (await apiService.getSuppliers()) || [];
      } catch {
        suppliers.value = [];
      }
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
      foodForm.tracksExpiry = Boolean(producto.tracksExpiry);
      foodForm.saleUnit = unitOf(producto);
      foodForm.supplierIds = Array.isArray(producto.supplierIds) ? [...producto.supplierIds] : [];
      foodForm.menuId = producto.menuId || selectedMenuId.value || menus.value[0]?.id || "";
      showFoodForm.value = true;
      ensureSuppliers();
    }

    function duplicateFood() {
      const src = editingFood.value;
      if (!src) return;
      const copy = { ...foodForm, supplierIds: [...foodForm.supplierIds] };
      closeFoodForm();
      Object.assign(foodForm, copy, { name: `${copy.name} (copia)`, barcode: "", stock: 0 });
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
      foodForm.menuId = catFilter.value || selectedMenuId.value;
      showFoodForm.value = true;
      ensureSuppliers();
    }

    async function openMagic() {
      if (cashBlocked.value) return;
      await ensureSuppliers();
      showMagic.value = true;
    }

    function onMagicManual() {
      showMagic.value = false;
      openNewFood();
    }

    async function onMagicApplied() {
      await fetchVenueSettings().catch(() => {});
      suppliers.value = [];
      await ensureSuppliers();
      // Recarga todo el catálogo: precios, costos y existencias cambiaron
      await fetchMenus();
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
      foodForm.tracksExpiry = false;
      foodForm.saleUnit = "pz";
      foodForm.supplierIds = [];
      foodForm.menuId = "";
      foodError.value = "";
      addAfterSave.value = false;
      pendingBarcode.value = "";
      pendingIntent.value = "sale";
    }

    async function createFood() {
      foodError.value = "";
      if (duplicateCode.value) {
        foodError.value = `El código ${String(foodForm.barcode).trim()} ya es de ${duplicateCode.value.name}. Usa otro o deja el campo vacío.`;
        return;
      }
      if (cashBlocked.value && inventoryOn.value) {
        const prevStock = editingFood.value ? Number(editingFood.value.stock) || 0 : 0;
        if ((Number(foodForm.stock) || 0) !== prevStock) {
          foodError.value = "No puedes modificar el stock hasta hacer el corte de caja.";
          return;
        }
      }

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
        menuId: foodForm.menuId && foodForm.menuId !== "__new" ? foodForm.menuId : selectedMenuId.value,
        stock: Number(foodForm.stock) || 0,
        lowStockThreshold: Number(foodForm.lowStockThreshold) || 5,
        tracksExpiry: Boolean(foodForm.tracksExpiry),
        saleUnit: foodForm.saleUnit,
        supplierIds: [...foodForm.supplierIds],
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
        const pidx = pickFoods.value.findIndex((p) => p.id === saved.id);
        if (pidx >= 0) pickFoods.value[pidx] = saved;
        else pickFoods.value.push(saved);
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
      if (cashBlocked.value) {
        foodError.value = BLOCK_MSG;
        return;
      }
      const name = editingFood.value.name || "este producto";
      if (!window.confirm(`¿Seguro que quieres quitar “${name}” del catálogo?`)) return;
      await apiService.deleteFood(editingFood.value.id);
      productos.value = productos.value.filter((p) => p.id !== editingFood.value.id);
      pickFoods.value = pickFoods.value.filter((p) => p.id !== editingFood.value.id);
      closeFoodForm();
    }

    watch(
      () => route.name,
      (name) => {
        mode.value = name === "products" ? "manage" : "pos";
        loadCashSession();
        if (mode.value === "pos") focusScan();
        else if (menus.value[0] && !selectedMenuId.value) loadMenuProducts(menus.value[0].id);
      }
    );

    watch(showPriceCheck, (v) => {
      if (v) nextTick(() => priceInput.value?.focus());
    });
    watch(showDiscount, (v) => {
      if (v) nextTick(() => discountInput.value?.focus());
    });
    watch(showMisc, (v) => {
      if (v) nextTick(() => miscPriceInput.value?.focus());
    });
    watch(showQty, (v) => {
      // En pantallas táctiles se usa el teclado numérico de la ventana, no el del sistema
      const touch = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
      if (!v || touch) return;
      nextTick(() => {
        qtyInput.value?.focus();
        qtyInput.value?.select();
      });
    });

    function onWindowFocus() {
      loadCashSession();
      focusScan();
    }

    onMounted(async () => {
      await fetchMenus();
      loadCashSession();
      compactPos.value = isCompactPos();
      compactMq = window.matchMedia("(max-width: 767.98px)");
      if (compactMq.addEventListener) compactMq.addEventListener("change", onCompactChange);
      else compactMq.addListener(onCompactChange);
      if (compactPos.value) scanInput.value?.blur();
      else focusScan();
      window.addEventListener("keydown", onHotkey);
      window.addEventListener("focus", onWindowFocus);
      // Báscula de esta caja: se reconecta sola si ya tiene permiso
      if (scaleStore.enabled) connectScale().catch(() => {});
    });

    onUnmounted(() => {
      stopScaleWatch();
      window.removeEventListener("keydown", onHotkey);
      window.removeEventListener("focus", onWindowFocus);
      if (compactMq) {
        if (compactMq.removeEventListener) compactMq.removeEventListener("change", onCompactChange);
        else compactMq.removeListener(onCompactChange);
      }
      clearTimeout(flashTimer);
      clearTimeout(bumpTimer);
      clearTimeout(termTimer);
      clearTimeout(searchTimer);
      clearTimeout(priceTimer);
      clearTimeout(wedgeTimer);
    });

    return {
      // Catálogo
      mode,
      menus,
      productos,
      selectedMenuId,
      seeding,
      seedErr,
      seedStarter,
      businessName,
      showMenuForm,
      showFoodForm,
      showMagic,
      openMagic,
      aiEnabled,
      onMagicApplied,
      onMagicManual,
      openNewFood,
      menuForm,
      foodForm,
      foodPricePreview,
      foodError,
      editingFood,
      inventoryOn,
      TAX_RATE,
      taxPercent,
      duplicateCode,
      catalogSearch,
      viewMode,
      lowStockItems,
      suppliers,
      catFilter,
      statusFilter,
      statusFilters,
      sortBy,
      catLimit,
      catalogStats,
      catalogRows,
      visibleRows,
      catalogPlaceholder,
      namePlaceholder,
      descriptionLabel,
      descriptionPlaceholder,
      onCatalogEnter,
      newFromSearch,
      resetCatalogFilters,
      menuName,
      catCount,
      marginPct,
      marginTone,
      codeOf,
      generateCode,
      foodMarkup,
      onFormMenuChange,
      duplicateFood,
      showCats,
      catDrafts,
      menuToDelete,
      moveTarget,
      catBusy,
      catErr,
      openCats,
      renameMenu,
      askDeleteMenu,
      confirmDeleteMenu,
      exportCatalog,
      goMode,
      loadMenuProducts,
      createMenu,
      cancelMenuForm,
      createFood,
      editFood,
      closeFoodForm,
      deleteFood,
      // Venta: buscador y catálogo
      scanInput,
      scanCode,
      scanError,
      scanFlash,
      scanPlaceholder,
      status,
      onScanEnter,
      onScanKeydown,
      clearSearch,
      pickFoods,
      pickMenuId,
      pickList,
      pickTotal,
      searching,
      debouncedTerm,
      results,
      resultsTotal,
      resultsEl,
      activeHit,
      highlight,
      pickResult,
      registerFromSearch,
      hueOf,
      hasImg,
      brokenImgs,
      isOut,
      stockTone,
      stockLabel,
      qtyInCart,
      compactPos,
      // Venta: ticket
      lines,
      linesEl,
      itemCount,
      selectedIdx,
      selectLine,
      bumpId,
      totals,
      tax,
      total,
      ticketDiscount,
      lastAdded,
      msg,
      lastTicketId,
      reprintHref,
      showMobileCart,
      mobileHint,
      addProduct,
      bumpQty,
      removeAt,
      removeSelected,
      clearCart,
      lineGross,
      lineUnit,
      SALE_UNITS,
      formatQtyUnit,
      perUnit,
      unitOf,
      showWeigh,
      weighItem,
      weighMode,
      weighDraft,
      weighErr,
      weighInput,
      weighUnit,
      weighQty,
      weighAmount,
      closeWeigh,
      resetWeighDraft,
      weighKey,
      applyWeigh,
      weighByScale,
      scaleHasData,
      scaleRead,
      weighHint,
      printIssue,
      printerStore,
      directPrinting,
      retryPrint,
      printLastInBrowser,
      money,
      moneyShort,
      formatQty,
      initial,
      // Diálogos de venta
      showPriceCheck,
      priceInput,
      priceCode,
      priceResult,
      priceErr,
      openPriceCheck,
      closePriceCheck,
      runPriceCheck,
      addFromPriceCheck,
      missingCode,
      missingIntent,
      dismissMissing,
      startAddMissing,
      missingToMisc,
      showDiscount,
      discountDraft,
      discountInput,
      discountPreview,
      openDiscount,
      closeDiscount,
      applyDiscount,
      clearDiscount,
      showQty,
      qtyInput,
      qtyDraft,
      qtyFresh,
      qtyErr,
      qtyLine,
      qtyPreview,
      qtyPresets,
      openQty,
      closeQty,
      setQtyDraft,
      keypadPress,
      applyQty,
      showMisc,
      miscForm,
      miscErr,
      miscPriceInput,
      openMisc,
      closeMisc,
      addMisc,
      showHeld,
      heldTickets,
      openHeld,
      closeHeld,
      holdTicket,
      resumeHeld,
      dropHeld,
      heldTotal,
      heldItems,
      heldPreview,
      heldTime,
      // Cobro
      sending,
      finalizeOrder,
      showPayment,
      payMethods,
      payMethod,
      payReference,
      cardFeeOn,
      cardFee,
      cardFeeAmount,
      cardFeeFor,
      feePctText,
      chargeTotal,
      payCashReceived,
      payCardAmount,
      payChange,
      payShort,
      payError,
      payCashPortion,
      quickCash,
      setReceived,
      payConfirmBtn,
      openingInput,
      cashReceivedInput,
      closePayment,
      confirmPayment,
      cashOpen,
      cashOpenWarning,
      cashBlocked,
      openingFloat,
      cashBusy,
      openCashFromPay,
      venueStore,
      offlineStore,
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

/* ═══════════ Venta ═══════════ */
.sale {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(22rem, 28rem);
  grid-template-rows: minmax(0, 1fr);
  gap: 0.75rem;
  padding: 0.75rem;
}

.browse,
.ticket {
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  box-shadow: var(--timber-shadow);
  overflow: hidden;
}

kbd {
  display: inline-grid;
  place-items: center;
  min-width: 1.45rem;
  height: 1.3rem;
  padding: 0 0.3rem;
  border: 1px solid var(--timber-line);
  border-bottom-width: 2px;
  border-radius: 0.3rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font: 700 0.66rem/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  letter-spacing: 0;
}

/* —— Buscador —— */
.finder {
  flex-shrink: 0;
  padding: 0.85rem 0.9rem 0.55rem;
  border-bottom: 1px solid var(--timber-line);
}
.finder-row {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
}
.finder-box {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
}
.finder-ico {
  position: absolute;
  left: 0.95rem;
  color: var(--timber-muted);
  pointer-events: none;
}
.scan-input {
  width: 100%;
  min-height: 3.3rem;
  padding: 0 2.9rem 0 2.9rem;
  border: 2px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-size: 1.12rem;
  font-weight: 600;
  -webkit-appearance: none;
  appearance: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.scan-input::placeholder {
  color: var(--timber-muted);
  font-weight: 500;
}
.scan-input::-webkit-search-cancel-button {
  display: none;
}
.scan-input:focus {
  outline: none;
  border-color: var(--timber-primary);
  background: var(--timber-panel);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--timber-primary) 16%, transparent);
}
.finder.flash .scan-input {
  border-color: var(--timber-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--timber-success) 22%, transparent);
}
.finder.err .scan-input {
  border-color: var(--timber-danger);
}
.finder-clear {
  position: absolute;
  right: 0.45rem;
  width: 2.3rem;
  height: 2.3rem;
  min-height: 0;
  border: none;
  border-radius: 0.6rem;
  background: transparent;
  color: var(--timber-muted);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.finder-clear:hover {
  background: var(--timber-surface);
  color: var(--timber-ink);
}
.tool {
  flex: 0 0 auto;
  min-width: 4.6rem;
  padding: 0 0.7rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.tool:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--timber-primary) 45%, var(--timber-line));
  color: var(--timber-primary);
}
.tool:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.finder-status {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 1.25rem;
  margin: 0.5rem 0.1rem 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--timber-muted);
}
.finder-status .dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.finder-status-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.finder-status.tone-idle .dot { background: var(--timber-success); }
.finder-status.tone-ok { color: var(--timber-success); }
.finder-status.tone-warn { color: var(--timber-warning); }
.finder-status.tone-err { color: var(--timber-danger); }
.finder-status.tone-busy { color: var(--timber-primary); }

/* —— Categorías —— */
.chips {
  flex-shrink: 0;
  display: flex;
  gap: 0.4rem;
  padding: 0.65rem 0.9rem;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--timber-line);
}
.chips::-webkit-scrollbar { display: none; }
.chip {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  min-height: 2.35rem;
  padding: 0 0.95rem;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.86rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}
.chip:hover:not(.on) {
  background: var(--timber-panel-elevated);
}
.chip.on {
  background: var(--timber-ink);
  border-color: transparent;
  color: var(--timber-panel);
}
.chip-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: hsl(var(--hue, 215) 65% 52%);
}

/* —— Mosaico —— */
.tiles {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  /* max-content: con scroll, las filas no se encogen y no recortan el nombre */
  grid-auto-rows: max-content;
  align-content: start;
  gap: 0.6rem;
  padding: 0.9rem;
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-height: 8.4rem;
  padding: 0.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}
.tile:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--timber-primary) 45%, var(--timber-line));
  box-shadow: 0 8px 20px color-mix(in srgb, var(--timber-primary) 12%, transparent);
  transform: translateY(-1px);
}
.tile:active:not(:disabled) { transform: scale(0.98); }
.tile.in {
  border-color: var(--timber-primary);
  background: color-mix(in srgb, var(--timber-primary) 7%, var(--timber-panel-elevated));
}
.tile.out .tile-name,
.tile.out .tile-price { opacity: 0.6; }
.tile:disabled { opacity: 0.45; cursor: not-allowed; }
.tile-name {
  flex: 1 0 auto;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.tile-foot {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.1rem 0.4rem;
}
.tile-price {
  font-size: 1.12rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.tiles-more {
  grid-column: 1 / -1;
  margin: 0.25rem 0 0;
  text-align: center;
  font-size: 0.82rem;
  color: var(--timber-muted);
}

.avatar {
  position: relative;
  width: 2.65rem;
  height: 2.65rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.7rem;
  background: hsl(var(--hue, 215) 80% 94%);
  color: hsl(var(--hue, 215) 55% 34%);
  font-size: 1.05rem;
  font-weight: 800;
}
html[data-theme="dark"] .avatar {
  background: hsl(var(--hue, 215) 32% 22%);
  color: hsl(var(--hue, 215) 75% 78%);
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.badge {
  position: absolute;
  top: -0.45rem;
  right: -0.55rem;
  min-width: 1.45rem;
  height: 1.45rem;
  padding: 0 0.3rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  box-shadow: 0 0 0 2px var(--timber-panel-elevated);
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.stock {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--timber-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.stock.low { color: var(--timber-warning); }
.stock.out { color: var(--timber-danger); }

/* —— Resultados —— */
.results {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.6rem 0.8rem;
}
.results-head {
  margin: 0.35rem 0.4rem 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--timber-muted);
}
.results-head strong { color: var(--timber-ink); }
.result {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 0.8rem;
  background: transparent;
  color: var(--timber-ink);
  text-align: left;
  cursor: pointer;
}
.result:hover:not(:disabled) { background: var(--timber-panel-elevated); }
.result.active {
  background: color-mix(in srgb, var(--timber-primary) 9%, var(--timber-panel));
  border-color: color-mix(in srgb, var(--timber-primary) 45%, transparent);
}
.result:disabled { opacity: 0.45; cursor: not-allowed; }
.result.out .result-name,
.result.out .result-price { opacity: 0.65; }
.result-main {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.12rem;
}
.result-name {
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.25;
}
.result-name mark {
  padding: 0 0.05rem;
  border-radius: 0.2rem;
  background: color-mix(in srgb, var(--timber-accent) 32%, transparent);
  color: inherit;
}
.result-sub {
  font-size: 0.78rem;
  color: var(--timber-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.result-side {
  flex-shrink: 0;
  display: grid;
  justify-items: end;
  gap: 0.08rem;
  min-width: 5.5rem;
}
.result-price {
  font-size: 1.08rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.in-ticket {
  font-size: 0.72rem;
  font-style: normal;
  font-weight: 700;
  color: var(--timber-primary);
}

/* —— Estados vacíos —— */
.empty-state {
  grid-column: 1 / -1;
  flex: 1 1 auto;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 0.35rem;
  padding: 2rem 1.25rem;
  text-align: center;
  color: var(--timber-muted);
  font-size: 0.9rem;
}
.empty-state p { margin: 0; max-width: 22rem; line-height: 1.4; }
.empty-state strong { color: var(--timber-ink); }
.big-ico {
  box-sizing: content-box;
  padding: 0.8rem;
  margin-bottom: 0.35rem;
  border-radius: 1rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.big-ico.warn {
  background: var(--timber-warning-soft);
  color: var(--timber-warning);
}
.empty-acts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 0.5rem;
}
.soft-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 2.6rem;
  padding: 0 1rem;
  border: 1px solid color-mix(in srgb, var(--timber-primary) 30%, var(--timber-line));
  border-radius: 0.75rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  font-size: 0.88rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}
.soft-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.keys-legend {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin: 0;
  padding: 0.55rem 0.9rem;
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  color: var(--timber-muted);
  font-size: 0.74rem;
  font-weight: 600;
}
.keys-legend span {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}
.keys-legend kbd + kbd { margin-left: -0.05rem; }
.keys-legend kbd:last-of-type { margin-right: 0.15rem; }

/* —— Ticket —— */
.ticket-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.85rem 0.9rem 0.75rem;
  border-bottom: 1px solid var(--timber-line);
}
.ticket-title {
  flex: 1 1 auto;
  min-width: 0;
}
.ticket-title h2 {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.ticket-title p {
  margin: 0.05rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--timber-muted);
}
.head-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2.4rem;
  padding: 0 0.7rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.7rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.head-btn:hover:not(:disabled) { background: var(--timber-panel-elevated); }
.head-btn.has {
  border-color: color-mix(in srgb, var(--timber-accent) 55%, var(--timber-line));
}
.head-btn b {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--timber-accent);
  color: #1a1208;
  font-size: 0.7rem;
}
.head-btn.icon {
  width: 2.4rem;
  padding: 0;
  justify-content: center;
  color: var(--timber-muted);
}
.head-btn.danger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--timber-danger) 40%, var(--timber-line));
  color: var(--timber-danger);
}
.head-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.lines {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.line {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "main imp"
    "ctrl ctrl";
  gap: 0.4rem 0.75rem;
  padding: 0.6rem 0.7rem 0.6rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 0.75rem;
  cursor: pointer;
}
.line:hover { background: var(--timber-panel-elevated); }
.line.on {
  background: color-mix(in srgb, var(--timber-primary) 8%, var(--timber-panel));
  border-color: color-mix(in srgb, var(--timber-primary) 35%, transparent);
}
.line.on::before {
  content: "";
  position: absolute;
  left: 0.3rem;
  top: 0.65rem;
  bottom: 0.65rem;
  width: 3px;
  border-radius: 3px;
  background: var(--timber-primary);
}
.line.bump { animation: line-bump 0.7s ease; }
@keyframes line-bump {
  0% { background: color-mix(in srgb, var(--timber-success) 24%, var(--timber-panel)); }
}
.line-main {
  grid-area: main;
  min-width: 0;
  display: grid;
  gap: 0.12rem;
}
.line-name {
  font-size: 0.93rem;
  font-weight: 700;
  line-height: 1.25;
}
.line-meta {
  font-size: 0.78rem;
  color: var(--timber-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.line-imp {
  grid-area: imp;
  align-self: start;
  font-size: 1rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.line-ctrl {
  grid-area: ctrl;
  display: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.line.on .line-ctrl { display: flex; }
.stepper {
  display: inline-flex;
  align-items: stretch;
  border: 1px solid var(--timber-line);
  border-radius: 0.7rem;
  background: var(--timber-panel);
  overflow: hidden;
}
.stepper button {
  width: 2.5rem;
  min-height: 2.4rem;
  border: none;
  background: transparent;
  color: var(--timber-ink);
  font-size: 1.15rem;
  font-weight: 800;
  cursor: pointer;
}
.stepper button:hover { background: var(--timber-surface); }
.stepper .stepper-val {
  width: auto;
  min-width: 3.4rem;
  padding: 0 0.6rem;
  border-left: 1px solid var(--timber-line);
  border-right: 1px solid var(--timber-line);
  font-size: 0.98rem;
  font-variant-numeric: tabular-nums;
}
.line-x {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-height: 2.4rem;
  padding: 0 0.65rem;
  border: none;
  border-radius: 0.65rem;
  background: transparent;
  color: var(--timber-danger);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.line-x:hover { background: var(--timber-danger-soft); }

.ticket-empty { padding: 1.5rem 1.25rem; }
.sale-done {
  display: grid;
  justify-items: center;
  gap: 0.6rem;
  width: min(100%, 21rem);
  padding: 1.1rem 1rem;
  border-radius: 1rem;
  background: var(--timber-success-soft);
  color: var(--timber-success);
}
.sale-done p {
  font-weight: 700;
  color: var(--timber-ink);
}
.sale-done .soft-btn {
  background: var(--timber-panel);
}
.print-issue {
  display: grid;
  gap: 0.5rem;
  padding: 0.7rem 0.8rem;
  border-radius: 0.8rem;
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
  text-align: center;
}
.print-issue p {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 600;
}
.print-issue div {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.4rem;
}

.ticket-foot {
  flex-shrink: 0;
  display: grid;
  gap: 0.6rem;
  padding: 0.75rem 0.9rem 0.9rem;
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
}
.sums {
  display: grid;
  gap: 0.2rem;
  margin: 0;
}
.sums div {
  display: flex;
  justify-content: space-between;
  font-size: 0.86rem;
  font-variant-numeric: tabular-nums;
}
.sums dt,
.sums dd { margin: 0; }
.sums .muted { color: var(--timber-muted); }
.sums .disc {
  color: var(--timber-success);
  font-weight: 700;
}
.grand {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px dashed var(--timber-line);
}
.grand span {
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.grand strong {
  font-size: clamp(1.9rem, 2.8vw, 2.45rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.quick {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
}
.quick button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-height: 3.2rem;
  padding: 0.35rem 0.25rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}
.quick button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--timber-primary) 40%, var(--timber-line));
  color: var(--timber-primary);
}
.quick button.on {
  border-color: color-mix(in srgb, var(--timber-success) 55%, var(--timber-line));
  color: var(--timber-success);
}
.quick button:disabled { opacity: 0.4; cursor: not-allowed; }
.pay-btn {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 4rem;
  padding: 0 1.15rem;
  border: none;
  border-radius: 0.95rem;
  background: var(--timber-accent);
  color: #1a1208;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--timber-accent) 35%, transparent);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.pay-btn:hover:not(:disabled) { transform: translateY(-1px); }
.pay-btn span {
  font-size: 1.15rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.pay-btn strong {
  margin-left: auto;
  font-size: 1.3rem;
  font-variant-numeric: tabular-nums;
}
.pay-btn kbd {
  background: rgba(255, 255, 255, 0.4);
  border-color: rgba(26, 18, 8, 0.25);
  color: #1a1208;
}
.pay-btn:disabled {
  opacity: 0.45;
  box-shadow: none;
  cursor: not-allowed;
}

/* —— Barra de cobro (celular) —— */
.m-done {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  background: var(--timber-success-soft);
  color: var(--timber-success);
  font-size: 0.82rem;
  font-weight: 700;
}
.m-done span {
  flex: 1;
  min-width: 0;
  color: var(--timber-ink);
}
.m-done a {
  color: inherit;
  font-weight: 800;
}
.m-pay {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  background: var(--timber-panel);
  border-top: 1px solid var(--timber-line);
  box-shadow: 0 -10px 24px color-mix(in srgb, var(--timber-ink) 8%, transparent);
}
.m-pay-ticket {
  min-width: 0;
  min-height: 3.4rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel-elevated);
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.m-pay-count {
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.35rem;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  font-size: 0.86rem;
  font-weight: 800;
}
.m-pay-copy {
  display: grid;
  min-width: 0;
}
.m-pay-copy strong {
  font-size: 1.15rem;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
}
.m-pay-copy small {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--timber-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-pay-go {
  min-width: 7.5rem;
  min-height: 3.4rem;
  padding: 0 1.1rem;
  border: none;
  border-radius: 1rem;
  background: var(--timber-accent);
  color: #1a1208;
  font-size: 1.1rem;
  font-weight: 800;
  cursor: pointer;
}
.m-pay-go:disabled { opacity: 0.4; }
.ticket-scrim {
  position: fixed;
  inset: 0;
  z-index: 140;
  background: rgba(10, 18, 32, 0.5);
}

/* —— Aviso de caja abierta mucho tiempo —— */
.cash-warning-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.6rem;
  margin: 0.75rem 0.75rem 0;
  padding: 0.7rem 1rem;
  border: 1px solid color-mix(in srgb, var(--timber-warning) 40%, var(--timber-line));
  border-radius: 0.85rem;
  background: var(--timber-warning-soft);
  color: var(--timber-ink);
  font-size: 0.88rem;
  font-weight: 700;
  text-align: center;
}
.cash-warning-banner svg { color: var(--timber-warning); flex-shrink: 0; }
.cash-warning-banner a {
  color: var(--timber-warning);
  font-weight: 800;
  white-space: nowrap;
}

/* —— Diálogos de venta —— */
.dlg-bg {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(10, 18, 32, 0.55);
  backdrop-filter: blur(3px);
  animation: dlg-fade 0.15s ease;
}
.dlg {
  width: min(30rem, 100%);
  max-height: 94dvh;
  overflow-y: auto;
  display: grid;
  gap: 0.8rem;
  padding: 1.1rem 1.1rem calc(1.1rem + env(safe-area-inset-bottom, 0px));
  border: 1px solid var(--timber-line);
  border-radius: 1.25rem 1.25rem 0 0;
  background: var(--timber-panel);
  color: var(--timber-ink);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  animation: dlg-up 0.2s ease;
}
@keyframes dlg-fade {
  from { opacity: 0; }
}
@keyframes dlg-up {
  from { transform: translateY(12px); opacity: 0; }
}
.dlg-head {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}
.dlg-head > div {
  flex: 1 1 auto;
  min-width: 0;
}
.dlg-head h3 {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.dlg-head p {
  margin: 0.15rem 0 0;
  font-size: 0.86rem;
  line-height: 1.4;
  color: var(--timber-muted);
}
.dlg-ico {
  width: 2.6rem;
  height: 2.6rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.8rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.dlg-ico.accent {
  background: color-mix(in srgb, var(--timber-accent) 22%, var(--timber-panel));
  color: color-mix(in srgb, var(--timber-accent) 70%, var(--timber-ink));
}
.dlg-ico.warn {
  background: var(--timber-warning-soft);
  color: var(--timber-warning);
}
.dlg-x {
  width: 2.4rem;
  height: 2.4rem;
  min-height: 0;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 0.7rem;
  background: var(--timber-surface);
  color: var(--timber-ink);
  cursor: pointer;
}
.dlg-x:disabled { opacity: 0.4; cursor: not-allowed; }
.dlg-acts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
  gap: 0.5rem;
  margin-top: 0.15rem;
}
.dlg-stack {
  display: grid;
  gap: 0.45rem;
}
.dlg-err {
  margin: 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.7rem;
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
  font-size: 0.88rem;
  font-weight: 700;
}
.dlg-note {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.4;
  color: var(--timber-muted);
}
.dlg-note strong { color: var(--timber-ink); }
.dlg .field em {
  font-style: normal;
  font-weight: 500;
}
.field-pair {
  display: grid;
  grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
  gap: 0.6rem;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  min-height: 3.1rem;
  padding: 0 1rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 1rem;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
}
.btn:hover:not(:disabled) { background: var(--timber-panel-elevated); }
.btn.primary {
  border-color: transparent;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.btn.primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--timber-primary) 88%, #000);
}
.btn.accent {
  border-color: transparent;
  background: var(--timber-accent);
  color: #1a1208;
}
.btn.accent:hover:not(:disabled) {
  background: color-mix(in srgb, var(--timber-accent) 90%, #000);
}
.btn.accent kbd {
  background: rgba(255, 255, 255, 0.4);
  border-color: rgba(26, 18, 8, 0.25);
  color: #1a1208;
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  color: var(--timber-muted);
}
.btn.icon {
  width: 2.75rem;
  padding: 0;
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.inp:focus {
  outline: none;
  border-color: var(--timber-primary);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--timber-primary) 15%, transparent);
}
.inp.big {
  min-height: 3.6rem;
  font-size: 1.45rem;
  font-weight: 800;
}
.inp.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
}
.inp.num::-webkit-inner-spin-button,
.inp.num::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.presets button {
  flex: 1 1 3.5rem;
  min-height: 2.6rem;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.presets button:hover { background: var(--timber-panel-elevated); }
.presets button.on {
  border-color: var(--timber-primary);
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.keypad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
}
.keypad button {
  min-height: 3.2rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.8rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-size: 1.35rem;
  font-weight: 800;
  cursor: pointer;
}
.keypad button:active { background: var(--timber-surface); }

.price-card {
  display: grid;
  justify-items: center;
  gap: 0.2rem;
  padding: 1rem;
  border-radius: 1rem;
  background: var(--timber-primary-soft);
  text-align: center;
}
.price-card-name {
  font-size: 1.05rem;
  font-weight: 800;
}
.price-card-price {
  font-size: 2.6rem;
  font-weight: 800;
  line-height: 1.1;
  color: var(--timber-primary);
  font-variant-numeric: tabular-nums;
}
.price-card-meta {
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--timber-muted);
  font-variant-numeric: tabular-nums;
}

.held-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
  max-height: 52dvh;
  overflow-y: auto;
}
.held-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel-elevated);
}
.held-info {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.05rem;
}
.held-info strong {
  font-size: 1.1rem;
  font-variant-numeric: tabular-nums;
}
.held-info span {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--timber-muted);
}
.held-info small {
  font-size: 0.78rem;
  color: var(--timber-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.held-list .btn {
  min-height: 2.75rem;
  font-size: 0.9rem;
}

/* Cobro */
.dlg.pay { width: min(34rem, 100%); }
.pay-total {
  display: grid;
  justify-items: center;
  gap: 0.1rem;
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
}
.pay-total span {
  font-size: 0.74rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.75;
}
.pay-total strong {
  font-size: clamp(2.3rem, 7vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  font-variant-numeric: tabular-nums;
}
.pay-total small {
  font-size: 0.78rem;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.pay-open {
  display: grid;
  gap: 0.65rem;
  padding: 0.85rem;
  border-radius: 0.9rem;
  background: var(--timber-warning-soft);
}
.pay-open p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}
.methods {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
}
.methods.two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.methods.two .method {
  min-height: 2.8rem;
}
.unit-picks {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.4rem;
}
.unit-pick {
  position: relative;
  display: grid;
  gap: 0.1rem;
  padding: 0.55rem 0.6rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.8rem;
  background: var(--timber-panel);
  cursor: pointer;
}
.unit-pick input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.unit-pick strong {
  font-size: 0.88rem;
}
.unit-pick small {
  font-size: 0.72rem;
  color: var(--timber-muted);
  line-height: 1.25;
}
.unit-pick.on {
  border-color: var(--timber-primary);
  background: color-mix(in srgb, var(--timber-primary) 9%, var(--timber-panel));
}
.unit-pick:focus-within {
  outline: 2px solid var(--timber-primary);
  outline-offset: 2px;
}
.unit-help {
  color: var(--timber-muted);
  font-size: 0.78rem;
}
@media (max-width: 767.98px) {
  .unit-picks { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.scale-panel {
  display: grid;
  justify-items: center;
  gap: 0.3rem;
  padding: 1rem 0.9rem 0.85rem;
  border: 2px solid var(--timber-primary);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--timber-primary) 7%, var(--timber-panel));
  text-align: center;
}
.scale-panel.mute,
.scale-panel.clear {
  border-color: var(--timber-warning);
  background: var(--timber-warning-soft);
}
.scale-panel.stable {
  border-color: var(--timber-success);
  background: var(--timber-success-soft);
}
.scale-hint {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}
.scale-panel.empty:not(.mute):not(.clear) .scale-hint {
  animation: scale-pulse 1.4s ease-in-out infinite;
}
@keyframes scale-pulse {
  50% { opacity: 0.45; }
}
.scale-kg {
  font-size: 2.6rem;
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.scale-amount {
  min-height: 1.2em;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.scale-bar {
  width: 100%;
  height: 0.4rem;
  border-radius: 99px;
  background: var(--timber-line);
  overflow: hidden;
}
.scale-bar i {
  display: block;
  height: 100%;
  background: var(--timber-success);
  transition: width 0.15s linear;
}
.scale-panel small {
  font-size: 0.78rem;
  color: var(--timber-muted);
}
@media (prefers-reduced-motion: reduce) {
  .scale-panel.empty .scale-hint { animation: none; }
}
.method {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 4.1rem;
  padding: 0.45rem 0.25rem;
  border: 1.5px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font-size: 0.8rem;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
}
.method input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.method.on {
  border-color: var(--timber-primary);
  background: color-mix(in srgb, var(--timber-primary) 9%, var(--timber-panel));
  color: var(--timber-primary);
}
.method:focus-within {
  outline: 2px solid var(--timber-primary);
  outline-offset: 2px;
}
.bills {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(4rem, 1fr));
  gap: 0.4rem;
}
.bill {
  min-width: 0;
  min-height: 2.8rem;
  padding: 0 0.25rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.75rem;
  background: var(--timber-panel-elevated);
  color: var(--timber-ink);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.bill:hover { border-color: color-mix(in srgb, var(--timber-success) 45%, var(--timber-line)); }
.bill.on {
  border-color: var(--timber-success);
  background: var(--timber-success-soft);
  color: var(--timber-success);
}
.change {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 0.9rem;
  background: var(--timber-success-soft);
  color: var(--timber-success);
}
.change span {
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.change strong {
  font-size: 1.85rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.change.short {
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
}
.change.zero {
  background: var(--timber-surface);
  color: var(--timber-muted);
}
.fee-row {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0.7rem 0.85rem;
  border: 1.5px solid color-mix(in srgb, var(--timber-primary) 35%, var(--timber-line));
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--timber-primary) 6%, var(--timber-panel));
  cursor: pointer;
}
.fee-row input { width: 1.25rem; height: 1.25rem; margin: 0.1rem 0 0; flex-shrink: 0; accent-color: var(--timber-primary); }
.fee-row span { display: grid; gap: 0.1rem; }
.fee-row strong { font-size: 0.95rem; }
.fee-row small { font-size: 0.8rem; color: var(--timber-muted); }
.pay-note {
  margin: 0;
  padding: 0.8rem 0.95rem;
  border-radius: 0.85rem;
  background: var(--timber-surface);
  font-size: 0.92rem;
  line-height: 1.4;
}

/* —— Celular —— */
@media (max-width: 767.98px) {
  .sale {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 0;
  }
  .browse {
    flex: 1 1 auto;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: var(--timber-surface);
  }
  .finder {
    padding: 0.6rem 0.75rem 0.4rem;
    background: var(--timber-panel);
  }
  .scan-input {
    min-height: 2.95rem;
    padding-left: 2.6rem;
    border-width: 1px;
    font-size: 1rem;
  }
  .finder-ico { left: 0.8rem; }
  .tool {
    min-width: 2.95rem;
    padding: 0;
  }
  .tool-label { display: none; }
  .finder-status { margin-top: 0.35rem; font-size: 0.78rem; }
  .finder-status.tone-idle { display: none; }
  .chips {
    padding: 0.5rem 0.75rem;
    background: var(--timber-panel);
  }
  .tiles {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.45rem;
    padding: 0.6rem 0.75rem 1rem;
  }
  .tile {
    flex-direction: row;
    align-items: center;
    gap: 0.7rem;
    min-height: 3.9rem;
    padding: 0.55rem 0.75rem;
    background: var(--timber-panel);
  }
  .tile:hover:not(:disabled) { transform: none; box-shadow: none; }
  .tile-name { font-size: 0.93rem; }
  .tile-foot {
    flex-direction: column;
    align-items: flex-end;
    flex-wrap: nowrap;
    gap: 0.05rem;
  }
  .results { padding: 0.45rem 0.5rem 1rem; }
  .result {
    padding: 0.6rem 0.6rem;
    background: var(--timber-panel);
    border-color: var(--timber-line);
  }
  .result-side { min-width: 0; }

  .ticket {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 150;
    max-height: 90dvh;
    border-radius: 1.25rem 1.25rem 0 0;
    transform: translateY(105%);
    visibility: hidden;
    transition: transform 0.22s ease, visibility 0s linear 0.22s;
  }
  .ticket.open {
    transform: none;
    visibility: visible;
    transition: transform 0.22s ease;
  }
  .ticket-foot { padding-bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px)); }
  .line-ctrl { display: flex; }
  .head-btn span { display: none; }
  .head-btn:not(.icon) { padding: 0 0.6rem; }
  .head-btn.only-mobile span,
  .head-btn.only-mobile { font-size: 0.85rem; }
  .grand strong { font-size: 1.9rem; }
  .methods { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .bill { font-size: 0.88rem; }
  .method {
    flex-direction: row;
    min-height: 3.2rem;
    gap: 0.45rem;
    font-size: 0.9rem;
  }
  .field-pair { grid-template-columns: minmax(0, 1fr); }
}

/* —— Tablet —— */
@media (min-width: 768px) and (max-width: 1099.98px) {
  .sale {
    grid-template-columns: minmax(0, 1fr) minmax(19rem, 21.5rem);
    gap: 0.55rem;
    padding: 0.55rem;
  }
  .finder { padding: 0.7rem 0.7rem 0.45rem; }
  .tool { min-width: 3.9rem; padding: 0 0.5rem; }
  .chips { padding: 0.55rem 0.7rem; }
  .tiles {
    grid-template-columns: repeat(auto-fill, minmax(8.75rem, 1fr));
    padding: 0.7rem;
  }
  .ticket-head { padding: 0.75rem 0.75rem 0.65rem; }
  .ticket-foot { padding: 0.65rem 0.75rem 0.75rem; }
  .head-btn span { display: none; }
}

@media (min-width: 768px) {
  .dlg-bg {
    align-items: center;
    padding: 1rem;
  }
  .dlg {
    border-radius: 1.25rem;
    padding-bottom: 1.1rem;
  }
}

@media (min-width: 1100px) {
  .sale { grid-template-columns: minmax(0, 1fr) minmax(24rem, 29rem); }
}

@media (min-width: 768px) and (max-height: 760px) {
  .finder { padding-top: 0.6rem; }
  .scan-input { min-height: 2.9rem; }
  .tile { min-height: 7.4rem; }
  .quick button { min-height: 2.6rem; flex-direction: row; gap: 0.35rem; }
  .pay-btn { min-height: 3.4rem; }
  .grand strong { font-size: 1.8rem; }
  .keys-legend { padding: 0.4rem 0.9rem; }
}

/* ═══════════ Productos ═══════════ */
.cat-page {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  overflow: hidden;
}
.cat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.6rem 1rem;
  flex-shrink: 0;
}
.cat-title h1 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.cat-title p {
  margin: 0.1rem 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--timber-muted);
}
.cat-head-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.cat-head-acts .btn {
  min-height: 2.6rem;
  font-size: 0.88rem;
}
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 0.55rem;
  flex-shrink: 0;
}
.kpi {
  display: grid;
  gap: 0.1rem;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  text-align: left;
  cursor: pointer;
  box-shadow: var(--timber-shadow);
}
.kpi.static { cursor: default; }
.kpi span {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.kpi strong {
  font-size: 1.45rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.kpi small {
  font-size: 0.72rem;
  color: var(--timber-muted);
}
.kpi.warn strong { color: var(--timber-warning); }
.kpi.danger strong { color: var(--timber-danger); }
.kpi.on {
  border-color: var(--timber-primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--timber-primary) 16%, transparent);
}
.cat-body {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  gap: 0.75rem;
}
.cat-rail {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.6rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
}
.rail-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
  padding: 0 0.7rem;
  border: none;
  border-radius: 0.65rem;
  background: transparent;
  color: var(--timber-ink);
  font-size: 0.9rem;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.rail-item:hover { background: var(--timber-panel-elevated); }
.rail-item.on {
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
}
.rail-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rail-item em {
  font-style: normal;
  font-size: 0.76rem;
  color: var(--timber-muted);
  font-variant-numeric: tabular-nums;
}
.rail-acts {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  margin-top: 0.5rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--timber-line);
}
.rail-acts { flex-wrap: wrap; }
.rail-acts .soft-btn { min-height: 2.3rem; padding: 0 0.75rem; white-space: nowrap; }
.link-btn {
  border: none;
  background: none;
  color: var(--timber-primary);
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  min-height: 2.3rem;
}
.cat-main {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
  overflow: hidden;
}
.cat-tools {
  display: flex;
  gap: 0.5rem;
  padding: 0.75rem 0.85rem 0.5rem;
  flex-shrink: 0;
}
.cat-tools .finder-box { flex: 1 1 auto; }
.cat-search { min-height: 2.75rem; font-size: 1rem; }
.cat-tools .cat-sort { flex: 0 0 11.5rem; }
.cat-sort {
  width: auto;
  min-height: 2.75rem;
  padding: 0 0.7rem;
  font-size: 0.88rem;
  font-weight: 600;
}
.cat-chips {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.85rem 0.65rem;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--timber-line);
  flex-shrink: 0;
}
.cat-chips .chip { min-height: 2.1rem; font-size: 0.8rem; }
.cat-count {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--timber-muted);
  white-space: nowrap;
}
.cat-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.cat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}
.cat-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.55rem 0.75rem;
  background: var(--timber-panel-elevated);
  border-bottom: 1px solid var(--timber-line);
  color: var(--timber-muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
}
.cat-table td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid var(--timber-line);
  vertical-align: middle;
}
.cat-table tbody tr { cursor: pointer; }
.cat-table tbody tr:hover { background: color-mix(in srgb, var(--timber-primary) 5%, transparent); }
.cat-table .num { text-align: right; white-space: nowrap; }
.cat-table .strong { font-weight: 800; }
.cat-table .mono { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.8rem; }
.muted { color: var(--timber-muted); }
.cell-sub { display: block; font-size: 0.74rem; }
.cell-prod {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}
.avatar.sm {
  width: 2.2rem;
  height: 2.2rem;
  font-size: 0.9rem;
  border-radius: 0.6rem;
}
.cell-text {
  display: grid;
  min-width: 0;
}
.cell-text strong { font-weight: 700; line-height: 1.25; }
.cell-text small {
  font-size: 0.76rem;
  color: var(--timber-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cell-cat {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
}
.pill {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  background: var(--timber-success-soft);
  color: var(--timber-success);
  font-size: 0.74rem;
  font-weight: 800;
  white-space: nowrap;
}
.pill.low { background: var(--timber-warning-soft); color: var(--timber-warning); }
.pill.out { background: var(--timber-danger-soft); color: var(--timber-danger); }
.cat-tiles { overflow: visible; }
.more-btn {
  display: flex;
  margin: 0.75rem auto;
}
.dup-warn {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.5rem;
  margin: 0.4rem 0 0;
  padding: 0.5rem 0.7rem;
  border-radius: 0.7rem;
  background: var(--timber-danger-soft);
  color: var(--timber-danger);
  font-size: 0.84rem;
  font-weight: 600;
}
.dup-warn svg { flex-shrink: 0; }
.dup-warn button {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 800;
  text-decoration: underline;
  cursor: pointer;
}
.code-row {
  display: flex;
  gap: 0.4rem;
}
.code-row .btn {
  min-height: 2.65rem;
  padding: 0 0.8rem;
  font-size: 0.85rem;
  flex-shrink: 0;
}
.price-trio {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}
.price-trio .strong { font-weight: 800; }
.dup-link { color: var(--timber-primary) !important; }
.btn.magic-btn {
  border-color: transparent;
  background: linear-gradient(120deg, var(--timber-primary), color-mix(in srgb, var(--timber-primary) 55%, #8b5cf6));
  color: #fff;
  white-space: nowrap;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--timber-primary) 25%, transparent);
}
.btn.magic-btn:hover:not(:disabled) { filter: brightness(1.06); }
.chip-count {
  margin-left: 0.35rem;
  font-style: normal;
  font-size: 0.72rem;
  font-weight: 800;
  opacity: 0.7;
  font-variant-numeric: tabular-nums;
}
.m-rows {
  display: grid;
  gap: 0.45rem;
  padding: 0.6rem;
}
.m-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  min-height: 4.2rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  text-align: left;
  cursor: pointer;
}
.m-row:active { background: var(--timber-panel-elevated); }
.m-row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.15rem;
}
.m-row-main strong {
  font-size: 0.95rem;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.m-row-main small {
  font-size: 0.76rem;
  color: var(--timber-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-row-side {
  flex-shrink: 0;
  display: grid;
  justify-items: end;
  gap: 0.25rem;
}
.m-row-side strong {
  font-size: 1.02rem;
  font-variant-numeric: tabular-nums;
}
.m-row-side small { font-size: 0.72rem; font-weight: 700; }
.fab {
  position: fixed;
  right: 1rem;
  bottom: calc(4.6rem + env(safe-area-inset-bottom, 0px));
  z-index: 40;
  width: 3.6rem;
  height: 3.6rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 1.2rem;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--timber-primary) 40%, transparent);
  cursor: pointer;
}

@media (max-width: 767.98px) {
  .cat-page {
    padding: 0 0 6rem;
    gap: 0;
    overflow-y: auto;
    background: var(--timber-surface);
  }
  .cat-head { padding: 0.75rem 0.85rem 0.35rem; }
  .cat-title h1 { font-size: 1.25rem; }
  .cat-title p { font-size: 0.8rem; }
  .cat-head { flex-wrap: nowrap; }
  .cat-title { min-width: 0; }
  .cat-title p { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cat-head-acts { flex-shrink: 0; }
  .cat-head-acts .btn:not(.magic-btn) { display: none; }
  .cat-head-acts .magic-btn { min-height: 2.5rem; padding: 0 0.85rem; font-size: 0.85rem; }
  .cat-body { display: block; }
  .cat-rail {
    flex-direction: row;
    gap: 0.35rem;
    overflow-x: auto;
    padding: 0.35rem 0.85rem 0.5rem;
    border: none;
    border-radius: 0;
    background: transparent;
    scrollbar-width: none;
  }
  .cat-rail::-webkit-scrollbar { display: none; }
  .rail-item {
    flex: 0 0 auto;
    min-height: 2.3rem;
    padding: 0 0.85rem;
    border: 1px solid var(--timber-line);
    border-radius: 999px;
    background: var(--timber-panel);
    font-size: 0.85rem;
  }
  .rail-item.on { border-color: transparent; }
  .rail-acts {
    flex-shrink: 0;
    flex-wrap: nowrap;
    margin: 0;
    padding: 0;
    border: none;
  }
  .rail-acts .soft-btn { min-height: 2.3rem; border-radius: 999px; }
  .cat-main {
    overflow: visible;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .cat-sticky {
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--timber-surface);
    border-bottom: 1px solid var(--timber-line);
  }
  .cat-tools { padding: 0.5rem 0.85rem 0.4rem; gap: 0.4rem; }
  .cat-search { min-height: 2.75rem; border-width: 1px; padding-left: 2.6rem; }
  .cat-tools .finder-ico { left: 0.8rem; }
  .cat-tools .cat-sort { flex: 0 0 7.2rem; font-size: 0.8rem; padding: 0 0.4rem; }
  .cat-chips { padding: 0 0.85rem 0.55rem; border-bottom: none; }
  .cat-list { overflow: visible; }
  .m-rows { padding: 0.6rem 0.85rem; }

  /* Formulario de producto en celular */
  .product-sheet { max-height: 100dvh; border-radius: 1rem 1rem 0 0; }
  .product-sheet .product-banner { height: 4.25rem; }
  .product-sheet .banner-copy { bottom: 0.8rem; }
  .product-sheet .product-body { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 0.5rem; }
  .product-sheet .m-wide { grid-column: 1 / -1; }
  .product-banner .sheet-kicker { display: none; }
  .product-banner h3 { font-size: 1.15rem; }
  .product-sheet .product-banner .sheet-x { top: 0.6rem; }
  .product-body { padding: 0.75rem 0.85rem 1rem; gap: 0.6rem; }
  .product-sheet .inp { min-height: 2.9rem; font-size: 1rem; }
  .price-trio { gap: 0.4rem; }
  .iva-card { padding: 0.6rem 0.7rem; }
  .product-foot {
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 0.5rem;
    padding: 0.6rem 0.85rem calc(0.6rem + env(safe-area-inset-bottom, 0px));
  }
  .product-foot .sheet-actions { grid-column: 1 / -1; }
  .product-sheet .sheet-actions .act { min-height: 3rem; font-size: 1rem; }
  .product-foot .delete-link { font-size: 0.85rem; }
  .product-foot .dup-link { justify-self: start; }
  .product-foot .delete-link:not(.dup-link) { justify-self: end; }
}
@media (min-width: 768px) and (max-width: 1099.98px) {
  .cat-body { grid-template-columns: 10.5rem minmax(0, 1fr); }
}

.check-wide {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--timber-ink);
  margin: 0.15rem 0;
}
.check-wide input { width: 1.05rem; height: 1.05rem; }
.supplier-picks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.supplier-picks label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--timber-line);
  background: var(--timber-panel-elevated);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--timber-ink);
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
.product-sheet .product-banner .sheet-x {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  z-index: 2;
  display: grid;
  place-items: center;
  background: var(--timber-surface);
  color: var(--timber-ink);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
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

/* ═══════════ Formularios del catálogo: tamaño ═══════════ */
@media (min-width: 768px) {
  .sheet-bg { align-items: center; padding: 1rem; }
  .sheet { border-radius: 1.15rem; }
}

.magic-open:disabled,
.inp:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.delete-link:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  text-decoration: none;
}
.act:disabled { opacity: 0.45; cursor: not-allowed; }

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

</style>

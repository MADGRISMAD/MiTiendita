<template>
  <AppShell>
    <div class="adm inv">
      <header class="adm-head">
        <div>
          <h1>Inventario</h1>
          <p>{{ headline }}</p>
        </div>
        <div class="adm-acts">
          <button v-if="isAdmin" type="button" class="adm-btn primary" @click="openPurchase()">
            <PosIcon name="truck" :size="18" />
            <span>Registrar compra</span>
          </button>
        </div>
      </header>

      <p v-if="settingsLoaded && !venueStore.inventoryEnabled" class="adm-banner warn">
        <PosIcon name="alert" :size="18" />
        <span>
          El control de inventario está apagado: las ventas no descuentan existencias.
          <router-link v-if="isAdmin" to="/settings">Actívalo en Ajustes</router-link>
        </span>
      </p>
      <p v-if="flash" class="adm-banner ok" role="status">
        <PosIcon name="check" :size="18" /> <span>{{ flash }}</span>
      </p>
      <p v-if="error" class="adm-banner err" role="alert">
        <PosIcon name="alert" :size="18" /> <span>{{ error }}</span>
        <button type="button" class="adm-x" aria-label="Cerrar aviso" @click="error = ''"><PosIcon name="x" :size="16" /></button>
      </p>

      <nav class="adm-tabs main" role="tablist" aria-label="Secciones de inventario">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="tab === t.id"
          :class="{ on: tab === t.id }"
          @click="setTab(t.id)"
        >
          <span class="hide-mobile">{{ t.label }}</span><span class="only-mobile">{{ t.short || t.label }}</span><em v-if="t.count" :class="{ alert: t.alert }">{{ t.count }}</em>
        </button>
      </nav>

      <!-- ============ Existencias ============ -->
      <section v-if="tab === 'existencias'" class="sec" :class="{ 'adm-loading': loading.foods }">
        <div class="adm-kpis">
          <button type="button" class="adm-kpi" :class="{ on: stockFilter === 'all' }" @click="stockFilter = 'all'">
            <span><PosIcon name="box" :size="16" /> Productos</span>
            <strong>{{ foods.length }}</strong>
            <small>{{ stockCounts.withStock }} con existencia</small>
          </button>
          <button type="button" class="adm-kpi bad" :class="{ on: stockFilter === 'out' }" @click="stockFilter = 'out'">
            <span>Agotados</span>
            <strong>{{ stockCounts.out }}</strong>
            <small>sin existencia</small>
          </button>
          <button type="button" class="adm-kpi warn" :class="{ on: stockFilter === 'low' }" @click="stockFilter = 'low'">
            <span>Poco stock</span>
            <strong>{{ stockCounts.low }}</strong>
            <small>en o bajo su mínimo</small>
          </button>
          <div v-if="isAdmin" class="adm-kpi">
            <span>Valor en anaquel</span>
            <strong>{{ money(stockValue.value) }}</strong>
            <small>{{ stockValue.missing ? `${stockValue.missing} sin costo` : 'a precio de costo' }}</small>
          </div>
        </div>

        <div class="adm-tools">
          <label class="adm-search">
            <PosIcon name="search" :size="17" />
            <input v-model="stockQuery" class="adm-inp" type="search" placeholder="Buscar producto o código" aria-label="Buscar producto o código" />
          </label>
          <div class="tool-selects">
            <select v-model="stockCat" class="adm-inp" aria-label="Categoría">
              <option value="">Categorías</option>
              <option v-for="m in menus" :key="m.id" :value="String(m.id)">{{ m.name }}</option>
            </select>
            <select v-model="stockSort" class="adm-inp" aria-label="Ordenar">
              <option value="urgent">Lo que falta</option>
              <option value="name">A–Z</option>
              <option v-if="isAdmin" value="value">Más dinero</option>
            </select>
          </div>
        </div>

        <ul v-if="stockRows.length" class="stock-list">
          <li v-for="f in stockRows.slice(0, stockLimit)" :key="f.id" class="stock-row" :class="f.state">
            <div class="st-main">
              <strong>{{ f.name }}</strong>
              <small>
                {{ f.category }}<template v-if="f.code"> · {{ f.code }}</template><template v-if="f.tracksExpiry"> · con caducidad</template>
              </small>
            </div>
            <div class="st-level" :title="`Existencia ${qty(f.stock)} · mínimo ${qty(f.min)}`">
              <div class="st-num">
                <b>{{ qty(f.stock) }}</b>
                <small>mín. {{ qty(f.min) }}</small>
              </div>
              <div class="st-meter" aria-hidden="true">
                <i :style="{ width: `${f.fill}%` }"></i>
                <span :style="{ left: `${f.minPos}%` }"></span>
              </div>
            </div>
            <span class="adm-pill st-pill" :class="f.pill">{{ f.stateText }}</span>
            <b v-if="isAdmin" class="st-value">{{ f.cost > 0 ? money(f.value) : '—' }}</b>
            <button v-if="isAdmin" type="button" class="adm-btn sm st-adjust" :aria-label="`Ajustar existencia de ${f.name}`" @click="openAdjust(f)">
              <PosIcon name="sliders" :size="16" /><span class="hide-mobile">Ajustar</span>
            </button>
          </li>
        </ul>
        <div v-else-if="!loading.foods" class="adm-empty">
          <PosIcon name="box" :size="30" />
          <h3>{{ foods.length ? 'Nada coincide' : 'Aún no hay productos' }}</h3>
          <p v-if="foods.length">Prueba con otra búsqueda o quita el filtro.</p>
          <p v-else>Da de alta tus productos en Productos y aquí verás cuánto te queda de cada uno.</p>
          <router-link v-if="!foods.length && isAdmin" to="/products" class="adm-btn primary">Ir a Productos</router-link>
        </div>
        <div v-if="stockRows.length > stockLimit" class="more-row">
          <button type="button" class="adm-link" @click="stockLimit += 60">Ver {{ Math.min(60, stockRows.length - stockLimit) }} más</button>
        </div>
      </section>

      <!-- ============ Sugerido de compra ============ -->
      <section v-else-if="tab === 'sugerido'" class="sec" :class="{ 'adm-loading': loading.suggestions }">
        <p class="adm-hint">
          Sale de tu mínimo y de lo que vendiste en los últimos {{ suggestions.salesDays || 14 }} días.
          Si el proveedor tiene días de visita, alcanza hasta su siguiente visita.
        </p>
        <div v-if="!suggestionGroups.length && !loading.suggestions" class="adm-empty">
          <PosIcon name="check" :size="30" />
          <h3>Nada que pedir por ahora</h3>
          <p>Cuando algo llegue a su mínimo o se esté vendiendo rápido, aparece aquí agrupado por proveedor.</p>
        </div>
        <article v-for="g in suggestionGroups" :key="g.supplierId || 'none'" class="adm-card sug">
          <div class="sug-head">
            <span class="adm-avatar" :style="hueStyle(g.supplierName)">{{ initials(g.supplierName) }}</span>
            <div class="sug-who">
              <h2>{{ g.supplierName }}</h2>
              <p>
                {{ g.itemCount }} {{ g.itemCount === 1 ? 'producto' : 'productos' }} · {{ money(g.estimatedCost) }} aprox.
                <template v-if="nextVisit(g.visitDays)"> · viene {{ nextVisit(g.visitDays) }}</template>
              </p>
            </div>
            <div class="sug-acts">
              <a v-if="g.whatsapp" class="adm-btn wa sm" :href="orderLink(g)" target="_blank" rel="noopener">
                <PosIcon name="chat" :size="16" /> Pedir por WhatsApp
              </a>
              <button type="button" class="adm-btn sm" @click="copyOrder(g)">
                <PosIcon name="copy" :size="16" /> Copiar lista
              </button>
              <button v-if="isAdmin && g.supplierId" type="button" class="adm-btn sm" @click="purchaseFromSuggestion(g)">
                <PosIcon name="truck" :size="16" /> Ya llegó
              </button>
            </div>
          </div>
          <div class="sug-table" role="table" :aria-label="`Pedido sugerido para ${g.supplierName}`">
            <div class="sug-row hdr" role="row">
              <span role="columnheader">Producto</span>
              <span role="columnheader">Hay</span>
              <span role="columnheader" class="hide-mobile">Vende/día</span>
              <span role="columnheader">Pedir</span>
              <span role="columnheader" class="hide-mobile">Costo</span>
            </div>
            <div v-for="item in g.items" :key="item.foodId" class="sug-row" role="row">
              <span role="cell" class="sug-name">{{ item.name }}</span>
              <span role="cell" :class="{ out: !Number(item.stock) }">{{ qty(item.stock) }}<small> / {{ qty(item.lowStockThreshold) }}</small></span>
              <span role="cell" class="hide-mobile">{{ item.avgDaily ? qty(item.avgDaily, 1) : '—' }}</span>
              <span role="cell"><b class="sug-qty">{{ qty(item.suggestedQty) }}</b></span>
              <span role="cell" class="hide-mobile">{{ item.unitCost ? money(item.estimatedCost) : '—' }}</span>
            </div>
          </div>
        </article>
      </section>

      <!-- ============ Caducidad ============ -->
      <section v-else-if="tab === 'caducidad'" class="sec" :class="{ 'adm-loading': loading.expiry }">
        <div class="adm-kpis">
          <button
            v-for="b in EXPIRY_BUCKETS"
            :key="b.id"
            type="button"
            class="adm-kpi"
            :class="[b.tone, { on: expiryFilter === b.id }]"
            @click="expiryFilter = expiryFilter === b.id ? 'all' : b.id"
          >
            <span>{{ b.label }}</span>
            <strong>{{ expiry.summary?.[b.key] || 0 }}</strong>
            <small>{{ b.sub }}</small>
          </button>
        </div>
        <div class="adm-tools">
          <p class="adm-hint">Lotes que vencen en los próximos 30 días. Toca una cifra para filtrar.</p>
          <button type="button" class="adm-btn sm" :disabled="!(expiry.items || []).length" @click="exportExpiry">
            <PosIcon name="download" :size="16" /> Exportar CSV
          </button>
        </div>
        <ul v-if="expiryRows.length" class="exp-list">
          <li v-for="row in expiryRows" :key="row.id" class="exp-row">
            <span class="exp-days" :class="row.bucket">
              <b>{{ row.bucket === 'expired' ? '!' : row.daysLeft }}</b>
              <small>{{ row.bucket === 'expired' ? 'vencido' : row.daysLeft === 1 ? 'día' : 'días' }}</small>
            </span>
            <div class="exp-main">
              <strong>{{ row.foodName }}</strong>
              <small>Lote {{ row.lot || 'sin número' }} · caduca {{ formatDate(row.expiresAt) }}</small>
            </div>
            <span class="exp-qty">{{ qty(row.quantity) }} uds</span>
            <b v-if="isAdmin" class="exp-value">{{ row.unitCost ? money(row.quantity * row.unitCost) : '—' }}</b>
          </li>
        </ul>
        <div v-else-if="!loading.expiry" class="adm-empty">
          <PosIcon name="calendar" :size="30" />
          <h3>Nada por caducar</h3>
          <p>Marca los productos «con caducidad» en Productos y captura lote y fecha al registrar la compra.</p>
        </div>
      </section>

      <!-- ============ Compras ============ -->
      <section v-else-if="tab === 'compras'" class="sec" :class="{ 'adm-loading': loading.purchases }">
        <div class="adm-kpis">
          <div class="adm-kpi">
            <span><PosIcon name="truck" :size="16" /> Comprado este mes</span>
            <strong>{{ money(purchaseStats.monthTotal) }}</strong>
            <small>{{ purchaseStats.monthCount }} {{ purchaseStats.monthCount === 1 ? 'entrada' : 'entradas' }}</small>
          </div>
          <div class="adm-kpi">
            <span>Mes pasado</span>
            <strong>{{ money(purchaseStats.prevTotal) }}</strong>
            <small>{{ purchaseStats.prevCount }} {{ purchaseStats.prevCount === 1 ? 'entrada' : 'entradas' }}</small>
          </div>
        </div>
        <div class="adm-tools">
          <label class="adm-search">
            <PosIcon name="search" :size="17" />
            <input v-model="purchaseQuery" class="adm-inp" type="search" placeholder="Proveedor o producto" aria-label="Buscar compra" />
          </label>
        </div>
        <ul v-if="purchaseRows.length" class="buy-list">
          <li v-for="p in purchaseRows" :key="p.id">
            <button type="button" class="buy-row" @click="purchaseDetail = p">
              <span class="buy-date">
                <b>{{ dayOf(p.date) }}</b>
                <small>{{ monthOf(p.date) }}</small>
              </span>
              <span class="buy-main">
                <strong>{{ p.supplierName || 'Proveedor' }}</strong>
                <small>{{ itemsSummary(p.items) }}</small>
              </span>
              <b class="buy-total">{{ money(p.totalCost) }}</b>
              <PosIcon name="chevron" :size="18" class="buy-chev" />
            </button>
          </li>
        </ul>
        <div v-else-if="!loading.purchases" class="adm-empty">
          <PosIcon name="truck" :size="30" />
          <h3>{{ purchases.length ? 'Nada coincide' : 'Sin compras registradas' }}</h3>
          <p v-if="!purchases.length">Registra lo que te llega del proveedor: suma existencias y actualiza el costo de cada producto.</p>
          <button v-if="!purchases.length && isAdmin" type="button" class="adm-btn primary" @click="openPurchase()">Registrar compra</button>
        </div>
      </section>

      <!-- ============ Proveedores ============ -->
      <section v-else-if="tab === 'proveedores'" class="sec" :class="{ 'adm-loading': loading.suppliers }">
        <div class="adm-tools">
          <label class="adm-search">
            <PosIcon name="search" :size="17" />
            <input v-model="supplierQuery" class="adm-inp" type="search" placeholder="Buscar proveedor" aria-label="Buscar proveedor" />
          </label>
          <button v-if="isAdmin" type="button" class="adm-btn" @click="openSupplier()">
            <PosIcon name="add" :size="18" /> Nuevo proveedor
          </button>
        </div>
        <div v-if="supplierRows.length" class="sup-grid">
          <article v-for="s in supplierRows" :key="s.id" class="adm-card sup">
            <div class="sup-top">
              <span class="adm-avatar" :style="hueStyle(s.name)">{{ initials(s.name) }}</span>
              <div class="sup-who">
                <h3>{{ s.name }}</h3>
                <p>{{ s.contact || 'Sin contacto' }}</p>
              </div>
              <button v-if="isAdmin" type="button" class="adm-btn icon sm" :aria-label="`Editar ${s.name}`" @click="openSupplier(s)">
                <PosIcon name="edit" :size="17" />
              </button>
            </div>
            <div class="sup-visit">
              <span>Visita</span>
              <div class="adm-days">
                <i v-for="d in WEEKDAYS" :key="d.id" :class="{ on: (s.visitDays || []).map(Number).includes(d.id) }" :title="d.long">{{ d.letter }}</i>
              </div>
              <small v-if="nextVisit(s.visitDays)">Viene {{ nextVisit(s.visitDays) }}</small>
            </div>
            <dl class="sup-stats">
              <div><dt>Productos</dt><dd>{{ supplierStats[s.id]?.products || 0 }}</dd></div>
              <div><dt>Última</dt><dd>{{ supplierStats[s.id]?.last ? shortDate(supplierStats[s.id].last) : '—' }}</dd></div>
              <div><dt>Comprado</dt><dd>{{ money(supplierStats[s.id]?.total || 0) }}</dd></div>
            </dl>
            <p v-if="s.notes" class="sup-notes">{{ s.notes }}</p>
            <div v-if="s.whatsapp" class="sup-acts">
              <a class="adm-btn wa sm" :href="waLink(s.whatsapp)" target="_blank" rel="noopener"><PosIcon name="chat" :size="16" /> WhatsApp</a>
              <a class="adm-btn sm" :href="telLink(s.whatsapp)"><PosIcon name="phone" :size="16" /> Llamar</a>
            </div>
          </article>
        </div>
        <div v-else-if="!loading.suppliers" class="adm-empty">
          <PosIcon name="users" :size="30" />
          <h3>{{ suppliers.length ? 'Nada coincide' : 'Aún no hay proveedores' }}</h3>
          <p v-if="!suppliers.length">Agrega a quien te surte (refresquera, panadería, distribuidora) con sus días de visita para armar el pedido.</p>
          <button v-if="!suppliers.length && isAdmin" type="button" class="adm-btn primary" @click="openSupplier()">Agregar proveedor</button>
        </div>
      </section>

      <!-- ============ Bitácora ============ -->
      <section v-else class="sec" :class="{ 'adm-loading': loading.activity }">
        <div v-if="activityGroups.length" class="log">
          <div v-for="g in activityGroups" :key="g.key" class="log-day">
            <h3>{{ g.label }}</h3>
            <ul>
              <li v-for="row in g.rows" :key="row.id">
                <span class="log-ico" :class="iconOf(row.type).tone"><PosIcon :name="iconOf(row.type).name" :size="16" /></span>
                <div>
                  <p>{{ row.message }}</p>
                  <small>{{ clock(row.createdAt) }}<template v-if="row.user"> · {{ row.user }}</template></small>
                </div>
              </li>
            </ul>
          </div>
        </div>
        <div v-else-if="!loading.activity" class="adm-empty">
          <PosIcon name="history" :size="30" />
          <h3>Sin movimientos todavía</h3>
          <p>Aquí quedan las compras, los ajustes de existencia y los cambios de proveedores, con quién los hizo.</p>
        </div>
      </section>

      <!-- ============ Diálogo: proveedor ============ -->
      <Teleport to="body">
        <div v-if="showSupplier" class="adm-dlg-bg" @click.self="showSupplier = false">
          <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="sup-title" @submit.prevent="saveSupplier">
            <div class="adm-dlg-head">
              <span class="adm-dlg-ico"><PosIcon name="truck" :size="22" /></span>
              <div>
                <h3 id="sup-title">{{ editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor' }}</h3>
                <p>Con sus días de visita el sugerido calcula cuánto pedir.</p>
              </div>
              <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="showSupplier = false"><PosIcon name="x" :size="18" /></button>
            </div>
            <label class="adm-field">
              <span>Nombre</span>
              <input v-model="supplierForm.name" class="adm-inp" required minlength="2" maxlength="80" placeholder="Distribuidora del Centro" />
            </label>
            <div class="adm-row2">
              <label class="adm-field">
                <span>Contacto <em>(opcional)</em></span>
                <input v-model="supplierForm.contact" class="adm-inp" maxlength="80" placeholder="Nombre del agente" />
              </label>
              <label class="adm-field">
                <span>WhatsApp <em>(opcional)</em></span>
                <input v-model="supplierForm.whatsapp" class="adm-inp" inputmode="tel" maxlength="30" placeholder="10 dígitos" />
              </label>
            </div>
            <div class="adm-field">
              <span>Días que viene</span>
              <div class="adm-daypick">
                <button
                  v-for="d in WEEKDAYS"
                  :key="d.id"
                  type="button"
                  :aria-pressed="supplierForm.visitDays.includes(d.id)"
                  :aria-label="d.long"
                  @click="toggleDay(d.id)"
                >
                  {{ d.short }}
                </button>
              </div>
            </div>
            <label class="adm-field">
              <span>Notas <em>(opcional)</em></span>
              <textarea v-model="supplierForm.notes" class="adm-inp" rows="2" maxlength="400" placeholder="Pedido mínimo, forma de pago…"></textarea>
            </label>
            <div class="adm-dlg-acts" :class="{ three: editingSupplier }">
              <button
                v-if="editingSupplier"
                type="button"
                class="adm-btn danger-ghost"
                :disabled="saving"
                @click="removeSupplier"
              >
                {{ confirmDelete ? '¿Seguro?' : 'Eliminar' }}
              </button>
              <button type="button" class="adm-btn" @click="showSupplier = false">Cancelar</button>
              <button type="submit" class="adm-btn primary" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- ============ Diálogo: registrar compra ============ -->
      <Teleport to="body">
        <div v-if="showPurchase" class="adm-dlg-bg" @click.self="showPurchase = false">
          <form class="adm-dlg wide" role="dialog" aria-modal="true" aria-labelledby="buy-title" @submit.prevent="savePurchase">
            <div class="adm-dlg-head">
              <span class="adm-dlg-ico"><PosIcon name="truck" :size="22" /></span>
              <div>
                <h3 id="buy-title">Registrar compra</h3>
                <p>Suma a la existencia y actualiza el costo de cada producto.</p>
              </div>
              <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="showPurchase = false"><PosIcon name="x" :size="18" /></button>
            </div>
            <div class="adm-row2">
              <label class="adm-field">
                <span>Proveedor</span>
                <select v-model="purchaseForm.supplierId" class="adm-inp" required>
                  <option value="" disabled>Elige un proveedor</option>
                  <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                </select>
              </label>
              <label class="adm-field">
                <span>Fecha</span>
                <input v-model="purchaseForm.date" class="adm-inp" type="date" required :max="todayISO()" />
              </label>
            </div>
            <div class="buy-add">
              <label class="adm-search">
                <PosIcon name="search" :size="17" />
                <input
                  ref="productInput"
                  v-model="productQuery"
                  class="adm-inp"
                  type="search"
                  placeholder="Buscar producto para agregar"
                  aria-label="Buscar producto para agregar"
                  @keydown.enter.prevent="productHits[0] && addLine(productHits[0])"
                />
              </label>
              <ul v-if="productHits.length" class="hits">
                <li v-for="f in productHits" :key="f.id">
                  <button type="button" @click="addLine(f)">
                    <strong>{{ f.name }}</strong>
                    <small>hay {{ qty(f.stock) }}<template v-if="Number(f.cost)"> · costo {{ money(f.cost) }}</template></small>
                  </button>
                </li>
              </ul>
            </div>
            <div v-if="purchaseForm.items.length" class="lines">
              <div v-for="(line, idx) in purchaseForm.items" :key="line.foodId" class="line">
                <div class="line-top">
                  <strong>{{ line.name }}</strong>
                  <button type="button" class="adm-dlg-x sm" :aria-label="`Quitar ${line.name}`" @click="purchaseForm.items.splice(idx, 1)">
                    <PosIcon name="trash" :size="16" />
                  </button>
                </div>
                <div class="line-grid">
                  <label class="adm-field">
                    <span>Cantidad<template v-if="line.saleUnit && line.saleUnit !== 'pz'"> ({{ line.saleUnit }})</template></span>
                    <input
                      v-model.number="line.quantity"
                      class="adm-inp num"
                      type="number"
                      :min="line.saleUnit && line.saleUnit !== 'pz' ? 0.001 : 1"
                      :step="line.saleUnit && line.saleUnit !== 'pz' ? 'any' : 1"
                      :inputmode="line.saleUnit && line.saleUnit !== 'pz' ? 'decimal' : 'numeric'"
                      required
                    />
                  </label>
                  <label class="adm-field">
                    <span>Costo c/u <em v-if="line.prevCost && Number(line.unitCost) !== line.prevCost">(antes {{ money(line.prevCost) }})</em></span>
                    <input v-model.number="line.unitCost" class="adm-inp num" type="number" min="0" step="0.01" inputmode="decimal" required />
                  </label>
                  <div class="line-sub">
                    <span>Importe</span>
                    <b>{{ money((Number(line.quantity) || 0) * (Number(line.unitCost) || 0)) }}</b>
                  </div>
                </div>
                <div v-if="line.tracksExpiry" class="adm-row2">
                  <label class="adm-field">
                    <span>Lote</span>
                    <input v-model="line.lot" class="adm-inp" required maxlength="60" />
                  </label>
                  <label class="adm-field">
                    <span>Caducidad</span>
                    <input v-model="line.expiresAt" class="adm-inp" type="date" required />
                  </label>
                </div>
              </div>
            </div>
            <p v-else class="adm-hint lines-empty">Busca y agrega los productos que llegaron.</p>
            <label class="adm-field">
              <span>Notas <em>(opcional)</em></span>
              <input v-model="purchaseForm.notes" class="adm-inp" maxlength="400" placeholder="Factura, remisión…" />
            </label>
            <div class="buy-sum">
              <span>{{ purchaseForm.items.length }} {{ purchaseForm.items.length === 1 ? 'producto' : 'productos' }}</span>
              <b>{{ money(purchaseTotal) }}</b>
            </div>
            <p v-if="purchaseErr" class="adm-err">{{ purchaseErr }}</p>
            <div class="adm-dlg-acts">
              <button type="button" class="adm-btn" @click="showPurchase = false">Cancelar</button>
              <button type="submit" class="adm-btn primary" :disabled="saving || !purchaseForm.items.length">
                {{ saving ? 'Guardando…' : 'Confirmar entrada' }}
              </button>
            </div>
          </form>
        </div>
      </Teleport>

      <!-- ============ Diálogo: detalle de compra ============ -->
      <Teleport to="body">
        <div v-if="purchaseDetail" class="adm-dlg-bg" @click.self="purchaseDetail = null">
          <div class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="buyd-title">
            <div class="adm-dlg-head">
              <span class="adm-dlg-ico"><PosIcon name="receipt" :size="22" /></span>
              <div>
                <h3 id="buyd-title">{{ purchaseDetail.supplierName || 'Compra' }}</h3>
                <p>
                  {{ formatDate(purchaseDetail.date) }} · {{ purchaseDetail.costMethod === 'average' ? 'costo promedio' : 'último costo' }}
                  <template v-if="purchaseDetail.createdBy || purchaseDetail.user"> · {{ purchaseDetail.createdBy || purchaseDetail.user }}</template>
                </p>
              </div>
              <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="purchaseDetail = null"><PosIcon name="x" :size="18" /></button>
            </div>
            <ul class="detail-items">
              <li v-for="(item, i) in purchaseDetail.items || []" :key="i">
                <div>
                  <strong>{{ item.name }}</strong>
                  <small>{{ qty(item.quantity) }} × {{ money(item.unitCost) }}<template v-if="item.lot"> · lote {{ item.lot }}, caduca {{ formatDate(item.expiresAt) }}</template></small>
                </div>
                <b>{{ money((Number(item.quantity) || 0) * (Number(item.unitCost) || 0)) }}</b>
              </li>
            </ul>
            <p v-if="purchaseDetail.notes" class="adm-hint">{{ purchaseDetail.notes }}</p>
            <div class="buy-sum">
              <span>Total</span>
              <b>{{ money(purchaseDetail.totalCost) }}</b>
            </div>
            <button type="button" class="adm-btn block" @click="purchaseDetail = null">Cerrar</button>
          </div>
        </div>
      </Teleport>

      <!-- ============ Diálogo: ajustar existencia ============ -->
      <Teleport to="body">
        <div v-if="adjusting" class="adm-dlg-bg" @click.self="adjusting = null">
          <form class="adm-dlg" role="dialog" aria-modal="true" aria-labelledby="adj-title" @submit.prevent="saveAdjust">
            <div class="adm-dlg-head">
              <span class="adm-dlg-ico"><PosIcon name="sliders" :size="22" /></span>
              <div>
                <h3 id="adj-title">{{ adjusting.name }}</h3>
                <p>El sistema dice que hay <b>{{ qty(adjusting.stock) }}</b>. Escribe lo que contaste.</p>
              </div>
              <button type="button" class="adm-dlg-x" aria-label="Cerrar" @click="adjusting = null"><PosIcon name="x" :size="18" /></button>
            </div>
            <div class="counter">
              <button type="button" class="adm-btn" aria-label="Uno menos" @click="adjustForm.stock = Math.max(0, (Number(adjustForm.stock) || 0) - 1)">
                <PosIcon name="minus" :size="20" />
              </button>
              <input
                ref="adjustInput"
                v-model.number="adjustForm.stock"
                class="adm-inp num big"
                type="number"
                min="0"
                step="any"
                inputmode="decimal"
                aria-label="Existencia contada"
                required
              />
              <button type="button" class="adm-btn" aria-label="Uno más" @click="adjustForm.stock = (Number(adjustForm.stock) || 0) + 1">
                <PosIcon name="add" :size="20" />
              </button>
            </div>
            <p class="adj-diff" :class="adjustDiff > 0 ? 'up' : adjustDiff < 0 ? 'down' : ''">
              {{ adjustDiff === 0 ? 'Sin cambio' : `${adjustDiff > 0 ? 'Sobran' : 'Faltan'} ${qty(Math.abs(adjustDiff))}` }}
              <template v-if="adjustDiff !== 0 && adjusting.cost > 0"> · {{ money(Math.abs(adjustDiff) * adjusting.cost) }} a costo</template>
            </p>
            <div class="adm-field">
              <span>Motivo</span>
              <div class="adm-choices reasons">
                <button
                  v-for="r in ADJUST_REASONS"
                  :key="r.id"
                  type="button"
                  class="adm-choice"
                  :aria-pressed="adjustForm.reason === r.id"
                  @click="adjustForm.reason = r.id"
                >
                  <strong>{{ r.label }}</strong>
                </button>
              </div>
            </div>
            <label class="adm-field">
              <span>Nota <em>(opcional)</em></span>
              <input v-model="adjustForm.note" class="adm-inp" maxlength="140" placeholder="Se rompieron 2 en la bodega" />
            </label>
            <p v-if="adjusting.tracksExpiry" class="adm-hint">Este producto lleva caducidad: los lotes no cambian con el ajuste.</p>
            <p v-if="adjustErr" class="adm-err">{{ adjustErr }}</p>
            <div class="adm-dlg-acts">
              <button type="button" class="adm-btn" @click="adjusting = null">Cancelar</button>
              <button type="submit" class="adm-btn primary" :disabled="saving || adjustDiff === 0">
                {{ saving ? 'Guardando…' : 'Guardar ajuste' }}
              </button>
            </div>
          </form>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import "../admin.css";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import { apiService } from "../apiService";
import { venueStore, fetchVenueSettings } from "../venueStore";
import { hasRole } from "../authStore";
import { unitOf } from "../bulk";

const WEEKDAYS = [
  { id: 1, short: "Lun", letter: "L", long: "lunes" },
  { id: 2, short: "Mar", letter: "M", long: "martes" },
  { id: 3, short: "Mié", letter: "M", long: "miércoles" },
  { id: 4, short: "Jue", letter: "J", long: "jueves" },
  { id: 5, short: "Vie", letter: "V", long: "viernes" },
  { id: 6, short: "Sáb", letter: "S", long: "sábado" },
  { id: 0, short: "Dom", letter: "D", long: "domingo" },
];
const EXPIRY_BUCKETS = [
  { id: "expired", key: "expired", label: "Vencidos", sub: "sacar de venta", tone: "bad" },
  { id: "d7", key: "d7", label: "En 7 días", sub: "véndelos primero", tone: "warn" },
  { id: "d15", key: "d15", label: "En 15 días", sub: "vigilar", tone: "" },
  { id: "d30", key: "d30", label: "En 30 días", sub: "sin prisa", tone: "" },
];
const ADJUST_REASONS = [
  { id: "count", label: "Conteo físico" },
  { id: "waste", label: "Merma o caducado" },
  { id: "internal", label: "Consumo o regalo" },
  { id: "other", label: "Otro" },
];
const TAB_IDS = ["existencias", "sugerido", "caducidad", "compras", "proveedores", "bitacora"];

const route = useRoute();
const router = useRouter();
const isAdmin = computed(() => hasRole("admin"));

const tab = ref(TAB_IDS.includes(String(route.query.tab)) ? String(route.query.tab) : "existencias");
function setTab(id) {
  tab.value = id;
  router.replace({ query: { ...route.query, tab: id } }).catch(() => {});
  nextTick(() => document.querySelector(".adm-tabs.main button.on")?.scrollIntoView({ block: "nearest", inline: "nearest" }));
}
watch(
  () => route.query.tab,
  (t) => {
    if (TAB_IDS.includes(String(t))) tab.value = String(t);
  }
);

const loading = reactive({ foods: true, suppliers: true, purchases: true, expiry: true, suggestions: true, activity: true });
const saving = ref(false);
const error = ref("");
const flash = ref("");
let flashTimer = null;
function say(msg) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ""), 4000);
}
const settingsLoaded = ref(false);

const foods = ref([]);
const menus = ref([]);
const suppliers = ref([]);
const purchases = ref([]);
const expiry = ref({ summary: {}, items: [] });
const suggestions = ref({ groups: [] });
const activity = ref([]);

// ---------- Formato ----------
const moneyFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
function money(n) {
  return moneyFmt.format(Number(n) || 0);
}
function qty(n, digits = 3) {
  const v = Number(n || 0);
  return Number.isInteger(v) ? v.toLocaleString("es-MX") : String(Number(v.toFixed(digits)));
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toDate(value) {
  if (!value) return null;
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function formatDate(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
function shortDate(value) {
  const d = toDate(value);
  if (!d) return "—";
  const opts = d.getFullYear() === new Date().getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "2-digit" };
  return d.toLocaleDateString("es-MX", opts).replace(".", "");
}
function dayOf(value) {
  const d = toDate(value);
  return d ? d.getDate() : "—";
}
function monthOf(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString("es-MX", { month: "short" }).replace(".", "") : "";
}
function clock(value) {
  const d = toDate(value);
  return d ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "";
}
function fold(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
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
function digitsOf(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : d;
}
function waLink(phone, text = "") {
  const d = digitsOf(phone);
  return d ? `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}` : "";
}
function telLink(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  return `tel:${d.length === 10 ? d : `+${d}`}`;
}
function nextVisit(days) {
  const set = new Set((days || []).map(Number));
  if (!set.size) return "";
  const today = new Date().getDay();
  for (let i = 0; i < 7; i++) {
    const d = (today + i) % 7;
    if (set.has(d)) {
      if (i === 0) return "hoy";
      if (i === 1) return "mañana";
      return `el ${WEEKDAYS.find((w) => w.id === d).long}`;
    }
  }
  return "";
}
function itemsSummary(items) {
  const list = items || [];
  if (!list.length) return "Sin productos";
  return list.length > 1 ? `${list[0].name} y ${list.length - 1} más` : list[0].name;
}
function errText(e, fallback) {
  const d = e?.response?.data;
  if (typeof d === "string" && d) return d;
  if (d?.message) return d.message;
  return fallback;
}

// ---------- Existencias ----------
const menuName = computed(() => new Map(menus.value.map((m) => [String(m.id), m.name])));
const stockQuery = ref("");
const stockFilter = ref("all");
const stockCat = ref("");
const stockSort = ref("urgent");
const stockLimit = ref(60);
watch([stockQuery, stockFilter, stockCat, stockSort], () => (stockLimit.value = 60));

const stockItems = computed(() =>
  foods.value.map((f) => {
    const stock = Number(f.stock) || 0;
    const min = f.lowStockThreshold != null ? Number(f.lowStockThreshold) : 5;
    const cost = Number(f.cost) || 0;
    const state = stock <= 0 ? "out" : stock <= min ? "low" : "ok";
    const scale = Math.max(min * 2, stock, 1);
    return {
      id: String(f.id),
      name: f.name || "Producto",
      code: f.barcode || f.sku || "",
      category: menuName.value.get(String(f.menuId)) || "Sin categoría",
      menuId: String(f.menuId || ""),
      tracksExpiry: Boolean(f.tracksExpiry),
      stock,
      min,
      cost,
      value: stock * cost,
      state,
      stateText: state === "out" ? "Agotado" : state === "low" ? "Poco" : "Bien",
      pill: state === "out" ? "bad" : state === "low" ? "warn" : "good",
      fill: Math.min(100, (stock / scale) * 100),
      minPos: Math.min(100, (min / scale) * 100),
    };
  })
);
const stockCounts = computed(() => ({
  out: stockItems.value.filter((f) => f.state === "out").length,
  low: stockItems.value.filter((f) => f.state === "low").length,
  withStock: stockItems.value.filter((f) => f.stock > 0).length,
}));
const stockValue = computed(() => ({
  value: stockItems.value.reduce((s, f) => s + f.value, 0),
  missing: stockItems.value.filter((f) => f.stock > 0 && !(f.cost > 0)).length,
}));
const stockRows = computed(() => {
  const term = fold(stockQuery.value.trim());
  const rank = { out: 0, low: 1, ok: 2 };
  return stockItems.value
    .filter((f) => stockFilter.value === "all" || f.state === stockFilter.value)
    .filter((f) => !stockCat.value || f.menuId === stockCat.value)
    .filter((f) => !term || fold(f.name).includes(term) || fold(f.code).includes(term))
    .sort((a, b) => {
      if (stockSort.value === "value") return b.value - a.value;
      if (stockSort.value === "urgent" && rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
      if (stockSort.value === "urgent" && a.state !== "ok") return a.stock / (a.min || 1) - b.stock / (b.min || 1);
      return a.name.localeCompare(b.name, "es");
    });
});

// Ajuste manual
const adjusting = ref(null);
const adjustForm = reactive({ stock: 0, reason: "count", note: "" });
const adjustErr = ref("");
const adjustInput = ref(null);
const adjustDiff = computed(() => {
  if (!adjusting.value) return 0;
  const v = Number(adjustForm.stock);
  if (!Number.isFinite(v)) return 0;
  return Number((v - adjusting.value.stock).toFixed(3));
});
function openAdjust(f) {
  adjusting.value = f;
  adjustForm.stock = f.stock;
  adjustForm.reason = "count";
  adjustForm.note = "";
  adjustErr.value = "";
  nextTick(() => adjustInput.value?.select());
}
async function saveAdjust() {
  if (!adjusting.value) return;
  const value = Number(adjustForm.stock);
  if (!Number.isFinite(value) || value < 0) {
    adjustErr.value = "Escribe una cantidad de 0 en adelante.";
    return;
  }
  saving.value = true;
  adjustErr.value = "";
  try {
    const updated = await apiService.adjustStock({
      foodId: adjusting.value.id,
      stock: value,
      reason: adjustForm.reason,
      note: adjustForm.note.trim(),
    });
    const idx = foods.value.findIndex((f) => String(f.id) === adjusting.value.id);
    if (idx >= 0) foods.value[idx] = { ...foods.value[idx], stock: Number(updated?.stock ?? value) };
    say(`${adjusting.value.name}: existencia ajustada a ${qty(value)}.`);
    adjusting.value = null;
    loadActivity();
  } catch (e) {
    adjustErr.value = errText(e, "No se pudo guardar el ajuste.");
  } finally {
    saving.value = false;
  }
}

// ---------- Sugerido ----------
const suggestionGroups = computed(() => (Array.isArray(suggestions.value?.groups) ? suggestions.value.groups : []));
const suggestionCount = computed(() => suggestionGroups.value.reduce((s, g) => s + (g.itemCount || g.items?.length || 0), 0));
function orderText(g) {
  const lines = (g.items || []).map((i) => `• ${qty(i.suggestedQty)} × ${i.name}`);
  const who = venueStore.businessName ? `\n— ${venueStore.businessName}` : "";
  return `Hola${g.supplierId ? ` ${g.supplierName}` : ""}, le encargo por favor:\n${lines.join("\n")}\nGracias.${who}`;
}
function orderLink(g) {
  return waLink(g.whatsapp, orderText(g));
}
async function copyOrder(g) {
  const text = orderText(g);
  try {
    await navigator.clipboard.writeText(text);
    say("Lista copiada. Pégala en WhatsApp o en un mensaje.");
  } catch {
    window.prompt("Copia la lista:", text);
  }
}
function purchaseFromSuggestion(g) {
  const byId = new Map(foods.value.map((f) => [String(f.id), f]));
  openPurchase({
    supplierId: g.supplierId,
    items: (g.items || []).map((i) => {
      const f = byId.get(String(i.foodId));
      return lineFrom(f || { id: i.foodId, name: i.name, cost: i.unitCost }, Math.max(1, Math.ceil(Number(i.suggestedQty) || 1)));
    }),
  });
}

// ---------- Caducidad ----------
const expiryFilter = ref("all");
const expiryRows = computed(() => {
  const items = Array.isArray(expiry.value?.items) ? expiry.value.items : [];
  return expiryFilter.value === "all" ? items : items.filter((r) => r.bucket === expiryFilter.value);
});
const expiryAlert = computed(() => Number(expiry.value?.summary?.expired || 0) + Number(expiry.value?.summary?.d7 || 0));
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportExpiry() {
  const rows = (expiry.value.items || []).map((row) =>
    [
      row.foodName || "",
      row.lot || "",
      row.expiresAt ? new Date(row.expiresAt).toISOString().slice(0, 10) : "",
      row.daysLeft == null ? "" : row.daysLeft,
      Number(row.quantity) || 0,
      Number(row.unitCost) || 0,
      row.bucket === "expired" ? "Vencido" : `${row.daysLeft} dias`,
    ]
      .map(csvCell)
      .join(",")
  );
  const body = ["Producto,Lote,Caducidad,Dias,Cantidad,Costo unitario,Alerta", ...rows].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `caducidad_${todayISO()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Compras ----------
const purchaseQuery = ref("");
const purchaseRows = computed(() => {
  const term = fold(purchaseQuery.value.trim());
  const list = [...purchases.value].sort((a, b) => (toDate(b.date) || 0) - (toDate(a.date) || 0));
  if (!term) return list;
  return list.filter((p) => fold(p.supplierName).includes(term) || (p.items || []).some((i) => fold(i.name).includes(term)));
});
const purchaseStats = computed(() => {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();
  const pm = m === 0 ? 11 : m - 1;
  const py = m === 0 ? y - 1 : y;
  const out = { monthTotal: 0, monthCount: 0, prevTotal: 0, prevCount: 0 };
  for (const p of purchases.value) {
    const d = toDate(p.date);
    if (!d) continue;
    if (d.getMonth() === m && d.getFullYear() === y) {
      out.monthTotal += Number(p.totalCost) || 0;
      out.monthCount += 1;
    } else if (d.getMonth() === pm && d.getFullYear() === py) {
      out.prevTotal += Number(p.totalCost) || 0;
      out.prevCount += 1;
    }
  }
  return out;
});
const purchaseDetail = ref(null);

const showPurchase = ref(false);
const purchaseErr = ref("");
const purchaseForm = reactive({ supplierId: "", date: todayISO(), notes: "", items: [] });
const productQuery = ref("");
const productHits = ref([]);
const productInput = ref(null);
let productTimer = null;
const purchaseTotal = computed(() =>
  purchaseForm.items.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0)
);
function lineFrom(food, quantity = 1) {
  return {
    foodId: String(food.id),
    name: food.name,
    quantity,
    unitCost: Number(food.cost) || 0,
    prevCost: Number(food.cost) || 0,
    lot: "",
    expiresAt: "",
    tracksExpiry: Boolean(food.tracksExpiry),
    saleUnit: unitOf(food),
  };
}
function openPurchase(prefill = null) {
  if (!suppliers.value.length) {
    error.value = "Primero agrega a tu proveedor; luego registra lo que te entregó.";
    setTab("proveedores");
    return;
  }
  purchaseForm.supplierId = prefill?.supplierId || suppliers.value[0]?.id || "";
  purchaseForm.date = todayISO();
  purchaseForm.notes = "";
  purchaseForm.items = prefill?.items || [];
  productQuery.value = "";
  productHits.value = [];
  purchaseErr.value = "";
  showPurchase.value = true;
  nextTick(() => productInput.value?.focus());
}
watch(productQuery, (value) => {
  clearTimeout(productTimer);
  const q = value.trim();
  if (q.length < 2) {
    productHits.value = [];
    return;
  }
  // Primero busca en lo que ya está cargado; si no hay, pregunta al servidor
  const term = fold(q);
  const local = foods.value.filter((f) => fold(f.name).includes(term) || fold(f.barcode).includes(term)).slice(0, 8);
  if (local.length) {
    productHits.value = local;
    return;
  }
  productTimer = setTimeout(async () => {
    try {
      productHits.value = ((await apiService.searchFoods(q)) || []).slice(0, 8);
    } catch {
      productHits.value = [];
    }
  }, 220);
});
function addLine(food) {
  const existing = purchaseForm.items.find((l) => l.foodId === String(food.id));
  if (existing) existing.quantity = (Number(existing.quantity) || 0) + 1;
  else purchaseForm.items.push(lineFrom(food));
  productHits.value = [];
  productQuery.value = "";
  nextTick(() => productInput.value?.focus());
}
async function savePurchase() {
  if (!purchaseForm.items.length) return;
  // Piezas en enteros; a granel (kg, litros) con hasta 3 decimales
  const bad = purchaseForm.items.find((l) => {
    const q = Number(l.quantity);
    return l.saleUnit && l.saleUnit !== "pz" ? !(q > 0) : !(q >= 1) || !Number.isInteger(q);
  });
  if (bad) {
    purchaseErr.value =
      bad.saleUnit && bad.saleUnit !== "pz"
        ? `Revisa la cantidad de ${bad.name}: debe ser mayor a 0.`
        : `Revisa la cantidad de ${bad.name}: debe ser un número entero.`;
    return;
  }
  saving.value = true;
  purchaseErr.value = "";
  try {
    const created = await apiService.createPurchase({
      supplierId: purchaseForm.supplierId,
      date: purchaseForm.date,
      notes: purchaseForm.notes,
      items: purchaseForm.items.map((l) => ({
        foodId: l.foodId,
        quantity: Number(l.quantity) || 0,
        unitCost: Number(l.unitCost) || 0,
        lot: l.lot || "",
        expiresAt: l.tracksExpiry ? l.expiresAt : null,
      })),
    });
    purchases.value = [created, ...purchases.value];
    showPurchase.value = false;
    say(`Entrada registrada: ${purchaseForm.items.length} ${purchaseForm.items.length === 1 ? "producto" : "productos"} por ${money(created?.totalCost ?? purchaseTotal.value)}.`);
    loadFoods();
    loadSuggestions();
    loadExpiry();
    loadActivity();
  } catch (e) {
    purchaseErr.value = errText(e, "No se pudo registrar la compra.");
  } finally {
    saving.value = false;
  }
}

// ---------- Proveedores ----------
const supplierQuery = ref("");
const supplierRows = computed(() => {
  const term = fold(supplierQuery.value.trim());
  const list = [...suppliers.value].sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
  return term ? list.filter((s) => fold(s.name).includes(term) || fold(s.contact).includes(term)) : list;
});
const supplierStats = computed(() => {
  const out = {};
  const ensure = (id) => (out[id] ||= { products: 0, last: null, total: 0 });
  for (const f of foods.value) for (const id of f.supplierIds || []) ensure(String(id)).products += 1;
  for (const p of purchases.value) {
    const s = ensure(String(p.supplierId));
    s.total += Number(p.totalCost) || 0;
    const d = toDate(p.date);
    if (d && (!s.last || d > s.last)) s.last = d;
  }
  return out;
});
const showSupplier = ref(false);
const editingSupplier = ref(null);
const confirmDelete = ref(false);
const supplierForm = reactive({ name: "", contact: "", whatsapp: "", visitDays: [], notes: "" });
function openSupplier(s = null) {
  editingSupplier.value = s?.id || null;
  confirmDelete.value = false;
  supplierForm.name = s?.name || "";
  supplierForm.contact = s?.contact || "";
  supplierForm.whatsapp = s?.whatsapp || "";
  supplierForm.visitDays = (s?.visitDays || []).map(Number);
  supplierForm.notes = s?.notes || "";
  showSupplier.value = true;
}
function toggleDay(id) {
  const i = supplierForm.visitDays.indexOf(id);
  if (i >= 0) supplierForm.visitDays.splice(i, 1);
  else supplierForm.visitDays.push(id);
}
async function saveSupplier() {
  saving.value = true;
  error.value = "";
  try {
    const payload = { ...supplierForm, name: supplierForm.name.trim(), visitDays: [...supplierForm.visitDays] };
    if (editingSupplier.value) {
      const updated = await apiService.updateSupplier(editingSupplier.value, payload);
      const idx = suppliers.value.findIndex((x) => x.id === editingSupplier.value);
      if (idx >= 0) suppliers.value[idx] = updated;
      say(`${payload.name} actualizado.`);
    } else {
      const created = await apiService.createSupplier(payload);
      suppliers.value = [created, ...suppliers.value];
      say(`${payload.name} agregado.`);
    }
    showSupplier.value = false;
    loadActivity();
  } catch (e) {
    error.value = errText(e, "No se pudo guardar el proveedor.");
  } finally {
    saving.value = false;
  }
}
async function removeSupplier() {
  if (!confirmDelete.value) {
    confirmDelete.value = true;
    return;
  }
  const id = editingSupplier.value;
  const name = supplierForm.name;
  saving.value = true;
  try {
    await apiService.deleteSupplier(id);
    suppliers.value = suppliers.value.filter((x) => x.id !== id);
    showSupplier.value = false;
    say(`${name} eliminado. Sus compras anteriores se conservan.`);
    loadActivity();
  } catch (e) {
    error.value = errText(e, "No se pudo eliminar el proveedor.");
  } finally {
    saving.value = false;
  }
}

// ---------- Bitácora ----------
const activityGroups = computed(() => {
  const groups = [];
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label = (d) => {
    if (d.toDateString() === today.toDateString()) return "Hoy";
    if (d.toDateString() === yesterday.toDateString()) return "Ayer";
    const s = d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  for (const row of activity.value) {
    const d = toDate(row.createdAt);
    if (!d) continue;
    const key = d.toDateString();
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: label(d), rows: [] };
      groups.push(g);
    }
    g.rows.push(row);
  }
  return groups;
});
function iconOf(type) {
  if (type === "purchase_confirmed") return { name: "truck", tone: "good" };
  if (type === "stock_adjusted") return { name: "sliders", tone: "warn" };
  if (String(type).startsWith("supplier_")) return { name: "users", tone: "info" };
  return { name: "history", tone: "" };
}

// ---------- Carga ----------
const tabs = computed(() => [
  { id: "existencias", label: "Existencias", count: stockCounts.value.out + stockCounts.value.low, alert: stockCounts.value.out > 0 },
  { id: "sugerido", label: "Pedido sugerido", short: "Sugerido", count: suggestionCount.value },
  { id: "caducidad", label: "Caducidad", count: expiryAlert.value, alert: Number(expiry.value?.summary?.expired || 0) > 0 },
  { id: "compras", label: "Compras" },
  { id: "proveedores", label: "Proveedores", count: suppliers.value.length },
  { id: "bitacora", label: "Bitácora" },
]);
const headline = computed(() => {
  if (loading.foods) return "Cargando…";
  const parts = [`${foods.value.length} ${foods.value.length === 1 ? "producto" : "productos"}`];
  if (stockCounts.value.out) parts.push(`${stockCounts.value.out} ${stockCounts.value.out === 1 ? "agotado" : "agotados"}`);
  if (suppliers.value.length) parts.push(`${suppliers.value.length} ${suppliers.value.length === 1 ? "proveedor" : "proveedores"}`);
  return parts.join(" · ");
});

async function track(key, fn) {
  loading[key] = true;
  try {
    await fn();
  } finally {
    loading[key] = false;
  }
}
const asList = (v) => (Array.isArray(v) ? v : []);
function loadFoods() {
  return track("foods", async () => {
    const [f, m] = await Promise.allSettled([apiService.getAllFoods(), apiService.getAllMenus()]);
    if (f.status === "fulfilled") foods.value = asList(f.value);
    else error.value = "No se pudieron cargar los productos.";
    if (m.status === "fulfilled") menus.value = asList(m.value);
  });
}
function loadSuppliers() {
  return track("suppliers", async () => {
    try {
      suppliers.value = asList(await apiService.getSuppliers());
    } catch {
      error.value = "No se pudieron cargar los proveedores.";
    }
  });
}
function loadPurchases() {
  return track("purchases", async () => {
    try {
      purchases.value = asList(await apiService.getPurchases());
    } catch {
      purchases.value = [];
    }
  });
}
function loadExpiry() {
  return track("expiry", async () => {
    try {
      const data = await apiService.getExpiringLots(30);
      expiry.value = { summary: data?.summary || {}, items: asList(data?.items) };
    } catch {
      expiry.value = { summary: {}, items: [] };
    }
  });
}
function loadSuggestions() {
  return track("suggestions", async () => {
    try {
      suggestions.value = (await apiService.getPurchaseSuggestions()) || { groups: [] };
    } catch {
      suggestions.value = { groups: [] };
    }
  });
}
function loadActivity() {
  return track("activity", async () => {
    try {
      activity.value = asList(await apiService.getInventoryActivity(120));
    } catch {
      activity.value = [];
    }
  });
}

onMounted(() => {
  fetchVenueSettings()
    .catch(() => {})
    .finally(() => (settingsLoaded.value = true));
  loadFoods();
  loadSuppliers();
  loadPurchases();
  loadExpiry();
  loadSuggestions();
  loadActivity();
});
</script>

<style scoped>
.sec > * + * { margin-top: 0.75rem; }
.tool-selects { display: flex; gap: 0.5rem; }
.tool-selects .adm-inp { min-height: 2.5rem; width: auto; max-width: 15rem; font-size: 0.9rem; }
.more-row { display: flex; justify-content: center; }

/* Existencias */
.stock-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0.9rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.stock-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 11rem 4.6rem 6.5rem auto;
  align-items: center;
  gap: 0.9rem;
  padding: 0.65rem 0;
}
.stock-row + .stock-row { border-top: 1px solid var(--timber-line); }
.st-main { display: grid; min-width: 0; }
.st-main strong { overflow: hidden; font-size: 0.95rem; text-overflow: ellipsis; white-space: nowrap; }
.st-main small { overflow: hidden; font-size: 0.78rem; color: var(--timber-muted); text-overflow: ellipsis; white-space: nowrap; }
.st-level { display: grid; gap: 0.3rem; }
.st-num { display: flex; align-items: baseline; justify-content: space-between; gap: 0.4rem; }
.st-num b { font-size: 1.1rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.st-num small { font-size: 0.74rem; color: var(--timber-muted); }
.st-meter {
  position: relative;
  height: 0.4rem;
  border-radius: 999px;
  background: var(--timber-surface);
}
.st-meter i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--timber-success);
}
.st-meter span {
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--timber-ink);
  opacity: 0.45;
}
.stock-row.low .st-meter i { background: var(--timber-warning); }
.stock-row.out .st-num b { color: var(--timber-danger); }
.st-pill { justify-self: start; }
.st-value { font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; }

/* Sugerido */
.sug-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.sug-who { flex: 1 1 12rem; min-width: 0; }
.sug-who h2 { margin: 0; font-size: 1.05rem; font-weight: 800; }
.sug-who p { margin: 0.1rem 0 0; font-size: 0.82rem; font-weight: 600; color: var(--timber-muted); }
.sug-acts { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.sug-table { display: grid; }
.sug-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 5.5rem 6rem 4.5rem 6rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}
.sug-row + .sug-row { border-top: 1px solid var(--timber-line); }
.sug-row.hdr {
  padding-top: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.sug-row > :not(:first-child) { text-align: right; }
.sug-row small { color: var(--timber-muted); }
.sug-row .out { color: var(--timber-danger); font-weight: 800; }
.sug-name { overflow: hidden; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.sug-qty {
  display: inline-block;
  min-width: 2.6rem;
  padding: 0.15rem 0.5rem;
  border-radius: 0.5rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  font-weight: 800;
  text-align: center;
}

/* Caducidad */
.exp-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0.9rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.exp-row {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr) auto 6.5rem;
  align-items: center;
  gap: 0.85rem;
  padding: 0.6rem 0;
}
.exp-row + .exp-row { border-top: 1px solid var(--timber-line); }
.exp-days {
  display: grid;
  justify-items: center;
  padding: 0.3rem 0;
  border-radius: 0.75rem;
  background: var(--timber-surface);
  line-height: 1.1;
}
.exp-days b { font-size: 1.15rem; font-weight: 800; }
.exp-days small { font-size: 0.66rem; font-weight: 700; color: var(--timber-muted); }
.exp-days.expired { background: var(--timber-danger); color: #fff; }
.exp-days.expired small { color: rgba(255, 255, 255, 0.85); }
.exp-days.d7 { background: var(--timber-warning-soft); }
.exp-main { display: grid; min-width: 0; }
.exp-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.exp-main small { font-size: 0.78rem; color: var(--timber-muted); }
.exp-qty { font-size: 0.86rem; font-weight: 700; color: var(--timber-muted); white-space: nowrap; }
.exp-value { font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; }

/* Compras */
.buy-list {
  list-style: none;
  margin: 0;
  padding: 0.3rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.buy-list li + li { border-top: 1px solid var(--timber-line); }
.buy-row {
  width: 100%;
  display: grid;
  grid-template-columns: 3.2rem minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.85rem;
  padding: 0.6rem;
  border: none;
  border-radius: 0.75rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.buy-row:hover { background: var(--timber-panel-elevated); }
.buy-date {
  display: grid;
  justify-items: center;
  padding: 0.3rem 0;
  border-radius: 0.75rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  line-height: 1.05;
}
.buy-date b { font-size: 1.15rem; font-weight: 800; }
.buy-date small { font-size: 0.68rem; font-weight: 800; text-transform: uppercase; }
.buy-main { display: grid; min-width: 0; }
.buy-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.buy-main small { overflow: hidden; font-size: 0.8rem; color: var(--timber-muted); text-overflow: ellipsis; white-space: nowrap; }
.buy-total { font-weight: 800; font-variant-numeric: tabular-nums; }
.buy-chev { color: var(--timber-muted); }

/* Proveedores */
.sup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr));
  gap: 0.75rem;
}
.sup { display: grid; align-content: start; gap: 0.75rem; }
.sup-top { display: flex; align-items: center; gap: 0.7rem; }
.sup-who { flex: 1; min-width: 0; }
.sup-who h3 { overflow: hidden; margin: 0; font-size: 1rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.sup-who p { margin: 0.05rem 0 0; font-size: 0.82rem; color: var(--timber-muted); }
.sup-visit { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; }
.sup-visit > span { font-size: 0.76rem; font-weight: 800; color: var(--timber-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.sup-visit small { font-size: 0.78rem; font-weight: 700; color: var(--timber-primary); }
.sup-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  margin: 0;
  padding: 0.6rem 0.7rem;
  border-radius: 0.8rem;
  background: var(--timber-surface);
}
.sup-stats dt { font-size: 0.7rem; font-weight: 700; color: var(--timber-muted); }
.sup-stats dd { margin: 0.1rem 0 0; overflow: hidden; font-size: 0.88rem; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; font-variant-numeric: tabular-nums; }
.sup-notes { margin: 0; font-size: 0.84rem; color: var(--timber-muted); line-height: 1.4; }
.sup-acts { display: flex; gap: 0.4rem; }
.sup-acts .adm-btn { flex: 1; }

/* Bitácora */
.log { display: grid; gap: 1rem; }
.log-day h3 {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.log-day ul {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0.9rem;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
}
.log-day li { display: flex; align-items: flex-start; gap: 0.7rem; padding: 0.6rem 0; }
.log-day li + li { border-top: 1px solid var(--timber-line); }
.log-day li p { margin: 0; font-size: 0.9rem; line-height: 1.4; overflow-wrap: anywhere; }
.log-day li small { font-size: 0.76rem; color: var(--timber-muted); }
.log-ico {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.6rem;
  background: var(--timber-surface);
  color: var(--timber-muted);
}
.log-ico.good { background: var(--timber-success-soft); color: var(--timber-success); }
.log-ico.warn { background: var(--timber-warning-soft); color: var(--timber-warning); }
.log-ico.info { background: var(--timber-primary-soft); color: var(--timber-primary); }

/* Diálogo de compra */
.buy-add { position: relative; }
.buy-add .adm-search { max-width: none; }
.hits {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 0.3rem);
  z-index: 5;
  list-style: none;
  margin: 0;
  padding: 0.3rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.85rem;
  background: var(--timber-panel);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.18);
}
.hits button {
  width: 100%;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.6rem 0.7rem;
  border: none;
  border-radius: 0.6rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hits button:hover { background: var(--timber-primary-soft); }
.hits small { flex-shrink: 0; font-size: 0.78rem; color: var(--timber-muted); }
.lines { display: grid; gap: 0.5rem; }
.line {
  display: grid;
  gap: 0.5rem;
  padding: 0.7rem 0.8rem;
  border: 1px solid var(--timber-line);
  border-radius: 0.9rem;
  background: var(--timber-panel-elevated);
}
.line-top { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.line-top strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm-dlg-x.sm { width: 2rem; height: 2rem; color: var(--timber-danger); }
.line-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.9fr); gap: 0.5rem; align-items: end; }
.line-sub { display: grid; justify-items: end; gap: 0.3rem; padding-bottom: 0.65rem; }
.line-sub span { font-size: 0.82rem; font-weight: 700; color: var(--timber-muted); }
.line-sub b { font-variant-numeric: tabular-nums; }
.lines-empty { padding: 0.9rem; border: 1.5px dashed var(--timber-line); border-radius: 0.9rem; text-align: center; }
.buy-sum {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 0.9rem;
  border-radius: 0.85rem;
  background: var(--timber-surface);
  font-weight: 700;
}
.buy-sum b { font-size: 1.3rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.detail-items { list-style: none; margin: 0; padding: 0; }
.detail-items li { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.55rem 0; }
.detail-items li + li { border-top: 1px solid var(--timber-line); }
.detail-items div { display: grid; min-width: 0; }
.detail-items small { font-size: 0.8rem; color: var(--timber-muted); }
.detail-items b { font-variant-numeric: tabular-nums; }

/* Diálogo de ajuste */
.counter { display: grid; grid-template-columns: 3.4rem minmax(0, 1fr) 3.4rem; gap: 0.5rem; }
.counter .adm-btn { min-height: 3.6rem; padding: 0; }
.adm-inp.big { min-height: 3.6rem; font-size: 1.7rem; font-weight: 800; text-align: center; }
.adj-diff { margin: 0; text-align: center; font-size: 0.92rem; font-weight: 800; color: var(--timber-muted); }
.adj-diff.up { color: var(--timber-success); }
.adj-diff.down { color: var(--timber-danger); }
.reasons { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.reasons .adm-choice { justify-items: center; text-align: center; padding: 0.6rem; }

/* Celular */
@media (max-width: 767.98px) {
  .tool-selects { width: 100%; }
  .tool-selects .adm-inp { flex: 1; max-width: none; min-width: 0; }
  .stock-list, .exp-list { padding: 0.15rem 0.75rem; }
  .stock-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "main pill"
      "level act";
    gap: 0.4rem 0.75rem;
  }
  .st-main { grid-area: main; }
  .st-pill { grid-area: pill; justify-self: end; }
  .st-level { grid-area: level; }
  .st-value { display: none; }
  .st-adjust { grid-area: act; }
  .sug-row { grid-template-columns: minmax(0, 1fr) 4.5rem 3.8rem; gap: 0.5rem; }
  .sug-acts { width: 100%; }
  .sug-acts .adm-btn { flex: 1 1 auto; }
  .exp-row { grid-template-columns: 3.1rem minmax(0, 1fr) auto; }
  .exp-value { display: none; }
  .buy-chev { display: none; }
  .line-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .line-sub { grid-column: 1 / -1; display: flex; justify-content: space-between; padding: 0; }
}
</style>

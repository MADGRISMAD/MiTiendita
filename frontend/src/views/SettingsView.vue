<template>
  <AppShell>
    <div class="adm cfg" :class="{ 'has-bar': dirty }">
      <div class="cfg-layout" :class="{ 'section-open': Boolean(section) }">
        <!-- Menú de secciones -->
        <nav class="cfg-nav" aria-label="Secciones de configuración">
          <header class="cfg-nav-head">
            <h1>Configuración</h1>
            <p>{{ venueStore.businessName || 'Tu tienda' }}</p>
          </header>
          <div v-for="g in NAV" :key="g.title" class="cfg-group">
            <h2>{{ g.title }}</h2>
            <template v-for="item in g.items" :key="item.id">
              <router-link v-if="item.to" :to="item.to" class="cfg-item">
                <span class="cfg-ico" :class="item.tone"><PosIcon :name="item.icon" :size="19" /></span>
                <span class="cfg-txt"><strong>{{ item.label }}</strong><small>{{ item.desc }}</small></span>
                <PosIcon name="chevron" :size="18" class="cfg-chev" />
              </router-link>
              <button
                v-else
                type="button"
                class="cfg-item"
                :class="{ on: section === item.id }"
                :aria-current="section === item.id ? 'page' : undefined"
                @click="open(item.id)"
              >
                <span class="cfg-ico" :class="item.tone"><PosIcon :name="item.icon" :size="19" /></span>
                <span class="cfg-txt">
                  <strong>{{ item.label }}<i v-if="dirtyIn(item.id)" class="cfg-dot" aria-label="Con cambios sin guardar"></i></strong>
                  <small>{{ item.desc }}</small>
                </span>
                <PosIcon name="chevron" :size="18" class="cfg-chev" />
              </button>
            </template>
          </div>
          <button type="button" class="cfg-item logout" @click="logout">
            <span class="cfg-ico bad"><PosIcon name="logout" :size="19" /></span>
            <span class="cfg-txt"><strong>Cerrar sesión</strong><small>{{ authStore.username ? `Sales como ${authStore.username}` : 'Salir de este dispositivo' }}</small></span>
          </button>
        </nav>

        <!-- Contenido -->
        <main v-if="section" class="cfg-main">
          <header class="cfg-sec-head">
            <button type="button" class="adm-btn icon cfg-back" aria-label="Volver a Configuración" @click="back">
              <PosIcon name="back" :size="20" />
            </button>
            <div>
              <h2>{{ current.label }}</h2>
              <p>{{ current.lead }}</p>
            </div>
          </header>

          <p v-if="flash" class="adm-banner ok" role="status"><PosIcon name="check" :size="18" /> <span>{{ flash }}</span></p>
          <p v-if="saveErr" class="adm-banner err" role="alert">
            <PosIcon name="alert" :size="18" /> <span>{{ saveErr }}</span>
            <button type="button" class="adm-x" aria-label="Cerrar aviso" @click="saveErr = ''"><PosIcon name="x" :size="16" /></button>
          </p>

          <!-- ======= Mi negocio ======= -->
          <template v-if="section === 'negocio'">
            <div class="cfg-split">
              <div class="cfg-col">
                <section class="adm-card cfg-card">
                  <h3>Datos del negocio</h3>
                  <label class="adm-field">
                    <span>Nombre de la tienda</span>
                    <input v-model="form.businessName" class="adm-inp" maxlength="80" placeholder="Abarrotes Doña Lupe" :aria-invalid="nameError ? 'true' : 'false'" />
                  </label>
                  <p v-if="nameError" class="adm-err">{{ nameError }}</p>
                  <div class="adm-field">
                    <span>Giro</span>
                    <div class="kinds">
                      <button
                        v-for="k in KINDS"
                        :key="k.id"
                        type="button"
                        class="adm-choice"
                        :aria-pressed="form.businessType === k.id"
                        @click="form.businessType = k.id"
                      >
                        <strong>{{ k.label }}</strong>
                        <small>{{ k.hint }}</small>
                      </button>
                    </div>
                  </div>
                  <label class="adm-field">
                    <span>Dirección <em>(sale en el ticket)</em></span>
                    <input v-model="form.address" class="adm-inp" maxlength="200" placeholder="Calle, número y colonia" />
                  </label>
                  <div class="adm-row2">
                    <label class="adm-field">
                      <span>Teléfono <em>(opcional)</em></span>
                      <input v-model="form.phone" class="adm-inp" type="tel" inputmode="tel" maxlength="30" placeholder="222 123 4567" @blur="form.phone = prettyPhone(form.phone)" />
                    </label>
                    <label class="adm-field">
                      <span>Zona horaria</span>
                      <select v-model="form.timezone" class="adm-inp">
                        <option v-for="z in ZONES" :key="z.id" :value="z.id">{{ z.label }}</option>
                      </select>
                    </label>
                  </div>
                  <p class="adm-hint">En tu zona son las <b>{{ zoneClock }}</b>. Se usa para el corte, los reportes y la hora de los tickets.</p>
                </section>

                <section class="adm-card cfg-card">
                  <h3>Logo</h3>
                  <div class="logo-row">
                    <span class="logo-box"><img :src="form.logoUrl || '/logo.svg'" alt="Logo de la tienda" /></span>
                    <div class="logo-acts">
                      <label class="adm-btn">
                        <PosIcon name="image" :size="18" /> Subir imagen
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" @change="onLogo" />
                      </label>
                      <button v-if="form.logoUrl && form.logoUrl !== '/logo.svg'" type="button" class="adm-btn danger-ghost" @click="form.logoUrl = '/logo.svg'">
                        Usar el de Mi Tiendita
                      </button>
                      <p class="adm-hint">PNG o JPG cuadrado. Lo ajustamos a 256 px para que cargue rápido. Aparece arriba en la app.</p>
                      <p v-if="logoErr" class="adm-err">{{ logoErr }}</p>
                    </div>
                  </div>
                </section>
              </div>

              <aside class="cfg-col">
                <section class="adm-card cfg-card preview-card">
                  <h3>Así sale en tu ticket</h3>
                  <div class="mini-ticket" aria-hidden="true">
                    <div class="tk-paper w58">
                      <TicketHeader :preview="form" />
                      <p class="tk-sec">Lo que llevas</p>
                      <div class="tk-line"><span>2 × Coca-Cola 600 ml</span><i class="tk-dots"></i><span>$36.00</span></div>
                      <div class="tk-line"><span>1 × Pan de caja</span><i class="tk-dots"></i><span>$52.00</span></div>
                      <div class="tk-total"><span>Total</span><strong><sup>$</sup>88.00</strong></div>
                      <p class="tk-hand">{{ thanksPreview }}</p>
                    </div>
                  </div>
                </section>
                <router-link to="/setup" class="cfg-wizard">
                  <PosIcon name="spark" :size="18" />
                  <span><strong>Asistente inicial</strong><small>Vuelve a recorrer la configuración paso a paso.</small></span>
                  <PosIcon name="chevron" :size="18" />
                </router-link>
              </aside>
            </div>
          </template>

          <!-- ======= Ventas e impuestos ======= -->
          <template v-else-if="section === 'ventas'">
            <section class="adm-card cfg-card">
              <h3>Tasa de IVA</h3>
              <p class="adm-hint">Con ella se desglosa el IVA en tickets, corte y reportes. Si un precio lleva IVA incluido o no se decide en cada producto.</p>
              <div class="adm-choices taxes">
                <button
                  v-for="t in TAXES"
                  :key="t.value"
                  type="button"
                  class="adm-choice"
                  :aria-pressed="taxChoice === t.value"
                  @click="pickTax(t.value)"
                >
                  <strong>{{ t.label }}</strong>
                  <small>{{ t.hint }}</small>
                </button>
              </div>
              <label v-if="taxChoice === 'other'" class="adm-field tax-other">
                <span>Otra tasa (%)</span>
                <input v-model.number="form.taxPercent" class="adm-inp num" type="number" min="0" max="100" step="0.5" inputmode="decimal" />
              </label>
              <p v-if="taxError" class="adm-err">{{ taxError }}</p>
              <div class="example">
                <span>Ejemplo</span>
                <p>
                  Un producto de <b>{{ money(100 * (1 + taxRate)) }}</b> con IVA incluido lleva
                  <b>{{ money(100 * taxRate) }}</b> de IVA ({{ pctText }}).
                </p>
              </div>
            </section>

            <section class="adm-card cfg-card">
              <div class="switch-head">
                <div>
                  <h3>Comisión por pago con tarjeta</h3>
                  <p class="adm-hint">
                    Para compensar lo que cobra la terminal (Mercado Pago u otra). Si la activas, al cobrar con tarjeta
                    en Vender y en Caja ya sale marcada y el cajero puede quitarla para un cliente.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  class="adm-switch"
                  :aria-checked="form.cardFeeEnabled"
                  aria-label="Cobrar comisión por pago con tarjeta"
                  @click="form.cardFeeEnabled = !form.cardFeeEnabled"
                ></button>
              </div>
              <template v-if="form.cardFeeEnabled">
                <div class="adm-choices fees">
                  <button
                    v-for="f in FEES"
                    :key="f.value"
                    type="button"
                    class="adm-choice"
                    :aria-pressed="feeChoice === f.value"
                    @click="pickFee(f.value)"
                  >
                    <strong>{{ f.label }}</strong>
                    <small>{{ f.hint }}</small>
                  </button>
                </div>
                <label v-if="feeChoice === 'other'" class="adm-field tax-other">
                  <span>Otro porcentaje (%)</span>
                  <input v-model.number="form.cardFeePercent" class="adm-inp num" type="number" min="0" max="30" step="0.1" inputmode="decimal" />
                </label>
                <p v-if="feeError" class="adm-err">{{ feeError }}</p>
                <div class="example">
                  <span>Ejemplo</span>
                  <p>
                    En una venta de <b>{{ money(100) }}</b> pagada con tarjeta, el cliente paga
                    <b>{{ money(100 * (1 + feeRate)) }}</b>. En el ticket sale como «Comisión por pago con tarjeta».
                  </p>
                </div>
              </template>
              <p v-else class="state-line off"><i></i>Apagada: con tarjeta se cobra lo mismo que en efectivo.</p>
            </section>
          </template>

          <!-- ======= Inventario ======= -->
          <template v-else-if="section === 'inventario'">
            <section class="adm-card cfg-card">
              <div class="switch-head">
                <div>
                  <h3>Llevar inventario</h3>
                  <p class="adm-hint">Cada venta resta lo vendido de las existencias y cada compra las suma. Si lo apagas, vender no toca existencias.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  class="adm-switch"
                  :aria-checked="form.inventoryEnabled"
                  aria-label="Llevar inventario"
                  @click="form.inventoryEnabled = !form.inventoryEnabled"
                ></button>
              </div>
              <p class="state-line" :class="form.inventoryEnabled ? 'on' : 'off'">
                <i></i>{{ form.inventoryEnabled ? 'Activo: las ventas descuentan existencias.' : 'Apagado: las existencias no cambian al vender.' }}
              </p>
            </section>
            <section v-if="form.inventoryEnabled" class="adm-card cfg-card">
              <div class="switch-head">
                <div>
                  <h3>Permitir vender sin existencias</h3>
                  <p class="adm-hint">Si lo apagas, no se puede cobrar un producto del que no hay piezas suficientes. Si lo prendes, la venta pasa, el stock queda en negativo y la venta se marca para revisar.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  class="adm-switch"
                  :aria-checked="form.allowNegativeStock"
                  aria-label="Permitir vender sin existencias"
                  @click="form.allowNegativeStock = !form.allowNegativeStock"
                ></button>
              </div>
              <p class="state-line" :class="form.allowNegativeStock ? 'on' : 'off'">
                <i></i>{{ form.allowNegativeStock ? 'Sí: se vende aunque no haya stock y queda marcada para revisión.' : 'No: sin existencias no se puede cobrar.' }}
              </p>
            </section>
            <section class="adm-card cfg-card">
              <h3>Costo al registrar una compra</h3>
              <p class="adm-hint">Define con qué costo se calcula tu ganancia.</p>
              <div class="adm-choices">
                <button type="button" class="adm-choice" :aria-pressed="form.costMethod === 'last'" @click="form.costMethod = 'last'">
                  <strong>Último costo</strong>
                  <small>Toma el precio de la compra más reciente. Si la Coca te llegó a $13, su costo pasa a $13.</small>
                </button>
                <button type="button" class="adm-choice" :aria-pressed="form.costMethod === 'average'" @click="form.costMethod = 'average'">
                  <strong>Promedio</strong>
                  <small>Mezcla lo que ya tenías con lo nuevo. 10 a $12 + 10 a $14 quedan a $13.</small>
                </button>
              </div>
            </section>
            <router-link to="/inventory" class="cfg-wizard">
              <PosIcon name="box" :size="18" />
              <span><strong>Ir a Inventario</strong><small>Existencias, compras, proveedores y caducidad.</small></span>
              <PosIcon name="chevron" :size="18" />
            </router-link>
          </template>

          <!-- ======= Impresora ======= -->
          <template v-else-if="section === 'impresora'">
            <section class="adm-card cfg-card">
              <h3>Cómo sale el ticket</h3>
              <p class="adm-hint">Se guarda solo en este dispositivo: cada caja elige su impresora. No necesita «Guardar cambios».</p>
              <div class="adm-choices printer-modes">
                <button
                  v-for="m in PRINTER_MODES"
                  :key="m.id"
                  type="button"
                  class="adm-choice"
                  :aria-pressed="printerStore.mode === m.id"
                  :disabled="m.id !== 'browser' && !printerSupport()[m.id]"
                  @click="setPrinterMode(m.id)"
                >
                  <strong>{{ m.label }}</strong>
                  <small>{{ m.id !== 'browser' && !printerSupport()[m.id] ? 'Este navegador no lo permite. Usa Chrome o Edge.' : m.hint }}</small>
                </button>
              </div>
            </section>
            <section v-if="printerStore.mode !== 'browser'" class="adm-card cfg-card">
              <h3>Impresora térmica</h3>
              <p class="state-line" :class="printerStore.connected ? 'on' : 'off'">
                <i></i>{{ printerStore.connected ? `Conectada: ${printerStore.deviceName}` : printerStore.deviceName ? `Elegida: ${printerStore.deviceName} (se conecta al imprimir)` : 'Sin impresora elegida' }}
              </p>
              <div class="adm-choices">
                <button type="button" class="adm-choice" :aria-pressed="printerStore.paper === '80'" @click="savePrinterSettings({ paper: '80' })">
                  <strong>Papel 80 mm</strong><small>48 letras por renglón</small>
                </button>
                <button type="button" class="adm-choice" :aria-pressed="printerStore.paper === '58'" @click="savePrinterSettings({ paper: '58' })">
                  <strong>Papel 58 mm</strong><small>32 letras por renglón</small>
                </button>
              </div>
              <label v-if="printerStore.mode === 'serial'" class="adm-field">
                <span>Velocidad del puerto</span>
                <select class="adm-inp" :value="printerStore.baudRate" @change="savePrinterSettings({ baudRate: Number($event.target.value) })">
                  <option v-for="b in [9600, 19200, 38400, 115200]" :key="b" :value="b">{{ b }}</option>
                </select>
              </label>
              <div class="switch-head">
                <div>
                  <h3>Abrir el cajón al cobrar en efectivo</h3>
                  <p class="adm-hint">Manda el pulso al cajón conectado a la impresora (conector RJ11).</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  class="adm-switch"
                  :aria-checked="printerStore.drawer"
                  aria-label="Abrir el cajón al cobrar en efectivo"
                  @click="savePrinterSettings({ drawer: !printerStore.drawer })"
                ></button>
              </div>
              <div class="printer-acts">
                <button type="button" class="adm-btn" :disabled="printerStore.busy" @click="choosePrinter">
                  <PosIcon name="printer" :size="17" /> {{ printerStore.deviceName ? 'Cambiar impresora' : 'Elegir impresora' }}
                </button>
                <button type="button" class="adm-btn primary" :disabled="printerStore.busy" @click="testPrint">
                  {{ printerStore.busy ? 'Imprimiendo…' : 'Imprimir prueba' }}
                </button>
              </div>
              <p v-if="printerErr" class="adm-banner warn">{{ printerErr }}</p>
            </section>
          </template>

          <!-- ======= Apariencia ======= -->
          <template v-else-if="section === 'apariencia'">
            <section class="adm-card cfg-card">
              <h3>Tema</h3>
              <p class="adm-hint">Solo cambia en este dispositivo. El oscuro cansa menos la vista de noche.</p>
              <div class="themes">
                <button type="button" class="theme-card light" :aria-pressed="!isDark" @click="applyUiTheme('light')">
                  <span class="theme-mock" aria-hidden="true"><i></i><b></b><b></b><em></em></span>
                  <span class="theme-name"><PosIcon name="sun" :size="17" /> Claro</span>
                </button>
                <button type="button" class="theme-card dark" :aria-pressed="isDark" @click="applyUiTheme('dark')">
                  <span class="theme-mock" aria-hidden="true"><i></i><b></b><b></b><em></em></span>
                  <span class="theme-name"><PosIcon name="moon" :size="17" /> Oscuro</span>
                </button>
              </div>
            </section>
          </template>

          <!-- ======= Mi cuenta ======= -->
          <template v-else-if="section === 'cuenta'">
            <section class="adm-card cfg-card me-card">
              <span class="adm-avatar big" :style="{ '--h': 214 }">{{ initials(authStore.username) }}</span>
              <div>
                <strong>{{ authStore.username || 'Usuario' }}</strong>
                <small>{{ authStore.email || 'Sin correo registrado' }}</small>
              </div>
              <span class="adm-pill info">{{ roleText }}</span>
            </section>
            <form class="adm-card cfg-card" @submit.prevent="changePassword">
              <h3>Cambiar contraseña</h3>
              <label class="adm-field">
                <span>Contraseña actual</span>
                <span class="pass">
                  <input v-model="pwForm.current" class="adm-inp" :type="showPw ? 'text' : 'password'" required autocomplete="current-password" />
                </span>
              </label>
              <label class="adm-field">
                <span>Nueva contraseña</span>
                <span class="pass">
                  <input v-model="pwForm.newPw" class="adm-inp" :type="showPw ? 'text' : 'password'" required minlength="6" autocomplete="new-password" />
                  <button type="button" class="eye" :aria-label="showPw ? 'Ocultar contraseñas' : 'Mostrar contraseñas'" @click="showPw = !showPw">
                    <PosIcon :name="showPw ? 'eye-off' : 'eye'" :size="19" />
                  </button>
                </span>
              </label>
              <div v-if="pwForm.newPw" class="strength" :class="`s${pwScore}`" aria-live="polite">
                <i></i><i></i><i></i><span>{{ ['Muy corta', 'Débil', 'Regular', 'Fuerte'][pwScore] }}</span>
              </div>
              <label class="adm-field">
                <span>Repite la nueva</span>
                <input v-model="pwForm.confirm" class="adm-inp" :type="showPw ? 'text' : 'password'" required minlength="6" autocomplete="new-password" />
              </label>
              <p v-if="pwForm.confirm && pwForm.confirm !== pwForm.newPw" class="adm-err">No coinciden.</p>
              <p v-if="pwErr" class="adm-err">{{ pwErr }}</p>
              <p v-if="pwMsg" class="adm-banner ok"><PosIcon name="check" :size="18" /> {{ pwMsg }}</p>
              <button type="submit" class="adm-btn primary" :disabled="pwBusy">{{ pwBusy ? 'Cambiando…' : 'Cambiar contraseña' }}</button>
            </form>
            <section class="adm-card cfg-card">
              <h3>Sesión</h3>
              <p class="adm-hint">Si usas un equipo prestado, cierra la sesión al terminar.</p>
              <button type="button" class="adm-btn danger-ghost logout-btn" @click="logout">
                <PosIcon name="logout" :size="18" /> Cerrar sesión en este dispositivo
              </button>
            </section>
          </template>

          <!-- ======= Soporte ======= -->
          <template v-else-if="section === 'soporte'">
            <form class="adm-card cfg-card" @submit.prevent="sendSupport">
              <h3>Escríbenos</h3>
              <p class="adm-hint">
                Te contestamos por correo{{ authStore.email ? ` a ${authStore.email}` : '' }}. Solo tú ves tus conversaciones.
              </p>
              <label class="adm-field">
                <span>Asunto</span>
                <input v-model="support.subject" class="adm-inp" required minlength="3" maxlength="140" placeholder="No puedo abrir caja" />
              </label>
              <label class="adm-field">
                <span>¿Qué pasa?</span>
                <textarea v-model="support.message" class="adm-inp" required minlength="8" rows="5" placeholder="Cuéntanos qué hiciste, en qué pantalla y qué esperabas que pasara."></textarea>
              </label>
              <p v-if="supportErr" class="adm-err">{{ supportErr }}</p>
              <p v-if="supportMsg" class="adm-banner ok"><PosIcon name="check" :size="18" /> {{ supportMsg }}</p>
              <button type="submit" class="adm-btn primary" :disabled="supportBusy">
                <PosIcon name="chat" :size="18" /> {{ supportBusy ? 'Enviando…' : 'Enviar a soporte' }}
              </button>
            </form>
            <section class="adm-card cfg-card">
              <h3>Tus conversaciones</h3>
              <p v-if="supportNote" class="adm-hint">{{ supportNote }}</p>
              <ul v-if="tickets.length" class="threads">
                <li v-for="t in tickets" :key="t.id">
                  <button type="button" class="thread-head" :aria-expanded="openTicket === t.id" @click="openTicket = openTicket === t.id ? '' : t.id">
                    <span class="thread-main">
                      <strong>{{ t.subject }}</strong>
                      <small>{{ t.messages?.length || 0 }} {{ (t.messages?.length || 0) === 1 ? 'mensaje' : 'mensajes' }}<template v-if="t.updatedAt"> · {{ when(t.updatedAt) }}</template></small>
                    </span>
                    <span class="adm-pill" :class="t.status === 'open' ? 'warn' : 'good'">{{ t.status === 'open' ? 'Esperando respuesta' : 'Respondida' }}</span>
                  </button>
                  <div v-if="openTicket === t.id" class="bubbles">
                    <div v-for="(m, i) in t.messages || []" :key="m.id || i" class="bubble" :class="m.direction === 'out' ? 'them' : 'me'">
                      <p>{{ m.text || m.snippet || '(sin texto)' }}</p>
                      <small>{{ m.direction === 'out' ? 'Soporte' : 'Tú' }}<template v-if="m.at"> · {{ when(m.at) }}</template></small>
                    </div>
                  </div>
                </li>
              </ul>
              <p v-else-if="!supportNote" class="adm-hint">Aún no nos has escrito.</p>
            </section>
          </template>
        </main>
      </div>

      <!-- Cambios sin guardar -->
      <div v-if="dirty" class="cfg-savebar" role="region" aria-label="Cambios sin guardar">
        <span><i class="cfg-dot"></i> Tienes cambios sin guardar</span>
        <div>
          <button type="button" class="adm-btn" :disabled="saving" @click="discard">Descartar</button>
          <button type="button" class="adm-btn primary" :disabled="saving || Boolean(nameError || taxError || feeError)" @click="save">
            {{ saving ? 'Guardando…' : 'Guardar cambios' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import "../admin.css";
import "../ticket.css";
import AppShell from "../components/AppShell.vue";
import PosIcon from "../components/PosIcon.js";
import TicketHeader from "../components/TicketHeader.vue";
import { apiService } from "../apiService";
import { currentVenueSettings, fetchVenueSettings, saveVenueSettings, venueStore } from "../venueStore";
import { themeStore, applyUiTheme } from "../themeStore";
import { authStore, clearSession } from "../authStore";
import { closingLine } from "../ticketShell";
import { prettyPhone } from "../phone";
import { printerStore, printerSupport, printTestPage, savePrinterSettings, connectPrinter } from "../thermalPrinter";

const PRINTER_MODES = [
  { id: "browser", label: "Navegador (actual)", hint: "Abre el ticket y el diálogo de imprimir de Chrome. Sirve con cualquier impresora." },
  { id: "usb", label: "Térmica USB", hint: "Sale directo, sin diálogo. Chrome en PC o Android (con cable OTG)." },
  { id: "serial", label: "Térmica USB (puerto COM)", hint: "Para impresoras que Windows muestra como puerto COM. Chrome o Edge en PC." },
  { id: "bluetooth", label: "Térmica Bluetooth", hint: "Sale directo, sin diálogo. Chrome en Android o PC con Bluetooth." },
];
const printerErr = ref("");
function setPrinterMode(mode) {
  printerErr.value = "";
  savePrinterSettings({ mode, deviceName: mode === printerStore.mode ? printerStore.deviceName : "" });
}
async function choosePrinter() {
  printerErr.value = "";
  try {
    await connectPrinter({ prompt: true });
    say(`Impresora lista: ${printerStore.deviceName}`);
  } catch (e) {
    printerErr.value = e.message;
  }
}
async function testPrint() {
  printerErr.value = "";
  try {
    await printTestPage({ prompt: !printerStore.deviceName });
    say("Prueba enviada a la impresora.");
  } catch (e) {
    printerErr.value = e.message;
  }
}

const SECTIONS = {
  negocio: { label: "Mi negocio", icon: "store", desc: "Nombre, giro, dirección y logo", lead: "Así te ven tus clientes en el ticket y en la app.", tone: "info" },
  ventas: { label: "Ventas e IVA", icon: "percent", desc: "IVA y comisión por tarjeta", lead: "El impuesto de tus ventas y la comisión al pagar con tarjeta.", tone: "good" },
  inventario: { label: "Inventario", icon: "box", desc: "Existencias y costo de compras", lead: "Cómo se mueven tus existencias y tus costos.", tone: "warn" },
  impresora: { label: "Impresora", icon: "printer", desc: "Ticket directo en térmica y cajón", lead: "Cómo sale el ticket en esta caja.", tone: "info" },
  apariencia: { label: "Apariencia", icon: "sun", desc: "Tema claro u oscuro", lead: "Cómo se ve la app en este dispositivo.", tone: "" },
  cuenta: { label: "Mi cuenta", icon: "lock", desc: "Contraseña y sesión", lead: "Tus datos de acceso.", tone: "" },
  soporte: { label: "Soporte", icon: "chat", desc: "Escríbenos y ve las respuestas", lead: "Estamos para ayudarte.", tone: "info" },
};
const NAV = [
  { title: "Tu tienda", items: ["negocio", "ventas", "inventario"].map((id) => ({ id, ...SECTIONS[id] })) },
  {
    title: "Equipo y plan",
    items: [
      { id: "staff", to: "/staff", label: "Empleados", icon: "users", desc: "Quién entra, invitaciones y turnos", tone: "good" },
      { id: "billing", to: "/billing", label: "Plan y facturación", icon: "card", desc: "Tu suscripción y pagos", tone: "warn" },
    ],
  },
  { title: "Esta app", items: ["impresora", "apariencia", "cuenta", "soporte"].map((id) => ({ id, ...SECTIONS[id] })) },
];
const KINDS = [
  { id: "abarrotes", label: "Abarrotes", hint: "Minisúper, tiendita" },
  { id: "convenience", label: "Conveniencia", hint: "Abierta hasta tarde" },
  { id: "pharmacy", label: "Farmacia", hint: "Medicinas y cuidado" },
  { id: "hardware", label: "Ferretería", hint: "Tlapalería, materiales" },
  { id: "other", label: "Otro comercio", hint: "Papelería, regalos…" },
];
const ZONES = [
  { id: "America/Mexico_City", label: "Centro (CDMX, Puebla, Gdl)" },
  { id: "America/Monterrey", label: "Monterrey" },
  { id: "America/Merida", label: "Mérida" },
  { id: "America/Cancun", label: "Quintana Roo" },
  { id: "America/Chihuahua", label: "Chihuahua" },
  { id: "America/Mazatlan", label: "Pacífico (Sinaloa, Nayarit, BCS)" },
  { id: "America/Hermosillo", label: "Sonora" },
  { id: "America/Tijuana", label: "Noroeste (Tijuana, Mexicali)" },
  { id: "America/Bogota", label: "Bogotá" },
  { id: "Europe/Madrid", label: "Madrid" },
];
const TAXES = [
  { value: "16", label: "16%", hint: "General en México" },
  { value: "8", label: "8%", hint: "Región fronteriza" },
  { value: "0", label: "0%", hint: "Tasa cero o exento" },
  { value: "other", label: "Otra", hint: "Por ejemplo 19%" },
];

const route = useRoute();
const router = useRouter();

// En PC y tableta siempre hay una sección abierta; en celular primero se ve el menú
const wide = ref(typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches);
let mq = null;
function onMq(e) {
  wide.value = e.matches;
}
const section = computed(() => {
  const s = String(route.query.s || "");
  if (SECTIONS[s]) return s;
  return wide.value ? "negocio" : "";
});
const current = computed(() => SECTIONS[section.value] || SECTIONS.negocio);
function open(id) {
  const to = { query: { ...route.query, s: id } };
  // En celular cada sección entra al historial para que "atrás" regrese al menú
  if (wide.value) router.replace(to).catch(() => {});
  else router.push(to).catch(() => {});
}
function back() {
  if (window.history.state?.back && String(window.history.state.back).startsWith("/settings")) router.back();
  else router.replace({ query: {} }).catch(() => {});
}

// ---------- Formulario (negocio, IVA, inventario) ----------
function fromStore() {
  const s = currentVenueSettings();
  return {
    businessName: s.businessName || "",
    businessType: s.businessType || "abarrotes",
    address: s.address || "",
    phone: s.phone || "",
    logoUrl: s.logoUrl || "/logo.svg",
    timezone: s.timezone || "America/Mexico_City",
    inventoryEnabled: Boolean(s.inventoryEnabled),
    allowNegativeStock: Boolean(s.allowNegativeStock),
    costMethod: s.costMethod === "average" ? "average" : "last",
    taxPercent: Number((Number(s.taxRate ?? 0.16) * 100).toFixed(2)),
    cardFeeEnabled: Boolean(s.cardFeeEnabled),
    cardFeePercent: Number(s.cardFeePercent ?? 4),
  };
}
const form = reactive(fromStore());
const snapshot = ref(JSON.stringify(fromStore()));
const FIELDS_BY_SECTION = {
  negocio: ["businessName", "businessType", "address", "phone", "logoUrl", "timezone"],
  ventas: ["taxPercent", "cardFeeEnabled", "cardFeePercent"],
  inventario: ["inventoryEnabled", "allowNegativeStock", "costMethod"],
};
const dirty = computed(() => JSON.stringify({ ...form }) !== snapshot.value);
function dirtyIn(id) {
  const keys = FIELDS_BY_SECTION[id];
  if (!keys) return false;
  const base = JSON.parse(snapshot.value);
  return keys.some((k) => JSON.stringify(form[k]) !== JSON.stringify(base[k]));
}
function reset() {
  Object.assign(form, fromStore());
  snapshot.value = JSON.stringify(fromStore());
}
function discard() {
  Object.assign(form, JSON.parse(snapshot.value));
  syncTaxChoice();
  syncFeeChoice();
  saveErr.value = "";
}

const nameError = computed(() => (form.businessName.trim().length < 2 ? "El nombre necesita al menos 2 letras." : ""));
const taxRate = computed(() => Math.min(100, Math.max(0, Number(form.taxPercent) || 0)) / 100);
const taxError = computed(() => {
  const v = Number(form.taxPercent);
  return !Number.isFinite(v) || v < 0 || v > 100 ? "La tasa va de 0 a 100%." : "";
});
const taxChoice = ref("16");
function syncTaxChoice() {
  const v = String(Number(form.taxPercent));
  taxChoice.value = ["16", "8", "0"].includes(v) ? v : "other";
}
function pickTax(value) {
  taxChoice.value = value;
  if (value !== "other") form.taxPercent = Number(value);
}
const pctText = computed(() => `${Number((taxRate.value * 100).toFixed(2))}%`);

// Comisión por pago con tarjeta
const FEES = [
  { value: "3.5", label: "3.5%", hint: "Terminal típica" },
  { value: "4", label: "4%", hint: "Comisión con IVA" },
  { value: "16", label: "16%", hint: "«IVA extra»" },
  { value: "other", label: "Otro", hint: "Tú decides" },
];
const feeChoice = ref("4");
function syncFeeChoice() {
  const v = String(Number(form.cardFeePercent));
  feeChoice.value = ["3.5", "4", "16"].includes(v) ? v : "other";
}
function pickFee(value) {
  feeChoice.value = value;
  if (value !== "other") form.cardFeePercent = Number(value);
}
const feeRate = computed(() => Math.min(30, Math.max(0, Number(form.cardFeePercent) || 0)) / 100);
const feeError = computed(() => {
  if (!form.cardFeeEnabled) return "";
  const v = Number(form.cardFeePercent);
  return !Number.isFinite(v) || v <= 0 || v > 30 ? "La comisión va de 0.1 a 30%." : "";
});
const thanksPreview = computed(() => closingLine(form.businessType));
const moneyFmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
function money(n) {
  return moneyFmt.format(Number(n) || 0);
}

const saving = ref(false);
const saveErr = ref("");
const flash = ref("");
let flashTimer = null;
function say(msg) {
  flash.value = msg;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = ""), 4000);
}
function errText(e, fallback) {
  const d = e?.response?.data;
  if (typeof d === "string" && d) return d;
  if (d?.message) return d.message;
  if (!e?.response) return "Sin conexión con el servidor. Revisa tu internet y vuelve a intentar.";
  return fallback;
}
async function save() {
  if (nameError.value || taxError.value || feeError.value) {
    saveErr.value = nameError.value || taxError.value || feeError.value;
    return;
  }
  saving.value = true;
  saveErr.value = "";
  const wasInventory = JSON.parse(snapshot.value).inventoryEnabled;
  try {
    await saveVenueSettings(
      {
        ...currentVenueSettings(),
        businessName: form.businessName.trim(),
        businessType: form.businessType,
        address: form.address.trim(),
        phone: form.phone.trim(),
        logoUrl: form.logoUrl || "/logo.svg",
        timezone: form.timezone,
        inventoryEnabled: Boolean(form.inventoryEnabled),
        allowNegativeStock: Boolean(form.allowNegativeStock),
        costMethod: form.costMethod === "average" ? "average" : "last",
        taxRate: taxRate.value,
        cardFeeEnabled: Boolean(form.cardFeeEnabled),
        cardFeePercent: Math.min(30, Math.max(0, Number(form.cardFeePercent) || 0)),
      },
      { strict: true }
    );
    reset();
    syncTaxChoice();
    syncFeeChoice();
    say(
      form.inventoryEnabled && !wasInventory
        ? "Guardado. Desde ahora cada venta descuenta existencias."
        : "Cambios guardados."
    );
  } catch (e) {
    saveErr.value = errText(e, "No se pudieron guardar los cambios.");
  } finally {
    saving.value = false;
  }
}

// Reloj de la zona elegida
const now = ref(new Date());
let tick = null;
const zoneClock = computed(() => {
  try {
    return now.value.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: form.timezone });
  } catch {
    return now.value.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  }
});

// Logo: se reduce a 256 px en el navegador antes de guardarlo
const logoErr = ref("");
function onLogo(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  logoErr.value = "";
  if (!file) return;
  if (!/^image\//.test(file.type)) {
    logoErr.value = "Elige una imagen (PNG, JPG o SVG).";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    logoErr.value = "La imagen pesa más de 5 MB; elige una más ligera.";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 256;
      const scale = Math.min(1, max / Math.max(img.width || max, img.height || max));
      const w = Math.max(1, Math.round((img.width || max) * scale));
      const h = Math.max(1, Math.round((img.height || max) * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      let url = canvas.toDataURL("image/png");
      if (url.length > 300_000) url = canvas.toDataURL("image/jpeg", 0.85);
      form.logoUrl = url;
    };
    img.onerror = () => (logoErr.value = "No se pudo leer la imagen.");
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

// ---------- Apariencia ----------
const isDark = computed(() => themeStore.mode === "dark");

// ---------- Cuenta ----------
const ROLE_LABEL = { admin: "Admin", cashier: "Cajero", waiter: "Vendedor", kitchen: "Almacén", hosstess: "Recepción" };
const roleText = computed(() => ROLE_LABEL[authStore.role] || authStore.role || "");
function initials(name) {
  const s = String(name || "?").trim();
  return (s.slice(0, 2) || "?").toUpperCase();
}
const showPw = ref(false);
const pwForm = reactive({ current: "", newPw: "", confirm: "" });
const pwBusy = ref(false);
const pwMsg = ref("");
const pwErr = ref("");
const pwScore = computed(() => {
  const p = pwForm.newPw;
  if (p.length < 6) return 0;
  let s = 1;
  if (p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p)) s++;
  if (p.length >= 12 || /[^a-zA-Z0-9]/.test(p)) s++;
  return Math.min(3, s);
});
async function changePassword() {
  pwMsg.value = "";
  pwErr.value = "";
  if (pwForm.newPw.length < 6) {
    pwErr.value = "La nueva contraseña necesita al menos 6 caracteres.";
    return;
  }
  if (pwForm.newPw !== pwForm.confirm) {
    pwErr.value = "Las contraseñas nuevas no coinciden.";
    return;
  }
  if (pwForm.newPw === pwForm.current) {
    pwErr.value = "La nueva debe ser distinta a la actual.";
    return;
  }
  pwBusy.value = true;
  try {
    await apiService.changePassword(pwForm.current, pwForm.newPw);
    pwMsg.value = "Contraseña actualizada.";
    pwForm.current = "";
    pwForm.newPw = "";
    pwForm.confirm = "";
    showPw.value = false;
  } catch (e) {
    pwErr.value = errText(e, "No se pudo cambiar la contraseña.");
  } finally {
    pwBusy.value = false;
  }
}
let leaving = false;
function logout() {
  if (dirty.value && !window.confirm("Tienes cambios sin guardar en Configuración. ¿Cerrar sesión de todos modos?")) return;
  leaving = true;
  clearSession();
  router.push("/");
}

// ---------- Soporte ----------
const support = reactive({ subject: "", message: "" });
const supportBusy = ref(false);
const supportMsg = ref("");
const supportErr = ref("");
const supportNote = ref("");
const tickets = ref([]);
const openTicket = ref("");
function when(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
async function loadSupport() {
  supportNote.value = "";
  try {
    const data = await apiService.getSupportThread();
    tickets.value = Array.isArray(data?.tickets) ? [...data.tickets].sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)) : [];
  } catch (e) {
    tickets.value = [];
    const d = e?.response?.data;
    if (typeof d === "string" && d) supportNote.value = d;
  }
}
async function sendSupport() {
  supportBusy.value = true;
  supportMsg.value = "";
  supportErr.value = "";
  try {
    const data = await apiService.sendSupportMessage({ subject: support.subject.trim(), message: support.message.trim() });
    tickets.value = Array.isArray(data?.tickets) ? data.tickets : tickets.value;
    support.subject = "";
    support.message = "";
    supportMsg.value = "Mensaje enviado. Te respondemos a tu correo.";
  } catch (e) {
    supportErr.value = errText(e, "No se pudo enviar.");
  } finally {
    supportBusy.value = false;
  }
}
watch(section, (s) => {
  if (s === "soporte") loadSupport();
});

// ---------- Salir sin guardar ----------
function onBeforeUnload(e) {
  if (!dirty.value || leaving) return;
  e.preventDefault();
  e.returnValue = "";
}
onBeforeRouteLeave(() => {
  if (leaving || !dirty.value) return true;
  return window.confirm("Tienes cambios sin guardar en Configuración. ¿Salir sin guardarlos?");
});

onMounted(async () => {
  mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener?.("change", onMq);
  window.addEventListener("beforeunload", onBeforeUnload);
  tick = setInterval(() => (now.value = new Date()), 30000);
  syncTaxChoice();
  syncFeeChoice();
  if (section.value === "soporte") loadSupport();
  await fetchVenueSettings().catch(() => {});
  // Solo refresca el formulario si no se ha empezado a editar
  if (!dirty.value) {
    reset();
    syncTaxChoice();
    syncFeeChoice();
  }
});
onBeforeUnmount(() => {
  mq?.removeEventListener?.("change", onMq);
  window.removeEventListener("beforeunload", onBeforeUnload);
  clearInterval(tick);
});
</script>

<style scoped>
.cfg { padding-bottom: 6rem; }
.cfg-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

/* Menú */
.cfg-nav { display: grid; gap: 1rem; }
.cfg-nav-head h1 { margin: 0; font-size: 1.35rem; font-weight: 800; letter-spacing: -0.01em; }
.cfg-nav-head p { margin: 0.1rem 0 0; font-size: 0.85rem; font-weight: 600; color: var(--timber-muted); }
.cfg-group {
  overflow: hidden;
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.cfg-group h2 {
  margin: 0;
  padding: 0.7rem 0.95rem 0.25rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--timber-muted);
}
.cfg-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.95rem;
  border: none;
  background: none;
  color: var(--timber-ink);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.cfg-item + .cfg-item { border-top: 1px solid var(--timber-line); }
.cfg-item:hover { background: var(--timber-panel-elevated); }
.cfg-item.on { background: color-mix(in srgb, var(--timber-primary) 9%, var(--timber-panel)); }
.cfg-item.on .cfg-txt strong { color: var(--timber-primary); }
.cfg-item.logout {
  border: 1px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow);
}
.cfg-item.logout strong { color: var(--timber-danger); }
.cfg-ico {
  width: 2.3rem;
  height: 2.3rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 0.7rem;
  background: var(--timber-surface);
  color: var(--timber-muted);
}
.cfg-ico.info { background: var(--timber-primary-soft); color: var(--timber-primary); }
.cfg-ico.good { background: var(--timber-success-soft); color: var(--timber-success); }
.cfg-ico.warn { background: var(--timber-warning-soft); color: var(--timber-warning); }
.cfg-ico.bad { background: var(--timber-danger-soft); color: var(--timber-danger); }
.cfg-txt { flex: 1; min-width: 0; display: grid; }
.cfg-txt strong { display: flex; align-items: center; gap: 0.4rem; font-size: 0.95rem; font-weight: 700; }
.cfg-txt small { overflow: hidden; font-size: 0.78rem; color: var(--timber-muted); text-overflow: ellipsis; white-space: nowrap; }
.cfg-chev { flex-shrink: 0; color: var(--timber-muted); }
.cfg-dot {
  display: inline-block;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--timber-warning);
}

/* Contenido */
.cfg-main { display: grid; gap: 0.75rem; min-width: 0; }
.cfg-sec-head { display: flex; align-items: center; gap: 0.6rem; }
.cfg-sec-head h2 { margin: 0; font-size: 1.3rem; font-weight: 800; }
.cfg-sec-head p { margin: 0.1rem 0 0; font-size: 0.86rem; color: var(--timber-muted); }
.cfg-card { display: grid; gap: 0.85rem; }
.cfg-card h3 { margin: 0; font-size: 1.02rem; font-weight: 800; }
.cfg-split { display: grid; gap: 0.75rem; }
.cfg-col { display: grid; gap: 0.75rem; align-content: start; min-width: 0; }
.kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.4rem; }
.kinds .adm-choice { padding: 0.6rem 0.75rem; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.logo-row { display: flex; align-items: flex-start; gap: 1rem; }
.logo-box {
  width: 5.5rem;
  height: 5.5rem;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--timber-line);
  border-radius: 1.2rem;
  background:
    repeating-conic-gradient(var(--timber-surface) 0% 25%, var(--timber-panel) 0% 50%) 50% / 14px 14px;
}
.logo-box img { width: 100%; height: 100%; object-fit: contain; }
.logo-acts { display: grid; gap: 0.5rem; justify-items: start; min-width: 0; }
.logo-acts .adm-btn { position: relative; }

/* Vista previa del ticket */
.preview-card { background: color-mix(in srgb, var(--timber-surface) 70%, var(--timber-panel)); }
.mini-ticket {
  display: grid;
  justify-items: center;
  padding: 0.25rem 0 0.5rem;
  filter: drop-shadow(0 8px 14px rgba(18, 32, 56, 0.18));
}
.mini-ticket .tk-paper { pointer-events: none; }
.mini-ticket .tk-hand { font-size: 1.7em; }

.cfg-wizard {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.8rem 0.95rem;
  border: 1px dashed var(--timber-line);
  border-radius: 1rem;
  color: var(--timber-ink);
  text-decoration: none;
}
.cfg-wizard:hover { border-color: var(--timber-primary); background: var(--timber-panel); }
.cfg-wizard > svg:first-child { color: var(--timber-primary); flex-shrink: 0; }
.cfg-wizard span { flex: 1; display: grid; min-width: 0; }
.cfg-wizard small { font-size: 0.8rem; color: var(--timber-muted); }
.cfg-wizard > svg:last-child { color: var(--timber-muted); }

/* IVA */
.taxes { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.taxes .adm-choice { justify-items: center; text-align: center; }
.taxes .adm-choice strong { font-size: 1.15rem; }
.tax-other { max-width: 12rem; }
.fees { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.fees .adm-choice { justify-items: center; text-align: center; }
.fees .adm-choice strong { font-size: 1.1rem; }
.example {
  display: grid;
  gap: 0.2rem;
  padding: 0.7rem 0.9rem;
  border-radius: 0.85rem;
  background: var(--timber-surface);
}
.example span { font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--timber-muted); }
.example p { margin: 0; font-size: 0.92rem; line-height: 1.45; }

/* Inventario */
.switch-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
.switch-head h3 { margin: 0 0 0.25rem; }
.state-line { display: flex; align-items: center; gap: 0.5rem; margin: 0; font-size: 0.88rem; font-weight: 700; }
.state-line i { width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--timber-muted); }
.state-line.on { color: var(--timber-success); }
.state-line.on i { background: var(--timber-success); box-shadow: 0 0 0 3px var(--timber-success-soft); }
.state-line.off { color: var(--timber-muted); }
.printer-modes { grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); }
.printer-acts { display: flex; flex-wrap: wrap; gap: 0.6rem; }

/* Apariencia */
.themes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; max-width: 30rem; }
.theme-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.6rem;
  border: 2px solid var(--timber-line);
  border-radius: 1rem;
  background: var(--timber-panel);
  color: var(--timber-ink);
  font: inherit;
  cursor: pointer;
}
.theme-card[aria-pressed="true"] { border-color: var(--timber-primary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--timber-primary) 18%, transparent); }
.theme-mock {
  position: relative;
  display: grid;
  grid-template-rows: 0.7rem 1fr 1fr;
  gap: 0.3rem;
  height: 5.5rem;
  padding: 0.45rem;
  border-radius: 0.7rem;
}
.theme-card.light .theme-mock { background: #eef2f7; }
.theme-card.dark .theme-mock { background: #0b1220; }
.theme-mock i { border-radius: 0.3rem; background: #1e5aa8; }
.theme-card.light .theme-mock b { border-radius: 0.35rem; background: #fff; }
.theme-card.dark .theme-mock b { border-radius: 0.35rem; background: #172133; }
.theme-mock em {
  position: absolute;
  right: 0.7rem;
  bottom: 0.7rem;
  width: 1.6rem;
  height: 0.7rem;
  border-radius: 999px;
  background: #e08a1e;
}
.theme-name { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; font-weight: 800; }

/* Cuenta */
.me-card { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
.me-card strong { display: block; font-size: 1.05rem; }
.me-card small { color: var(--timber-muted); font-size: 0.84rem; }
.adm-avatar.big { width: 3.2rem; height: 3.2rem; font-size: 1.05rem; }
.pass { position: relative; display: block; }
.pass .adm-inp { padding-right: 3rem; }
.eye {
  position: absolute;
  top: 50%;
  right: 0.35rem;
  transform: translateY(-50%);
  width: 2.4rem;
  height: 2.4rem;
  display: grid;
  place-items: center;
  border: none;
  border-radius: 0.6rem;
  background: transparent;
  color: var(--timber-muted);
  cursor: pointer;
}
.strength { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; align-items: center; gap: 0.3rem; }
.strength i { height: 0.3rem; border-radius: 999px; background: var(--timber-line); }
.strength.s1 i:nth-child(1) { background: var(--timber-danger); }
.strength.s2 i:nth-child(-n + 2) { background: var(--timber-warning); }
.strength.s3 i { background: var(--timber-success); }
.strength span { margin-left: 0.35rem; font-size: 0.76rem; font-weight: 700; color: var(--timber-muted); }
.logout-btn { justify-self: start; }

/* Soporte */
.threads { list-style: none; margin: 0; padding: 0; }
.threads li + li { border-top: 1px solid var(--timber-line); }
.thread-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.thread-main { flex: 1; min-width: 0; display: grid; }
.thread-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.thread-main small { font-size: 0.78rem; color: var(--timber-muted); }
.bubbles { display: grid; gap: 0.45rem; padding: 0 0 0.85rem; }
.bubble { max-width: 85%; padding: 0.55rem 0.75rem; border-radius: 0.9rem; }
.bubble p { margin: 0; font-size: 0.9rem; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
.bubble small { display: block; margin-top: 0.2rem; font-size: 0.72rem; opacity: 0.75; }
.bubble.me { justify-self: end; border-bottom-right-radius: 0.3rem; background: var(--timber-primary); color: var(--timber-on-primary); }
.bubble.them { justify-self: start; border-bottom-left-radius: 0.3rem; background: var(--timber-surface); }

/* Barra de cambios sin guardar */
.cfg-savebar {
  position: sticky;
  bottom: 0.75rem;
  z-index: 20;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  margin-top: 1rem;
  padding: 0.7rem 0.8rem 0.7rem 1rem;
  border: 1px solid color-mix(in srgb, var(--timber-warning) 45%, var(--timber-line));
  border-radius: 1rem;
  background: var(--timber-panel);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.2);
  font-weight: 700;
}
.cfg-savebar > span { display: inline-flex; align-items: center; gap: 0.5rem; }
.cfg-savebar > div { display: flex; gap: 0.5rem; }

/* Celular: menú o sección, no ambos */
@media (max-width: 767.98px) {
  .cfg-layout.section-open .cfg-nav { display: none; }
  .cfg-savebar > div { flex: 1; }
  .cfg-savebar .adm-btn { flex: 1; }
  .taxes, .fees { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .logo-row { flex-direction: column; }
}
@media (min-width: 768px) {
  .cfg-layout { grid-template-columns: 17.5rem minmax(0, 1fr); gap: 1.25rem; }
  .cfg-savebar { margin-left: calc(17.5rem + 1.25rem); }
  .cfg-nav { position: sticky; top: 0; }
  .cfg-back { display: none; }
  .cfg-item .cfg-chev { display: none; }
  .cfg-txt small { white-space: normal; }
}
@media (min-width: 1100px) {
  .cfg-layout { grid-template-columns: 19rem minmax(0, 1fr); gap: 1.5rem; }
  .cfg-savebar { margin-left: calc(19rem + 1.5rem); }
  .cfg-split { grid-template-columns: minmax(0, 1.35fr) minmax(16rem, 1fr); align-items: start; }
}
</style>

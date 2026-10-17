<template>
  <div class="landing" ref="root">
    <div class="sky" aria-hidden="true">
      <span class="blob b1" data-depth="260"></span>
      <span class="blob b2" data-depth="520"></span>
      <span class="blob b3" data-depth="760"></span>
    </div>

    <header class="nav">
      <a href="#top" class="nav-brand">
        <img src="/logo.svg" alt="" width="36" height="36" />
        <span><BrandName tone="dark" /></span>
      </a>
      <nav class="nav-links" aria-label="Secciones">
        <a href="#como-funciona">Cómo funciona</a>
        <a href="#inventario-magico">La Magia</a>
        <a href="#por-que-nube">¿Por qué nube?</a>
        <a href="#planes">Planes</a>
        <a href="#proveedores">Sé proveedor</a>
      </nav>
      <div class="nav-actions">
        <template v-if="loggedIn">
          <router-link class="btn ghost" :to="{ name: homeRoute }">Ir al sistema</router-link>
        </template>
        <template v-else>
          <router-link class="btn ghost" to="/login">Ingresar</router-link>
          <router-link class="btn amber" to="/register">Probar gratis</router-link>
        </template>
      </div>
      <span class="nav-meter" data-meter aria-hidden="true"></span>
    </header>

    <main id="top">
      <!-- ═══ HERO ═══ -->
      <section class="hero" data-scene="exit" data-pointer>
        <div class="hero-bg" aria-hidden="true">
          <span class="aurora a1"></span>
          <span class="aurora a2"></span>
          <span class="aurora a3"></span>
          <span class="spot"></span>
          <div class="stars far"><i v-for="s in starsFar" :key="s.id" :style="s.style"></i></div>
          <div class="stars near"><i v-for="s in starsNear" :key="s.id" :style="s.style"></i></div>
          <div class="floor"><div class="floor-plane"><div class="floor-lines"></div></div></div>
        </div>

        <div class="hero-inner">
          <div class="hero-copy">
            <p class="eyebrow"><span class="live-dot"></span>Punto de venta en la nube</p>
            <h1 class="hero-title">
              <span class="line"><span class="w" style="--i: 0">Tu</span> <span class="w" style="--i: 1">tienda</span> <span class="w hl" style="--i: 2">no</span> <span class="w hl" style="--i: 3">cierra</span> </span>
              <span class="line"><span class="w" style="--i: 4">aunque</span> <span class="w" style="--i: 5">la</span> <span class="w" style="--i: 6">compu</span> <span class="w" style="--i: 7">falle</span></span>
            </h1>
            <p class="hero-line">
              Abre caja desde el celular, la tablet o la PC — sin instalar nada.
              Tus ventas, productos y cortes siempre a la mano.
            </p>
            <div class="hero-cta">
              <router-link v-if="!loggedIn" class="btn amber lg" to="/register">
                Probar 3 días gratis
              </router-link>
              <router-link v-else class="btn amber lg" :to="{ name: homeRoute }">
                Abrir caja
              </router-link>
              <a class="btn line lg" href="#inventario-magico">Ver la Magia</a>
            </div>
            <p class="hero-note">Sin tarjeta. Cancela cuando quieras.</p>
          </div>

          <div class="hero-stage" aria-hidden="true">
            <div class="rig">
              <span class="rig-shadow"></span>
              <div class="shot">
                <div class="shot-top">
                  <img src="/logo.svg" alt="" width="18" height="18" />
                  <span>Abarrotes López</span>
                  <span class="shot-nav on">Vender</span>
                  <span class="shot-nav">Productos</span>
                  <span class="shot-nav">Caja</span>
                  <span class="shot-clock">14:32</span>
                </div>
                <div class="shot-fkeys">
                  <span>F2 Anular</span>
                  <span>F4 Precio</span>
                  <span>F9 Dcto</span>
                  <span class="cobrar">F12 Cobrar</span>
                </div>
                <div class="shot-status">
                  <span>Abarrotes López</span>
                  <span>2 artículos</span>
                  <span class="hint">Escáner listo</span>
                </div>
                <div class="shot-desk">
                  <div class="shot-scan">
                    <span>Código / búsqueda</span>
                    <div>7501234567890<i class="caret"></i></div>
                  </div>
                  <div class="shot-total">
                    <p>2 artículos</p>
                    <p class="lbl">Total</p>
                    <strong>$40.00</strong>
                    <p class="tax">IVA $5.52 · Neto $34.48</p>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Cant.</th>
                      <th>Descripción</th>
                      <th>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="on">
                      <td>750123</td>
                      <td>1</td>
                      <td>Coca 600 ml</td>
                      <td>$22.00</td>
                    </tr>
                    <tr>
                      <td>750456</td>
                      <td>1</td>
                      <td>Sabritas</td>
                      <td>$18.00</td>
                    </tr>
                  </tbody>
                </table>
                <div class="shot-foot">
                  <div>
                    <strong>Coca 600 ml</strong>
                    <span>1 × $22.00 = $22.00</span>
                  </div>
                  <span class="cobrar">COBRAR</span>
                </div>
              </div>

              <div class="fl fl-ticket">
                <div class="ticket">
                  <b>Abarrotes López</b>
                  <span class="tk-row"><span>Coca 600 ml</span><em>$22.00</em></span>
                  <span class="tk-row"><span>Sabritas</span><em>$18.00</em></span>
                  <span class="tk-row tk-total"><span>TOTAL</span><em>$40.00</em></span>
                  <span class="tk-bars"></span>
                  <span class="tk-thanks">¡Gracias por su compra!</span>
                </div>
              </div>
              <div class="fl fl-scan">
                <div class="chip chip-scan"><span class="bars"><i></i></span>7501234567890</div>
              </div>
              <div class="fl fl-sync">
                <div class="chip chip-sync"><span class="pulse"></span>Venta guardada en la nube</div>
              </div>
              <div class="fl fl-coin"><div class="coin">+$22</div></div>
              <div class="fl fl-magic"><div class="chip chip-magic">✦ Inventario Mágico</div></div>
            </div>
          </div>
        </div>

        <a class="scroll-cue" href="#como-funciona" aria-label="Ver cómo funciona">
          <span class="mouse"><i></i></span>
        </a>
      </section>

      <!-- ═══ TRUST STRIP ═══ -->
      <section class="trust" data-scene="enter">
        <div class="trust-inner">
          <div class="trust-item" style="--k: 0">
            <strong data-count="100" data-suffix="%">100%</strong>
            <span>en la nube</span>
          </div>
          <div class="trust-item" style="--k: 1">
            <strong data-count="3" data-suffix=" días">3 días</strong>
            <span>de prueba gratis</span>
          </div>
          <div class="trust-item" style="--k: 2">
            <strong>0</strong>
            <span>instalaciones</span>
          </div>
          <div class="trust-item" style="--k: 3">
            <strong data-count="349" data-prefix="Desde $">Desde $349</strong>
            <span>/mes</span>
          </div>
        </div>
      </section>

      <!-- ═══ CÓMO FUNCIONA (escena fija: los equipos llegan, se sincronizan y uno falla) ═══ -->
      <section id="como-funciona" class="band devices-band">
        <div class="pin-track devices-track" data-scene="pin" data-segments="0-0.34,0.38-0.58,0.64-0.86">
          <div class="pin-stage">
            <div class="scene-head" data-reveal>
              <p class="section-kicker">Así de fácil</p>
              <h2>Abres el navegador y ya estás en caja</h2>
              <p class="section-lede">
                No importa si es tu celular viejo, una tablet prestada o la compu del mostrador.
                Entras a Mi Tiendita desde cualquier navegador y empiezas a cobrar.
              </p>
            </div>

            <div class="device-stage">
              <div class="device-rig">
                <span class="cloud-hub" aria-hidden="true"><span class="cloud-shape"></span>Tu caja en la nube</span>
                <span class="bus" aria-hidden="true"></span>
                <figure class="dev dev-phone">
                  <span class="drop" aria-hidden="true"></span>
                  <div class="device phone">
                    <div class="bezel">
                      <span class="notch" aria-hidden="true"></span>
                      <div class="screen">
                        <p>Vender</p>
                        <strong>$40.00</strong>
                      </div>
                    </div>
                    <span class="dev-chip ok" aria-hidden="true">Sigues vendiendo</span>
                  </div>
                  <figcaption>Tu celular</figcaption>
                  <p class="device-hint">Cobra en el pasillo o en la fila</p>
                </figure>
                <figure class="dev dev-tablet">
                  <span class="drop" aria-hidden="true"></span>
                  <div class="device tablet">
                    <div class="bezel">
                      <span class="cam" aria-hidden="true"></span>
                      <div class="screen">
                        <p>Ticket · 2 artículos</p>
                        <strong>$40.00</strong>
                      </div>
                    </div>
                    <span class="dev-chip ok" aria-hidden="true">Sigues vendiendo</span>
                  </div>
                  <figcaption>Una tablet</figcaption>
                  <p class="device-hint">Caja compacta y moderna</p>
                </figure>
                <figure class="dev dev-pc">
                  <span class="drop" aria-hidden="true"></span>
                  <div class="device pc">
                    <div class="monitor">
                      <div class="bezel">
                        <div class="screen">
                          <p>Escáner listo</p>
                          <strong class="pay">COBRAR</strong>
                        </div>
                      </div>
                      <span class="neck" aria-hidden="true"></span>
                      <span class="base" aria-hidden="true"></span>
                    </div>
                    <span class="dev-chip bad" aria-hidden="true">⚠ Se descompuso</span>
                  </div>
                  <figcaption>La PC del mostrador</figcaption>
                  <p class="device-hint">Con escáner e impresora de tickets</p>
                </figure>
              </div>
            </div>

            <p class="device-fallback">
              <strong>¿Se descompuso un equipo?</strong> Entras desde otro y sigues vendiendo. Así de simple.
            </p>
          </div>
        </div>
      </section>

      <!-- ═══ VIDEO ═══ -->
      <section id="video" class="band">
        <div class="section video-wrap" data-reveal>
          <div class="promo-copy">
            <p class="section-kicker">Míralo en 20 segundos</p>
            <h2>Se descompone la PC. Tú sigues vendiendo.</h2>
            <p class="section-lede">
              Abres el navegador y ya estás en caja, con o sin internet. Tu catálogo llega con 181 productos
              ya capturados: solo les pones precio.
            </p>
            <ul class="promo-points">
              <li><span aria-hidden="true">✦</span> Entras desde cualquier equipo</li>
              <li><span aria-hidden="true">✦</span> Sigues cobrando sin internet</li>
              <li><span aria-hidden="true">✦</span> 3 días gratis, sin tarjeta</li>
            </ul>
          </div>
          <div class="promo-stage">
            <div class="promo-glow" aria-hidden="true"></div>
            <video
              class="promo-video"
              controls
              playsinline
              preload="metadata"
              poster="/mitiendita-promo-poster.jpg"
              aria-label="Mi Tiendita en 20 segundos: el problema, la solución y por qué somos distintos"
            >
              <source src="/mitiendita-promo.mp4" type="video/mp4" />
            </video>
          </div>
        </div>
      </section>

      <!-- ═══ INVENTARIO MÁGICO (estrella) ═══ -->
      <section id="inventario-magico" class="band magic">
        <div class="magic-sky" aria-hidden="true">
          <i v-for="s in sparks" :key="s.id" :style="s.style">✦</i>
        </div>

        <div class="section magic-intro">
          <div data-reveal>
            <div class="magic-header">
              <span class="magic-spark" aria-hidden="true">✦</span>
              <p class="section-kicker">Lo que nos hace diferentes</p>
            </div>
            <h2>Inventario Mágico y Precio Mágico</h2>
            <p class="section-lede magic-lede">
              Dos magias, un botón. Pegas un papelito o le tomas foto a la nota del camión:
              el catálogo y los precios se actualizan solos.
            </p>
          </div>

          <div class="magic-pair" data-scene="enter">
            <article class="glass tilt" v-tilt="8" style="--k: 0">
              <p class="pair-kicker">✦ Inventario Mágico</p>
              <h3>Del papelito al anaquel</h3>
              <p>
                Escribes “15 cocas de 600” o subes la foto. Entran piezas, packs y
                productos nuevos — sin buscar renglón por renglón.
              </p>
            </article>
            <article id="precio-magico" class="glass tilt" v-tilt="8" style="--k: 1">
              <p class="pair-kicker">✦ Precio Mágico</p>
              <h3>Si el costo sube, no pierdes margen</h3>
              <p>
                Foto a la factura del proveedor. Si la Coca te costaba $14 y ahora $15.50,
                te avisa y te sugiere el precio al público.
              </p>
            </article>
          </div>
        </div>

        <div
          class="pin-track magic-track"
          data-scene="pin"
          data-segments="0-0.16,0.2-0.4,0.44-0.66,0.72-0.92"
          data-at="0"
        >
          <div class="pin-stage">
            <div class="magic-scene">
              <div class="magic-flow">
                <span class="flow-rail" aria-hidden="true"><span></span></span>
                <article class="magic-step st1">
                  <span class="step">1</span>
                  <div>
                    <h3>Escribes o tomas foto</h3>
                    <p>"Coca 600ml a 22" o la nota de remisión — como la tengas.</p>
                  </div>
                </article>
                <article class="magic-step st2">
                  <span class="step">2</span>
                  <div>
                    <h3>La nube lo interpreta</h3>
                    <p>Reconoce productos, costos, precios y cantidades.</p>
                  </div>
                </article>
                <article class="magic-step st3">
                  <span class="step">3</span>
                  <div>
                    <h3>Catálogo y precios listos</h3>
                    <p>Inventario Mágico llena el anaquel. Precio Mágico cuida tu ganancia.</p>
                  </div>
                </article>
              </div>

              <div class="magic-demo">
                <div class="demo-rig">
                  <div class="magic-demo-input">
                    <p class="magic-demo-label">
                      <span class="magic-demo-icon" aria-hidden="true">📝</span>
                      Tú escribes:
                    </p>
                    <div class="note">
                      <span class="tape" aria-hidden="true"></span>
                      <pre><span class="ln" style="--k: 0" data-t="Coca 600ml a 22"><span class="ln-t">Coca 600ml a 22</span><i class="ln-ok" aria-hidden="true">✓</i></span>
<span class="ln" style="--k: 1" data-t="Sabritas a 18"><span class="ln-t">Sabritas a 18</span><i class="ln-ok" aria-hidden="true">✓</i></span>
<span class="ln" style="--k: 2" data-t="Aceite 1L  48 pesos"><span class="ln-t">Aceite 1L  48 pesos</span><i class="ln-ok" aria-hidden="true">✓</i></span></pre>
                      <span class="beam" aria-hidden="true"></span>
                    </div>
                  </div>

                  <span class="magic-demo-arrow" aria-hidden="true">
                    <span class="arrow-line"></span>
                    <span class="arrow-text">La Magia</span>
                    <span class="arrow-line"></span>
                  </span>

                  <div class="magic-demo-output">
                    <p class="magic-demo-label">
                      <span class="magic-demo-icon" aria-hidden="true">✅</span>
                      Tu catálogo:
                    </p>
                    <ul>
                      <li style="--k: 0">
                        <span>Coca 600 ml</span>
                        <strong>$22.00</strong>
                      </li>
                      <li style="--k: 1">
                        <span>Sabritas</span>
                        <strong>$18.00</strong>
                      </li>
                      <li style="--k: 2">
                        <span>Aceite 1 L</span>
                        <strong>$48.00</strong>
                      </li>
                    </ul>
                  </div>

                  <div class="price-flip" aria-hidden="true">
                    <div class="price-card">
                      <div class="face front">
                        <span class="pf-kicker">✦ Precio Mágico</span>
                        <b>Coca 600 ml</b>
                        <span class="pf-row"><span>Costo</span><em>$14.00</em></span>
                        <span class="pf-row"><span>Precio</span><em>$22.00</em></span>
                      </div>
                      <div class="face back">
                        <span class="pf-kicker">▲ Subió el costo</span>
                        <b>Coca 600 ml</b>
                        <span class="pf-row"><span>Costo</span><em><s>$14.00</s> $15.50</em></span>
                        <span class="pf-row hl"><span>Sugerido</span><em>$24.50</em></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="section magic-outro">
          <p class="magic-note" data-reveal>
            Cada revisión cuenta como un uso del mes, da igual si es inventario o precio:
            <strong>Básico 50</strong>, <strong>Crecimiento 150</strong> y <strong>Pro 500</strong>.
          </p>
        </div>
      </section>

      <!-- ═══ POR QUÉ NUBE ═══ -->
      <section id="por-que-nube" class="band cloud" data-scene="view">
        <div class="cloud-layers" aria-hidden="true">
          <span class="cl c1"></span>
          <span class="cl c2"></span>
          <span class="cl c3"></span>
        </div>
        <div class="section cloud-grid">
          <div class="cloud-copy" data-reveal>
            <p class="section-kicker">Nunca más "se perdió todo"</p>
            <h2>Tu información vive en la nube, no en un disco duro</h2>
            <p class="section-lede">
              Si la compu se llena de virus, si se va la luz a media venta,
              si el cajero derrama el café en el teclado — no pierdes ni un ticket.
              Y si se cae el wifi, la caja sigue cobrando con el catálogo ya cargado;
              al volver internet, las ventas se suben solas.
            </p>
          </div>
          <div class="orbit" aria-hidden="true">
            <div class="orbit-rig">
              <div class="ring r1"><span class="sat"><i>📱</i></span></div>
              <div class="ring r2"><span class="sat"><i>🖥️</i></span></div>
              <div class="ring r3"><span class="sat"><i>🧾</i></span></div>
              <div class="core"><span class="cloud-shape"><b>✓</b></span></div>
            </div>
          </div>
        </div>
        <div class="section pillars-wrap">
          <ul class="pillars" data-scene="enter">
            <li class="tilt" v-tilt="8" style="--k: 0">
              <span class="pillar-icon" aria-hidden="true">🛡️</span>
              <h3>Se murió la PC — no pasa nada</h3>
              <p>
                Entras desde cualquier otro dispositivo y tu catálogo, ventas y cortes
                siguen ahí. Sin rescates de $500 con el técnico.
              </p>
            </li>
            <li class="tilt" v-tilt="8" style="--k: 1">
              <span class="pillar-icon" aria-hidden="true">🔄</span>
              <h3>Siempre actualizado</h3>
              <p>
                Las mejoras llegan solas al refrescar la página.
                Nada de parches, USB ni "ven a actualizarme el sistema".
              </p>
            </li>
            <li class="tilt" v-tilt="8" style="--k: 2">
              <span class="pillar-icon" aria-hidden="true">📱</span>
              <h3>Revisa desde donde estés</h3>
              <p>
                Ve cuánto se vendió hoy desde tu celular.
                No tienes que esperar al corte de caja de la noche.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- ═══ PLANES ═══ -->
      <section id="planes" class="band plans">
        <div class="section">
          <div class="plans-head" data-reveal>
            <p class="section-kicker">Precios sin letras chiquitas</p>
            <h2>Elige según tu tienda</h2>
            <p class="section-lede">
              3 días de prueba. Sin tarjeta. Cancela cuando quieras. Precios en MXN con IVA.
            </p>
            <p class="promo-banner" data-reveal>
              <span class="promo-tag">Lanzamiento</span>
              <span>
                <strong>Clientes nuevos: 3 meses a 1/3 del precio</strong> con el plan mensual, después precio normal.
                <em>Aparte de tus 3 días gratis.</em>
              </span>
            </p>
          </div>

          <div class="billing-toggle" role="group" aria-label="Periodo de pago">
            <span :class="{ on: billingInterval === 'month' }">Mensual</span>
            <button
              type="button"
              class="toggle-track"
              :class="{ annual: billingInterval === 'year' }"
              :aria-pressed="billingInterval === 'year'"
              aria-label="Cambiar a facturación anual"
              @click="billingInterval = billingInterval === 'month' ? 'year' : 'month'"
            >
              <span class="toggle-thumb" />
            </button>
            <span :class="{ on: billingInterval === 'year' }">
              Anual
              <em class="save-pill">Ahorra 2 meses</em>
            </span>
          </div>

          <div class="plan-grid" data-scene="enter">
            <article
              v-for="(p, i) in plans"
              :key="p.id"
              v-tilt="7"
              class="plan tilt"
              :class="{ hot: p.highlight }"
              :style="{ '--k': i, '--side': i - (plans.length - 1) / 2 }"
            >
              <p v-if="p.badge" class="badge">{{ p.badge }}</p>
              <h3>{{ p.name }}</h3>
              <p class="tag">{{ p.tagline }}</p>
              <Transition name="flip" mode="out-in">
                <div class="price-box" :key="billingInterval">
                  <template v-if="billingInterval === 'month'">
                    <p v-if="p.promoPrice" class="price promo">
                      ${{ formatInt(p.promoPrice) }} <span>/ mes × {{ p.promoMonths || 3 }} meses</span>
                    </p>
                    <p v-if="p.promoPrice" class="price-note was">
                      Luego ${{ formatInt(p.price) }}/mes
                    </p>
                    <p v-else class="price">${{ formatInt(p.price) }} <span>/ mes</span></p>
                  </template>
                  <template v-else>
                    <p class="price">
                      ${{ formatInt(planYearPrice(p)) }}
                      <span>/ año</span>
                    </p>
                    <p class="price-note">
                      ~${{ formatInt(planMonthlyFromYear(p)) }}/mes · ahorras 2 meses
                    </p>
                  </template>
                </div>
              </Transition>
              <p class="im-line">
                <InventarioMagicoTerm /> · <InventarioMagicoTerm kind="precio" /> · {{ p.aiQuotaLabel }}
              </p>
              <ul>
                <li v-for="(f, j) in p.features" :key="j">{{ f }}</li>
              </ul>
              <router-link
                class="btn"
                :class="p.highlight ? 'amber' : 'blue'"
                :to="planCtaTo"
              >
                {{ loggedIn ? "Ver en facturación" : "Empezar gratis" }}
              </router-link>
            </article>
          </div>

          <aside class="plan-extra" data-reveal>
            <p>
              ¿Prefieres pagar una sola vez? Hay <strong>licencia perpetua</strong>,
              sin Inventario Mágico ni Precio Mágico.
            </p>
            <button type="button" class="perpetual-more" @click="showPerpetual = true">
              Más información →
            </button>
          </aside>
        </div>
      </section>

      <!-- ═══ TESTIMONIOS (se muestran cuando haya reales en `testimonials`) ═══ -->
      <section v-if="testimonials.length" id="testimonios" class="band">
        <div class="section" data-reveal>
          <p class="section-kicker">Tiendas que ya cobran con Mi Tiendita</p>
          <h2>Lo dicen ellos</h2>
          <div class="testi-grid">
            <figure v-for="t in testimonials" :key="t.name" class="glass testi">
              <img v-if="t.photo" :src="t.photo" :alt="t.name" width="56" height="56" loading="lazy" />
              <blockquote>“{{ t.quote }}”</blockquote>
              <figcaption><strong>{{ t.name }}</strong> · {{ t.shop }}, {{ t.city }}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <!-- ═══ HARDWARE (carrusel 3D) ═══ -->
      <section id="hardware" class="band hardware">
        <div class="section hw-layout">
          <div class="hw-copy" data-reveal>
            <p class="section-kicker">¿No tienes equipo?</p>
            <h2>Te lo vendemos e instalamos</h2>
            <p class="section-lede">
              Puedes usar lo que ya tienes: tu celular, una tablet vieja o la PC del mostrador.
              Pero si quieres algo nuevo, nosotros lo armamos todo.
            </p>
          </div>
          <div class="hw-stage" data-scene="view">
            <div class="hw-ring">
              <div class="hw-card" style="--i: 0">
                <span class="hw-icon" aria-hidden="true">📱</span>
                <h4>Tablet para caja</h4>
                <p>Compacta, rápida y bonita en el mostrador.</p>
              </div>
              <div class="hw-card" style="--i: 1">
                <span class="hw-icon" aria-hidden="true">🖨️</span>
                <h4>Impresora de tickets</h4>
                <p>80 mm, térmica, conexión USB o Bluetooth.</p>
              </div>
              <div class="hw-card" style="--i: 2">
                <span class="hw-icon" aria-hidden="true">📷</span>
                <h4>Escáner de códigos</h4>
                <p>Lee códigos de barras al instante.</p>
              </div>
              <div class="hw-card" style="--i: 3">
                <span class="hw-icon" aria-hidden="true">🖥️</span>
                <h4>Terminal All-in-One</h4>
                <p>Todo integrado: pantalla, impresora y escáner.</p>
              </div>
            </div>
            <span class="hw-floor" aria-hidden="true"></span>
          </div>
        </div>
      </section>

      <!-- ═══ PROVEEDORES OFICIALES ═══ -->
      <PartnersSection :plans="plans">
        <template #actions>
          <router-link class="btn amber lg" :to="{ path: '/register', query: { tipo: 'proveedor' } }">Quiero ser proveedor</router-link>
          <a class="btn line lg" :href="partnerWhatsapp" target="_blank" rel="noopener">Preguntar por WhatsApp</a>
        </template>
      </PartnersSection>

      <!-- ═══ CTA FINAL ═══ -->
      <section class="band final-cta" data-scene="enter">
        <div class="tunnel" aria-hidden="true">
          <span v-for="n in 8" :key="n" :style="{ '--n': n }"></span>
        </div>
        <div class="section final-inner">
          <div class="coin-wrap" aria-hidden="true">
            <div class="coin3d">
              <span v-for="n in 6" :key="n" class="coin-layer" :style="{ '--n': n }"></span>
              <img class="coin-back" src="/logo.svg" alt="" width="72" height="72" />
              <img class="coin-front" src="/logo.svg" alt="" width="72" height="72" />
            </div>
          </div>
          <h2>Tu tienda merece un sistema que no te deje tirado</h2>
          <p>
            Prueba Mi Tiendita 3 días. Si no te convence, cancelas y listo — sin cobros, sin letras chiquitas.
          </p>
          <div class="final-cta-actions">
            <router-link v-if="!loggedIn" class="btn amber lg" to="/register">
              Crear cuenta gratis
            </router-link>
            <router-link v-else class="btn amber lg" :to="{ name: homeRoute }">
              Ir al sistema
            </router-link>
          </div>
        </div>
      </section>
    </main>

    <!-- Licencia perpetua: qué es, antes de pedir una cuenta -->
    <Teleport to="body">
      <div v-if="showPerpetual" class="lp-modal-bg" @click.self="showPerpetual = false">
        <div class="lp-modal" role="dialog" aria-modal="true" aria-labelledby="perpetual-title">
          <button type="button" class="lp-modal-x" aria-label="Cerrar" @click="showPerpetual = false">×</button>
          <p class="lp-modal-kicker">Pago único</p>
          <h3 id="perpetual-title">Licencia perpetua</h3>
          <p>Pagas una vez y usas la caja, el catálogo y los tickets sin cuota mensual.</p>
          <div class="lp-modal-cols">
            <div>
              <h4>Incluye</h4>
              <ul>
                <li>Cobrar desde celular, tablet o PC en el navegador</li>
                <li>Sin instalar nada · 1 sucursal</li>
                <li>Hasta 20 usuarios</li>
                <li>Productos ilimitados</li>
                <li>Tickets de 80 mm, corte de caja e inventario</li>
              </ul>
            </div>
            <div>
              <h4>No incluye</h4>
              <ul>
                <li>Inventario Mágico ni Precio Mágico (la IA)</li>
              </ul>
              <h4>Soporte y actualizaciones</h4>
              <p class="lp-modal-small">Te explicamos precio y condiciones por WhatsApp antes de que decidas.</p>
            </div>
          </div>
          <div class="lp-modal-acts">
            <WhatsAppHelp label="Pregúntanos por WhatsApp" :message="PERPETUAL_MESSAGE" />
            <router-link v-if="loggedIn" class="lp-modal-link" :to="{ name: 'billing' }" @click="showPerpetual = false">
              Ver mi plan actual
            </router-link>
          </div>
        </div>
      </div>
    </Teleport>

    <footer class="foot">
      <div class="foot-brand">
        <BrandName />
        <p>Punto de venta en la nube para abarrotes y tiendas de barrio.</p>
      </div>
      <div class="foot-links">
        <router-link to="/login">Ingresar</router-link>
        <router-link to="/register">Registro</router-link>
        <router-link to="/ayuda">Ayuda</router-link>
        <a href="/guia-cajero.pdf" download>Guía de cajero</a>
        <router-link to="/terminos">Términos</router-link>
        <router-link to="/privacidad">Privacidad</router-link>
      </div>
      <nav class="foot-giros" aria-label="Punto de venta por giro">
        <strong>Punto de venta para tu giro</strong>
        <router-link v-for="v in VERTICALS" :key="v.slug" :to="`/${v.slug}`">{{ v.h1.replace(/^Punto de venta /, "") }}</router-link>
      </nav>
      <WhatsAppHelp class="foot-wa" label="¿Dudas? Escríbenos por WhatsApp" :message="PRESALE_MESSAGE" compact />
    </footer>
  </div>
</template>

<script setup>
import BrandName from "../components/BrandName.vue";
import { computed, onMounted, ref, nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { apiService } from "../apiService";
import { authStore, homeForRole } from "../authStore";
import InventarioMagicoTerm from "../components/InventarioMagicoTerm.vue";
import { useLandingMotion, vTilt } from "../landingMotion";
import WhatsAppHelp from "../components/WhatsAppHelp.vue";
import PartnersSection from "../components/landing/PartnersSection.vue";
import { PRICES, VERTICALS } from "../seo/site.mjs";
import { PERPETUAL_MESSAGE, PRESALE_MESSAGE, whatsappLink } from "../support";

const partnerWhatsapp = whatsappLink("Hola, me interesa ser proveedor oficial de Mi Tiendita en mi zona. ¿Cómo funciona?");

const route = useRoute();
const root = ref(null);
const { refresh } = useLandingMotion(root);
const plans = ref([]);
/** Testimonios reales: { name, shop, city, quote, photo? } — con permiso de la persona. Vacío = sección oculta. */
const testimonials = ref([]);
const billingInterval = ref("month");
const loggedIn = computed(() => Boolean(authStore.token));
const showPerpetual = ref(false);
const homeRoute = computed(() => homeForRole());
const planCtaTo = computed(() => {
  if (loggedIn.value) {
    return {
      name: "billing",
      query: billingInterval.value === "year" ? { interval: "year" } : undefined,
    };
  }
  return "/register";
});

/** Pseudo-aleatorio estable: las partículas quedan en el mismo lugar en cada render. */
function seeded(i, n) {
  const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function makeStars(count, offset) {
  return Array.from({ length: count }, (_, k) => {
    const i = k + offset;
    return {
      id: i,
      style: {
        left: `${(seeded(i, 1) * 100).toFixed(2)}%`,
        top: `${(seeded(i, 2) * 92).toFixed(2)}%`,
        "--s": `${(1 + seeded(i, 3) * 2.2).toFixed(2)}px`,
        "--t": `${(2.4 + seeded(i, 4) * 4).toFixed(2)}s`,
        "--dl": `${(-seeded(i, 5) * 6).toFixed(2)}s`,
      },
    };
  });
}

const starsFar = makeStars(16, 0);
const starsNear = makeStars(12, 100);
const sparks = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  style: {
    left: `${(seeded(i, 7) * 100).toFixed(2)}%`,
    top: `${(seeded(i, 8) * 100).toFixed(2)}%`,
    "--s": `${(0.6 + seeded(i, 9) * 1.1).toFixed(2)}rem`,
    "--t": `${(3 + seeded(i, 10) * 4).toFixed(2)}s`,
    "--dl": `${(-seeded(i, 11) * 7).toFixed(2)}s`,
  },
}));

function formatInt(n) {
  return Number(n || 0).toLocaleString("es-MX");
}

function planYearPrice(p) {
  return p.priceYear ?? Math.round(Number(p.price || 0) * 10);
}

function planMonthlyFromYear(p) {
  return p.monthlyFromYear ?? Math.round(planYearPrice(p) / 12);
}

const fallbackPlans = [
  {
    id: "basic",
    name: "Básico",
    tagline: "Para la tiendita que quiere dejar el cuaderno",
    price: 349,
    promoPrice: 116,
    promoMonths: 3,
    priceYear: 3490,
    monthlyFromYear: 291,
    aiQuotaLabel: "50 al mes",
    highlight: false,
    badge: null,
    features: [
      "1 sucursal · 2 usuarios",
      "Hasta 250 productos",
      "Inventario Mágico: lista o foto al catálogo",
      "Precio Mágico: IA ajusta costos y precio al público",
      "50 usos de magia al mes",
      "Tickets 80 mm",
    ],
  },
  {
    id: "growth",
    name: "Crecimiento",
    tagline: "Más cajeros, más productos, más control",
    price: 750,
    promoPrice: 250,
    promoMonths: 3,
    priceYear: 7500,
    monthlyFromYear: 625,
    aiQuotaLabel: "150 al mes",
    highlight: true,
    badge: "Más popular",
    features: [
      "Todo lo del Básico",
      "6 usuarios · 1,500 productos",
      "Inventario Mágico: lista o foto al catálogo",
      "Precio Mágico: IA ajusta costos y precio al público",
      "150 usos de magia al mes",
      "Cobro en pasillo con el celular",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Para tiendas con catálogo grande y proveedores",
    price: 1350,
    promoPrice: 450,
    promoMonths: 3,
    priceYear: 13500,
    monthlyFromYear: 1125,
    aiQuotaLabel: "500 al mes",
    highlight: false,
    badge: null,
    features: [
      "Todo lo de Crecimiento",
      "20 usuarios · productos ilimitados",
      "Inventario Mágico: lista o foto al catálogo",
      "Precio Mágico: IA ajusta costos y precio al público",
      "500 usos de magia al mes",
      "Lee fotos de facturas de proveedores",
    ],
  },
];

// Los precios de la landing salen SIEMPRE de PRICES (src/seo/site.mjs), nunca de la API ni de variables:
// la API solo aporta textos y características. Así lo que se ve es lo que está en el código.
const PROMO_DIVISOR = 3;
function withFixedPrices(list) {
  return list.map((p) => {
    const fixed = PRICES.find((x) => x.id === p.id);
    if (!fixed) return p;
    return {
      ...p,
      price: fixed.month,
      priceYear: fixed.year,
      monthlyFromYear: Math.floor(fixed.year / 12),
      promoPrice: Math.round(fixed.month / PROMO_DIVISOR),
      promoMonths: 3,
    };
  });
}

async function loadPlans() {
  plans.value = withFixedPrices(fallbackPlans);
  try {
    const res = await apiService.getBillingPlans();
    if (res.plans?.length) plans.value = withFixedPrices(res.plans);
  } catch {
    /* se quedan los de respaldo */
  }
}

function scrollToHash() {
  const hash = route.hash?.replace("#", "");
  if (!hash) return;
  nextTick(() => {
    document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

onMounted(async () => {
  await loadPlans();
  await nextTick();
  refresh();
  scrollToHash();
});

watch(() => route.hash, scrollToHash);
</script>

<style scoped>
/* ═══════════════════════════════════════════
   LAYOUT & BACKGROUND
   Variables que escribe landingMotion.js:
   --p (progreso de escena), --s0..--s3 (tramos), --mx/--my (mouse), --sp (scroll total)
   ═══════════════════════════════════════════ */
.landing {
  --nav-h: 3.25rem;
  --stage-bg: color-mix(in srgb, var(--timber-topbar) 88%, #040a14);
  --stage-ink: #f0f4fa;
  --stage-muted: #a9bdd6;
  --glow-blue: #5ec8ff;
  --glow-amber: #f0a94a;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  position: relative;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  background: transparent;
  color: var(--timber-ink);
  font-family: var(--font-sans);
  scroll-behavior: smooth;
}
.landing[data-motion="reduce"] {
  scroll-behavior: auto;
}

[data-scene] {
  --p: 0;
  --s0: 0;
  --s1: 0;
  --s2: 0;
  --s3: 0;
}

.sky {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background: var(--timber-surface);
}
.blob {
  position: absolute;
  border-radius: 50%;
  will-change: transform;
}
.b1 {
  width: 60rem;
  height: 60rem;
  left: -22rem;
  top: 18%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--timber-primary) 20%, transparent), transparent);
}
.b2 {
  width: 50rem;
  height: 50rem;
  right: -20rem;
  top: 55%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--timber-accent) 16%, transparent), transparent);
}
.b3 {
  width: 70rem;
  height: 44rem;
  left: 15%;
  top: 105%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--timber-primary) 14%, transparent), transparent);
}

.nav,
main,
.foot {
  position: relative;
  z-index: 1;
}

/* ═══════════════════════════════════════════
   NAV (transparente sobre el hero, vidrio al hacer scroll)
   ═══════════════════════════════════════════ */
.nav {
  position: sticky;
  top: 0;
  z-index: 30;
  height: var(--nav-h);
  margin-bottom: calc(var(--nav-h) * -1);
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0 1rem;
  color: var(--timber-topbar-text);
  background: transparent;
  transition: background 0.35s ease, box-shadow 0.35s ease;
}
.landing[data-scrolled] .nav {
  background: color-mix(in srgb, var(--timber-topbar) 84%, transparent);
  -webkit-backdrop-filter: blur(14px) saturate(1.3);
  backdrop-filter: blur(14px) saturate(1.3);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.06), 0 10px 30px rgba(5, 12, 24, 0.22);
}
.nav-meter {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  transform-origin: 0 50%;
  transform: scaleX(var(--sp, 0));
  background: linear-gradient(90deg, var(--glow-amber), var(--glow-blue));
  opacity: 0;
  transition: opacity 0.3s ease;
}
.landing[data-scrolled] .nav-meter {
  opacity: 1;
}
.nav-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  color: #fff;
  font-weight: 800;
  font-family: var(--font-display);
  font-size: 1.05rem;
}
.nav-brand { flex: none; white-space: nowrap; }
.nav-brand img { border-radius: 0.4rem; }
.nav-links { display: none; gap: 1.25rem; }
.nav-links a {
  position: relative;
  color: color-mix(in srgb, var(--timber-topbar-text) 72%, transparent);
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 700;
  transition: color 0.15s;
}
.nav-links a::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -0.3rem;
  height: 2px;
  border-radius: 2px;
  background: var(--glow-amber);
  transform: scaleX(0);
  transition: transform 0.25s var(--ease-out);
}
.nav-links a:hover { color: #fff; }
.nav-links a:hover::after { transform: scaleX(1); }
.nav-actions { margin-left: auto; display: flex; gap: 0.4rem; min-width: 0; }
.nav-actions .btn { white-space: nowrap; }
/* Celulares angostos: el encabezado se compacta para que logo y botones quepan en una línea */
@media (max-width: 420px) {
  .nav { gap: 0.5rem; padding: 0 0.6rem; }
  .nav-brand { gap: 0.35rem; font-size: 0.95rem; }
  .nav-brand img { width: 28px; height: 28px; }
  .nav-actions { gap: 0.3rem; }
  .nav-actions .btn { padding: 0 0.6rem; font-size: 0.8rem; }
}
@media (max-width: 350px) {
  .nav { gap: 0.35rem; padding: 0 0.45rem; }
  .nav-brand { font-size: 0.85rem; gap: 0.25rem; }
  .nav-brand img { width: 24px; height: 24px; }
  .nav-actions { gap: 0.25rem; }
  .nav-actions .btn { padding: 0 0.45rem; font-size: 0.74rem; }
}
@media (min-width: 880px) {
  .nav-links { display: flex; }
  .nav { padding-inline: 1.5rem; }
}

/* ═══════════════════════════════════════════
   BUTTONS
   ═══════════════════════════════════════════ */
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.35rem;
  padding: 0 0.9rem;
  border-radius: 0.55rem;
  font-weight: 800;
  font-size: 0.86rem;
  text-decoration: none;
  border: none;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  transition: transform 0.2s var(--ease-out), box-shadow 0.2s, filter 0.15s;
}
.btn:hover { transform: translateY(-2px); }
.btn:active { transform: translateY(0); }
.btn.lg { min-height: 2.95rem; padding: 0 1.35rem; font-size: 0.95rem; }
.btn.blue {
  background: var(--timber-primary);
  color: var(--timber-on-primary);
}
.btn.amber {
  background: var(--timber-accent);
  color: #1a1208;
  box-shadow: 0 4px 14px rgba(224, 138, 30, 0.3);
}
.btn.amber::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, 0.55) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform 0.7s var(--ease-out);
}
.btn.amber:hover::after { transform: translateX(120%); }
.btn.amber:hover { box-shadow: 0 10px 28px rgba(224, 138, 30, 0.45); }
.btn.ghost {
  background: transparent;
  color: var(--timber-topbar-text);
  border: 1px solid rgba(255, 255, 255, 0.22);
}
.btn.ghost:hover { background: rgba(255, 255, 255, 0.08); }
.btn.line {
  background: var(--timber-panel);
  color: var(--timber-ink);
  border: 1px solid var(--timber-line);
}

/* ═══════════════════════════════════════════
   TILT (v-tilt) — inclinación con brillo que sigue al cursor
   ═══════════════════════════════════════════ */
.tilt {
  position: relative;
  transform: perspective(900px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
  transition: transform 0.6s var(--ease-out), box-shadow 0.3s ease;
}
.tilt.is-tilting {
  transition: transform 0.12s linear, box-shadow 0.3s ease;
}
.tilt::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255, 255, 255, 0.3), transparent 55%);
  opacity: 0;
  transition: opacity 0.4s ease;
}
.tilt.is-tilting::after { opacity: 1; }

/* ═══════════════════════════════════════════
   HERO — escena 3D con el POS flotando
   ═══════════════════════════════════════════ */
.hero {
  --mx: 0;
  --my: 0;
  position: relative;
  z-index: 1;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: calc(var(--nav-h) + 2rem) 1.15rem 6rem;
  background:
    radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--timber-topbar) 55%, #1e5aa8) 0%, transparent 62%),
    var(--stage-bg);
  color: var(--timber-topbar-text);
  overflow: hidden;
}
.hero .btn.line {
  background: rgba(255, 255, 255, 0.04);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
.hero .btn.line:hover { background: rgba(255, 255, 255, 0.1); }

.hero-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.aurora {
  position: absolute;
  border-radius: 50%;
  will-change: transform;
}
.a1 {
  width: 46rem;
  height: 46rem;
  left: -14rem;
  top: -16rem;
  background: radial-gradient(closest-side, rgba(30, 90, 168, 0.7), transparent);
  transform: translate3d(calc(var(--mx) * -30px), calc(var(--my) * -20px + var(--p) * 160px), 0);
  animation: drift 18s ease-in-out infinite alternate;
}
.a2 {
  width: 34rem;
  height: 34rem;
  right: -10rem;
  top: 8%;
  background: radial-gradient(closest-side, rgba(240, 169, 74, 0.26), transparent);
  transform: translate3d(calc(var(--mx) * 40px), calc(var(--my) * 30px + var(--p) * 60px), 0);
  animation: drift 22s ease-in-out infinite alternate-reverse;
}
.a3 {
  width: 54rem;
  height: 36rem;
  left: 25%;
  bottom: -20rem;
  background: radial-gradient(closest-side, rgba(94, 200, 255, 0.2), transparent);
  transform: translate3d(calc(var(--mx) * 20px), calc(var(--p) * -80px), 0);
  animation: drift 26s ease-in-out infinite alternate;
}
@keyframes drift {
  to { translate: 5rem 3rem; scale: 1.15; }
}
.spot {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 40rem;
  height: 40rem;
  margin: -20rem 0 0 -20rem;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(130, 180, 255, 0.16), transparent);
  transform: translate3d(calc(var(--mx) * 45vw), calc(var(--my) * 42vh), 0);
  opacity: 0;
  transition: opacity 0.6s ease;
}
.landing[data-motion="full"] .spot { opacity: 1; }

.stars { position: absolute; inset: 0; }
.stars i {
  position: absolute;
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: #d6e8ff;
  opacity: 0.2;
  animation: twinkle var(--t) ease-in-out infinite;
  animation-delay: var(--dl);
}
.stars.far { transform: translate3d(calc(var(--mx) * -10px), calc(var(--my) * -8px + var(--p) * 60px), 0); }
.stars.near { transform: translate3d(calc(var(--mx) * -28px), calc(var(--my) * -18px + var(--p) * 200px), 0); }
@keyframes twinkle {
  50% { opacity: 0.95; scale: 1.5; }
}

.floor {
  position: absolute;
  left: -30%;
  right: -30%;
  bottom: 0;
  height: 44%;
  perspective: 320px;
  perspective-origin: 50% 0%;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 60%);
  mask-image: linear-gradient(to bottom, transparent 0%, #000 60%);
  opacity: 0.7;
  transform: translate3d(0, calc(var(--p) * 90px), 0);
}
.floor-plane {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 170%;
  transform-origin: 50% 0%;
  transform: rotateX(70deg);
  overflow: hidden;
}
.floor-lines {
  position: absolute;
  inset: -64px 0 0;
  background-image:
    linear-gradient(rgba(94, 200, 255, 0.32) 1px, transparent 1px),
    linear-gradient(90deg, rgba(94, 200, 255, 0.24) 1px, transparent 1px);
  background-size: 64px 64px;
  animation: floorRun 2.6s linear infinite;
}
@keyframes floorRun {
  to { transform: translate3d(0, 64px, 0); }
}

.hero-inner {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 72rem;
  margin: 0 auto;
  display: grid;
  gap: 3rem;
  align-items: center;
}
@media (min-width: 960px) {
  .hero { padding: calc(var(--nav-h) + 2.5rem) 1.75rem 6rem; }
  .hero-inner { grid-template-columns: 1fr 1fr; gap: 3rem; }
}
.hero-copy {
  transform: translate3d(0, calc(var(--p) * -140px), 0);
  opacity: calc(1 - var(--p) * 1.5);
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  padding: 0.38rem 0.8rem;
  border-radius: 999px;
  border: 1px solid rgba(240, 169, 74, 0.35);
  background: rgba(240, 169, 74, 0.08);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--glow-amber);
  animation: rise 0.8s var(--ease-out) both;
}
.live-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--glow-amber);
  animation: ping 2s ease-out infinite;
}
@keyframes ping {
  0% { box-shadow: 0 0 0 0 rgba(240, 169, 74, 0.6); }
  70%, 100% { box-shadow: 0 0 0 0.55rem rgba(240, 169, 74, 0); }
}
.hero-title {
  margin: 1.1rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(2.4rem, 5.4vw, 3.65rem);
  font-weight: 800;
  letter-spacing: -0.045em;
  line-height: 1.02;
  color: #ffffff;
  perspective: 700px;
}
.hero-title .line { display: block; }
.w {
  display: inline-block;
  transform-origin: 50% 100%;
  animation: wordIn 1s var(--ease-out) both;
  animation-delay: calc(0.15s + var(--i) * 0.07s);
}
.w.hl {
  background: linear-gradient(100deg, #ffd690 0%, var(--glow-amber) 45%, #ff8f3f 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
@keyframes wordIn {
  from {
    opacity: 0;
    transform: translate3d(0, 0.55em, 0) rotateX(-80deg);
    filter: blur(8px);
  }
}
.hero-line {
  margin: 1.15rem 0 0;
  max-width: 28rem;
  font-size: 1.08rem;
  line-height: 1.55;
  color: #c8d8ec;
  animation: rise 0.9s var(--ease-out) both 0.6s;
}
.hero-cta {
  margin-top: 1.6rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  animation: rise 0.9s var(--ease-out) both 0.72s;
}
.hero-note {
  margin: 0.8rem 0 0;
  font-size: 0.78rem;
  color: rgba(200, 216, 236, 0.62);
  font-weight: 600;
  animation: rise 0.9s var(--ease-out) both 0.84s;
}
@keyframes rise {
  from { opacity: 0; transform: translate3d(0, 18px, 0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
}

.hero-stage {
  position: relative;
  display: flex;
  justify-content: center;
  padding: 2rem 0;
  perspective: 1500px;
  perspective-origin: 50% 35%;
  animation: fadeIn 1.2s ease both 0.25s;
}
.rig {
  --rx0: 14deg;
  --ry0: -22deg;
  position: relative;
  width: min(100%, 34rem);
  transform-style: preserve-3d;
  transform:
    translate3d(0, calc(var(--p) * 120px), 0)
    rotateX(calc(var(--rx0) - var(--my) * 8deg - var(--p) * 10deg))
    rotateY(calc(var(--ry0) + var(--mx) * 14deg + var(--p) * 28deg))
    rotateZ(calc(2deg - var(--p) * 2deg));
  animation: rigIn 1.8s var(--ease-out) both 0.15s;
  will-change: transform;
}
@keyframes rigIn {
  from { translate: 0 160px -500px; rotate: x 45deg; }
}
.rig-shadow {
  position: absolute;
  inset: 12% 4% -14% 4%;
  border-radius: 2rem;
  background: radial-gradient(closest-side, rgba(0, 0, 0, 0.6), transparent);
  transform: translateZ(-140px);
  filter: blur(18px);
}

/* POS shot */
.shot {
  position: relative;
  width: 100%;
  border-radius: 0.8rem;
  overflow: hidden;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  box-shadow:
    0 40px 80px -20px rgba(0, 0, 0, 0.6),
    0 0 0 1px rgba(255, 255, 255, 0.06),
    0 0 60px rgba(94, 154, 232, 0.18);
  font-size: 0.72rem;
  color: var(--timber-ink);
}
.shot::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    115deg,
    transparent calc(30% + var(--mx) * 18%),
    rgba(255, 255, 255, 0.22) calc(42% + var(--mx) * 18%),
    transparent calc(54% + var(--mx) * 18%)
  );
  mix-blend-mode: soft-light;
}
.shot-top {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.5rem;
  background: var(--timber-topbar);
  color: var(--timber-topbar-text);
  font-weight: 700;
}
.shot-top img { border-radius: 0.3rem; }
.shot-nav {
  padding: 0.2rem 0.45rem;
  border-radius: 0.35rem;
  color: color-mix(in srgb, var(--timber-topbar-text) 75%, transparent);
  font-weight: 700;
}
.shot-nav.on { background: rgba(255, 255, 255, 0.14); color: #fff; }
.shot-clock { margin-left: auto; font-variant-numeric: tabular-nums; opacity: 0.85; }
.shot-fkeys {
  display: flex;
  gap: 0.25rem;
  padding: 0.28rem 0.4rem;
  background: var(--timber-topbar);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.shot-fkeys span {
  padding: 0.28rem 0.4rem;
  border-radius: 0.35rem;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--timber-topbar-text);
  font-weight: 700;
  white-space: nowrap;
}
.cobrar {
  background: var(--timber-accent);
  color: #1a1208 !important;
  border-color: transparent !important;
  font-weight: 800;
}
.shot-status {
  display: flex;
  gap: 0.75rem;
  padding: 0.22rem 0.55rem;
  background: color-mix(in srgb, var(--timber-primary) 88%, #0a1a30);
  color: #dce8f6;
  font-weight: 600;
  font-size: 0.68rem;
}
.shot-status .hint { margin-left: auto; opacity: 0.75; }
.shot-desk {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr;
  gap: 0.35rem;
  padding: 0.4rem;
  background: var(--timber-surface);
}
.shot-scan {
  position: relative;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: 0.45rem;
  padding: 0.35rem 0.45rem;
  overflow: hidden;
}
.shot-scan::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(239, 68, 68, 0.9), transparent);
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.8);
  animation: laser 2.4s ease-in-out infinite;
}
@keyframes laser {
  0%, 100% { translate: 0 0.2rem; opacity: 0; }
  20%, 80% { opacity: 1; }
  50% { translate: 0 2.6rem; }
}
.shot-scan span {
  display: block;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--timber-muted);
  margin-bottom: 0.25rem;
}
.shot-scan div {
  border: 2px solid var(--timber-ink);
  border-radius: 0.35rem;
  padding: 0.28rem 0.4rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  background: var(--timber-panel-elevated);
}
.caret {
  display: inline-block;
  width: 1px;
  height: 0.85em;
  margin-left: 2px;
  vertical-align: -0.1em;
  background: currentColor;
  animation: blink 1s steps(1) infinite;
}
@keyframes blink {
  50% { opacity: 0; }
}
.shot-total {
  background: #0d1624;
  color: #e8eef6;
  border-radius: 0.45rem;
  padding: 0.4rem 0.5rem;
}
.shot-total p { margin: 0; }
.shot-total .lbl {
  font-size: 0.58rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #7a8ea8;
  font-weight: 700;
}
.shot-total strong {
  display: block;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #5ec8ff;
  line-height: 1.05;
  text-shadow: 0 0 16px rgba(94, 200, 255, 0.45);
}
.shot-total .tax { color: #8a9bb0; font-size: 0.62rem; margin-top: 0.15rem; }
.shot table { width: 100%; border-collapse: collapse; }
.shot th {
  text-align: left;
  font-size: 0.58rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--timber-muted);
  padding: 0.35rem 0.45rem;
  border-bottom: 1px solid var(--timber-line);
  font-weight: 800;
}
.shot td {
  padding: 0.32rem 0.45rem;
  border-bottom: 1px solid var(--timber-line);
  font-weight: 600;
}
.shot tr.on { background: var(--timber-primary-soft); }
.shot-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-top: 1px solid var(--timber-line);
}
.shot-foot strong { display: block; font-size: 0.78rem; }
.shot-foot span { color: var(--timber-muted); font-weight: 700; }
.shot-foot .cobrar {
  padding: 0.45rem 0.7rem;
  border-radius: 0.4rem;
  letter-spacing: 0.05em;
}

/* Piezas flotantes: cada una vive a una profundidad Z distinta y se separan al hacer scroll */
.fl {
  position: absolute;
  transform-style: preserve-3d;
  transform: translate3d(
    calc(var(--dx) * var(--p)),
    calc(var(--dy) * var(--p)),
    calc(var(--z) * var(--zk, 1) * (1 + var(--p) * 1.6))
  );
  animation: bob 7s ease-in-out infinite;
  animation-delay: var(--dl, 0s);
}
@keyframes bob {
  50% { translate: 0 -14px; }
}
.fl-ticket { --z: 150px; --dx: 90px; --dy: -30px; --dl: -1s; right: -9%; top: 26%; }
.fl-scan { --z: 210px; --dx: -130px; --dy: -60px; --dl: -3s; left: -12%; top: 12%; }
.fl-sync { --z: 110px; --dx: -70px; --dy: 90px; --dl: -5s; left: 5%; bottom: -9%; }
.fl-coin { --z: 270px; --dx: 70px; --dy: -130px; --dl: -2s; right: 9%; top: -12%; }
.fl-magic { --z: 190px; --dx: 110px; --dy: 100px; --dl: -4s; right: -5%; bottom: -12%; }

.ticket {
  width: 9.6rem;
  padding: 0.75rem 0.8rem 1.1rem;
  display: grid;
  gap: 0.18rem;
  background: #fffdf7;
  color: #1a2332;
  font: 600 0.6rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  box-shadow: 0 24px 40px rgba(0, 0, 0, 0.4);
  -webkit-mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 10px 100%;
  mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 10px 100%;
  animation: print 1.6s steps(14) both 1.2s;
}
@keyframes print {
  from { clip-path: inset(0 0 100% 0); }
  to { clip-path: inset(0 0 0 0); }
}
.ticket b { font-size: 0.66rem; text-align: center; letter-spacing: 0.04em; margin-bottom: 0.2rem; }
.tk-row { display: flex; justify-content: space-between; gap: 0.5rem; }
.tk-row em { font-style: normal; }
.tk-total {
  margin-top: 0.2rem;
  padding-top: 0.25rem;
  border-top: 1px dashed rgba(26, 35, 50, 0.35);
  font-weight: 800;
}
.tk-bars {
  height: 1.3rem;
  margin-top: 0.35rem;
  background: repeating-linear-gradient(90deg, #1a2332 0 2px, transparent 2px 3px, #1a2332 3px 4px, transparent 4px 7px);
}
.tk-thanks { text-align: center; font-size: 0.55rem; opacity: 0.7; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  padding: 0.55rem 0.8rem;
  border-radius: 0.85rem;
  font-size: 0.74rem;
  font-weight: 800;
  color: #fff;
  background: rgba(13, 26, 48, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.4);
}
.chip-scan { font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
.bars {
  position: relative;
  width: 2.2rem;
  height: 1.15rem;
  background: repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 3px, #fff 3px 4px, transparent 4px 6px);
  overflow: hidden;
}
.bars i {
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: #ef4444;
  box-shadow: 0 0 6px 2px rgba(239, 68, 68, 0.8);
  animation: sweep 1.8s ease-in-out infinite alternate;
}
@keyframes sweep {
  to { translate: 2.1rem 0; }
}
.chip-sync { color: #dff7e9; }
.pulse {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #6ce9a6;
  animation: pingGreen 1.8s ease-out infinite;
}
@keyframes pingGreen {
  0% { box-shadow: 0 0 0 0 rgba(108, 233, 166, 0.65); }
  70%, 100% { box-shadow: 0 0 0 0.55rem rgba(108, 233, 166, 0); }
}
.chip-magic {
  color: var(--glow-amber);
  border-color: rgba(240, 169, 74, 0.45);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.4), 0 0 24px rgba(240, 169, 74, 0.25);
}
.coin {
  display: grid;
  place-items: center;
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ffe2a8, var(--glow-amber) 55%, #c26a12);
  color: #3a1f02;
  font-weight: 900;
  font-size: 0.8rem;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.18), 0 14px 30px rgba(0, 0, 0, 0.4), 0 0 30px rgba(240, 169, 74, 0.4);
}

.scroll-cue {
  position: absolute;
  left: 50%;
  bottom: 4.6rem;
  z-index: 3;
  margin-left: -0.75rem;
  opacity: calc(0.75 - var(--p) * 4);
  animation: fadeIn 1s ease both 1.6s;
}
.mouse {
  display: block;
  width: 1.5rem;
  height: 2.3rem;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 1rem;
}
.mouse i {
  display: block;
  width: 3px;
  height: 0.45rem;
  margin: 0.4rem auto 0;
  border-radius: 2px;
  background: #fff;
  animation: wheel 1.8s ease-in-out infinite;
}
@keyframes wheel {
  0% { opacity: 0; translate: 0 -2px; }
  30% { opacity: 1; }
  100% { opacity: 0; translate: 0 10px; }
}

/* ═══════════════════════════════════════════
   TRUST STRIP — tarjeta de vidrio que se levanta en 3D
   ═══════════════════════════════════════════ */
.trust {
  position: relative;
  z-index: 3;
  margin-top: -3.5rem;
  padding: 0 1.15rem;
  perspective: 1000px;
  background: linear-gradient(to bottom, transparent 3.5rem, var(--timber-panel) 3.5rem);
}
.trust-inner {
  max-width: 60rem;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  padding: 1rem 1.15rem;
  border-radius: 1.25rem;
  background: color-mix(in srgb, var(--timber-panel) 90%, transparent);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  backdrop-filter: blur(16px) saturate(1.4);
  border: 1px solid var(--timber-line);
  box-shadow: 0 30px 60px -24px rgba(10, 24, 48, 0.4);
  transform-origin: 50% 0%;
  transform: rotateX(calc((1 - var(--p)) * 38deg)) translate3d(0, calc((1 - var(--p)) * 24px), 0);
}
@media (min-width: 640px) {
  .trust-inner { grid-template-columns: repeat(4, 1fr); }
}
.trust-item {
  --e: clamp(0, calc(var(--p) * 2 - var(--k) * 0.2), 1);
  text-align: center;
  padding: 0.5rem 0.25rem;
  opacity: calc(0.2 + var(--e) * 0.8);
  translate: 0 calc((1 - var(--e)) * 14px);
}
.trust-item strong {
  display: block;
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--timber-primary);
  font-variant-numeric: tabular-nums;
}
.trust-item span {
  font-size: 0.78rem;
  color: var(--timber-muted);
  font-weight: 600;
}

/* ═══════════════════════════════════════════
   SHARED SECTION STYLES
   ═══════════════════════════════════════════ */
.band {
  position: relative;
  z-index: 1;
}
.section {
  position: relative;
  z-index: 1;
  max-width: 58rem;
  margin: 0 auto;
  padding: 3.5rem 1.15rem;
}
.section-kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--timber-primary);
}
.section h2,
.scene-head h2 {
  margin: 0.3rem 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.55rem, 3vw, 2.25rem);
  font-weight: 800;
  letter-spacing: -0.035em;
  line-height: 1.12;
}
.section-lede {
  margin: 0.6rem 0 0;
  max-width: 36rem;
  color: var(--timber-muted);
  font-size: 1rem;
  line-height: 1.55;
}

/* Escenas fijas: la pista mide varias pantallas y el escenario se queda pegado arriba */
.pin-track { position: relative; }
.pin-stage {
  position: sticky;
  top: 0;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: clamp(0.9rem, 3vh, 2rem);
  padding: calc(var(--nav-h) + 0.75rem) 1.15rem 1.25rem;
  overflow: hidden;
}

/* Revelado al entrar en pantalla */
.landing[data-motion="full"] [data-reveal],
.landing[data-motion="lite"] [data-reveal] {
  transition: opacity 0.9s var(--ease-out), translate 0.9s var(--ease-out);
}
.landing[data-motion="full"] [data-reveal]:not(.is-in),
.landing[data-motion="lite"] [data-reveal]:not(.is-in) {
  opacity: 0;
  translate: 0 28px;
}

/* ═══════════════════════════════════════════
   CÓMO FUNCIONA — equipos que vuelan, se sincronizan y uno falla
   s0: llegan · s1: se conectan a la nube · s2: la PC se descompone
   ═══════════════════════════════════════════ */
.devices-band {
  background:
    radial-gradient(circle, color-mix(in srgb, var(--timber-primary) 16%, transparent) 1px, transparent 1.6px) 0 0 / 22px 22px,
    var(--timber-panel);
}
.devices-track { height: 330vh; }
.scene-head {
  max-width: 40rem;
  text-align: center;
}
.scene-head .section-lede { margin-inline: auto; }

.device-stage {
  width: 100%;
  display: flex;
  justify-content: center;
  perspective: 1300px;
  perspective-origin: 50% 20%;
}
.device-rig {
  --cols: 11em 15em 16em;
  font-size: min(16px, calc((100vw - 2.5rem) / 47));
  position: relative;
  display: grid;
  grid-template-columns: var(--cols);
  column-gap: 2.5em;
  align-items: stretch;
  padding-top: 3.2em;
  transform-style: preserve-3d;
  transform: rotateX(calc(16deg - var(--s0) * 12deg));
}
.cloud-hub {
  position: absolute;
  top: 0;
  left: 50%;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.35rem 0.8rem 0.35rem 0.55rem;
  border-radius: 999px;
  background: var(--timber-primary);
  color: var(--timber-on-primary);
  font-size: max(0.68rem, 0.8em);
  font-weight: 800;
  white-space: nowrap;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--timber-primary) 45%, transparent);
  transform: translate3d(-50%, calc((1 - var(--s1)) * -14px), 40px) scale(calc(0.8 + var(--s1) * 0.2));
  opacity: var(--s1);
}
.cloud-hub .cloud-shape {
  font-size: 0.42rem;
  --cloud: #fff;
}
.bus {
  position: absolute;
  top: 3.2em;
  left: 5.5em;
  right: 8em;
  height: 2px;
  background: linear-gradient(90deg, var(--timber-primary), var(--glow-blue), var(--timber-primary));
  transform: scaleX(var(--s1));
  box-shadow: 0 0 12px color-mix(in srgb, var(--glow-blue) 60%, transparent);
}

.dev {
  --f: calc(1 - var(--s0));
  position: relative;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  perspective: 900px;
  transform:
    translate3d(calc(var(--f) * var(--fx)), calc(var(--f) * var(--fy)), calc(var(--f) * var(--fz)))
    rotateX(calc(var(--f) * var(--frx)))
    rotateY(calc(var(--f) * var(--fry)))
    rotateZ(calc(var(--f) * var(--frz)));
  opacity: calc(0.12 + var(--s0) * 0.88);
}
.dev-phone { --fx: -16em; --fy: 5em; --fz: -380px; --frx: 10deg; --fry: 60deg; --frz: -16deg; }
.dev-tablet { --fx: 0em; --fy: -10em; --fz: -640px; --frx: -55deg; --fry: 0deg; --frz: 9deg; }
.dev-pc { --fx: 16em; --fy: 6em; --fz: -440px; --frx: 14deg; --fry: -60deg; --frz: 11deg; }

.drop {
  position: relative;
  flex: 1 1 auto;
  width: 2px;
  min-height: 1.4em;
  margin-bottom: 0.7em;
  background:
    linear-gradient(transparent 0 35%, #fff 50%, transparent 65%) 0 0 / 100% 300%,
    linear-gradient(var(--glow-blue), var(--timber-primary));
  transform-origin: 50% 0;
  transform: scaleY(var(--s1));
  animation: dataFlow 1.4s linear infinite;
}
@keyframes dataFlow {
  from { background-position: 0 100%, 0 0; }
  to { background-position: 0 0%, 0 0; }
}
.dev-pc .drop { opacity: calc(1 - var(--s2) * 0.85); }

.device { position: relative; margin: 0 auto; }
.bezel {
  position: relative;
  background: #1a2332;
  box-shadow: 0 1.5em 3em -1em rgba(18, 32, 56, 0.45);
}
.bezel::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  pointer-events: none;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--glow-blue) 70%, transparent), 0 0 2.2em color-mix(in srgb, var(--glow-blue) 55%, transparent);
  opacity: var(--s1);
}
.dev-pc .bezel::after { opacity: calc(var(--s1) * (1 - var(--s2))); }
.screen {
  position: relative;
  background: var(--timber-panel);
  color: var(--timber-ink);
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 0.2em;
}
.screen p {
  margin: 0;
  font-size: 0.68em;
  font-weight: 700;
  color: var(--timber-muted);
}
.screen strong { font-size: 1.05em; color: var(--timber-primary); }

.phone .bezel {
  width: 8.2em;
  height: 15.4em;
  padding: 0.85em 0.45em 0.55em;
  border-radius: 1.55em;
  border: 3px solid #0e1520;
  display: flex;
  flex-direction: column;
}
.phone .notch {
  position: absolute;
  top: 0.38em;
  left: 50%;
  width: 2.6em;
  height: 0.42em;
  margin-left: -1.3em;
  border-radius: 999px;
  background: #0e1520;
}
.phone .screen { flex: 1; border-radius: 1.05em; }
.tablet .bezel {
  width: 13.5em;
  height: 9.4em;
  padding: 0.5em 0.5em 0.5em 0.85em;
  border-radius: 1em;
  border: 3px solid #0e1520;
  display: flex;
}
.tablet .cam {
  position: absolute;
  left: 0.32em;
  top: 50%;
  width: 0.32em;
  height: 0.32em;
  margin-top: -0.16em;
  border-radius: 50%;
  background: #3a4658;
}
.tablet .screen { flex: 1; border-radius: 0.4em; }
.pc .monitor { width: 15em; }
.pc .bezel {
  padding: 0.45em 0.45em 0.7em;
  border-radius: 0.55em 0.55em 0.2em 0.2em;
  border: 3px solid #0e1520;
}
.pc .screen { height: 8.2em; border-radius: 0.2em; overflow: hidden; }
.pc .pay {
  background: var(--timber-accent);
  color: #1a1208;
  font-size: 0.68em;
  letter-spacing: 0.05em;
  padding: 0.28em 0.5em;
  border-radius: 0.3em;
}
.pc .neck {
  display: block;
  width: 1.6em;
  height: 1.15em;
  margin: 0 auto;
  background: #1a2332;
}
.pc .base {
  display: block;
  width: 5.2em;
  height: 0.38em;
  margin: 0 auto;
  border-radius: 0 0 0.35em 0.35em;
  background: #0e1520;
}

/* La PC "se descompone": se inclina hacia atrás, pierde color y la pantalla se raya */
.dev-pc .monitor {
  transform-origin: 50% 100%;
  transform: rotateX(calc(var(--s2) * 30deg)) translate3d(0, calc(var(--s2) * 0.6em), calc(var(--s2) * -2em));
  filter: grayscale(var(--s2)) brightness(calc(1 - var(--s2) * 0.35));
}
.dev-pc .screen::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(128deg, transparent 44%, rgba(255, 255, 255, 0.85) 45%, transparent 46.5%),
    linear-gradient(64deg, transparent 58%, rgba(255, 255, 255, 0.6) 59%, transparent 60%),
    repeating-linear-gradient(0deg, rgba(198, 40, 40, 0.22) 0 2px, transparent 2px 4px),
    #2a0d0d;
  opacity: calc(var(--s2) * 0.92);
}
.dev-chip {
  position: absolute;
  left: 50%;
  top: 0;
  z-index: 2;
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: max(0.6rem, 0.72em);
  font-weight: 800;
  white-space: nowrap;
  color: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  transform: translate3d(-50%, calc(-50% + (1 - var(--s2)) * 10px), 30px);
  opacity: var(--s2);
}
.dev-chip.ok { background: var(--timber-success); }
.dev-chip.bad { background: var(--timber-danger); }

.dev figcaption {
  margin-top: 0.8em;
  font-weight: 800;
  font-size: max(0.8rem, 0.95em);
}
.device-hint {
  margin: 0.2em 0 0;
  font-size: max(0.7rem, 0.78em);
  color: var(--timber-muted);
  font-weight: 600;
  line-height: 1.3;
}
.device-fallback {
  margin: 0;
  max-width: 40rem;
  padding: 0.85rem 1.1rem;
  border-radius: 0.85rem;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  font-size: 0.92rem;
  line-height: 1.45;
  text-align: center;
  opacity: calc(0.45 + var(--s2) * 0.55);
  transform: scale(calc(0.96 + var(--s2) * 0.04));
  box-shadow: 0 0 0 calc(var(--s2) * 2px) color-mix(in srgb, var(--timber-primary) 40%, transparent);
}
.device-fallback strong { font-weight: 800; }

@media (max-width: 699.98px) {
  .device-rig {
    --cols: 9.5em 14em 15.5em;
    font-size: min(16px, calc((100vw - 2rem) / 41.5));
    column-gap: 1.25em;
  }
  .bus { left: 4.75em; right: 7.75em; }
  .devices-track { height: 280vh; }
  .scene-head .section-lede { font-size: 0.92rem; }
}

/* ═══════════════════════════════════════════
   INVENTARIO MÁGICO — escenario oscuro
   ═══════════════════════════════════════════ */
.band.magic {
  overflow: clip;
  color: var(--stage-ink);
  background:
    radial-gradient(60rem 30rem at 12% 0%, color-mix(in srgb, var(--timber-primary) 38%, transparent), transparent 60%),
    radial-gradient(46rem 30rem at 92% 45%, rgba(240, 169, 74, 0.14), transparent 60%),
    linear-gradient(180deg, var(--stage-bg), color-mix(in srgb, var(--stage-bg) 82%, #1b1145));
}
.magic .section-kicker { color: var(--glow-blue); }
.magic .section-lede { color: var(--stage-muted); }
.magic-sky {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.magic-sky i {
  position: absolute;
  font-style: normal;
  font-size: var(--s);
  color: var(--glow-amber);
  opacity: 0;
  animation: sparkleFloat var(--t) ease-in-out infinite;
  animation-delay: var(--dl);
}
@keyframes sparkleFloat {
  0%, 100% { opacity: 0; scale: 0.4; translate: 0 10px; }
  50% { opacity: 0.55; scale: 1; translate: 0 -10px; }
}
.magic-intro { padding-bottom: 1rem; }
.magic-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.magic-spark {
  font-size: 1.1rem;
  color: var(--glow-amber);
  animation: sparkle 2s ease-in-out infinite;
}
@keyframes sparkle {
  0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
  50% { opacity: 0.5; transform: scale(1.3) rotate(45deg); }
}
.magic h2 { color: #fff; }
.magic-lede { max-width: 40rem; }

.magic-pair {
  margin-top: 1.6rem;
  display: grid;
  gap: 1rem;
  perspective: 1100px;
}
@media (min-width: 720px) {
  .magic-pair { grid-template-columns: 1fr 1fr; }
}
.glass {
  border-radius: 1.1rem;
  padding: 1.3rem 1.35rem 1.4rem;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(255, 255, 255, 0.13);
  box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}
.magic-pair article {
  --e: clamp(0, calc(var(--p) * 1.7 - var(--k) * 0.22), 1);
  scroll-margin-top: 6rem;
  translate: 0 calc((1 - var(--e)) * 60px) calc((1 - var(--e)) * -140px);
  rotate: x calc((1 - var(--e)) * 30deg);
  opacity: calc(var(--e) * 1.2);
}
.pair-kicker {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--glow-amber);
}
.magic-pair h3 {
  margin: 0.45rem 0 0;
  font-size: 1.2rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}
.magic-pair p:not(.pair-kicker) {
  margin: 0.45rem 0 0;
  color: var(--stage-muted);
  font-size: 0.93rem;
  line-height: 1.5;
}

/* Escena fija: papelito → escaneo → catálogo → etiqueta de precio que gira
   s0: se escribe · s1: la nube lo lee · s2: entra al catálogo · s3: Precio Mágico */
.magic-track { height: 380vh; }
.magic-scene {
  width: 100%;
  max-width: 72rem;
  display: grid;
  gap: 1.25rem;
  align-items: center;
}
@media (min-width: 900px) {
  .magic-scene { grid-template-columns: 0.72fr 1.28fr; gap: 3rem; }
}
.magic-flow {
  position: relative;
  display: grid;
  gap: 0.25rem;
}
.flow-rail {
  position: absolute;
  left: 1.05rem;
  top: 1.4rem;
  bottom: 1.4rem;
  width: 2px;
  margin-left: -1px;
  background: rgba(255, 255, 255, 0.12);
}
.flow-rail span {
  position: absolute;
  inset: 0;
  background: linear-gradient(var(--glow-amber), var(--glow-blue));
  transform-origin: 50% 0;
  transform: scaleY(var(--p));
}
.magic-step {
  position: relative;
  display: grid;
  grid-template-columns: 2.1rem 1fr;
  gap: 0.85rem;
  align-items: start;
  padding: 0.7rem 0.5rem 0.7rem 0;
  opacity: 0.38;
  transition: opacity 0.45s ease, translate 0.45s var(--ease-out);
}
.step {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 2.1rem;
  height: 2.1rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: #142542;
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: var(--stage-ink);
  font-weight: 800;
  font-size: 0.85rem;
  transition: background 0.45s ease, box-shadow 0.45s ease, color 0.45s ease;
}
.magic-step h3 { margin: 0.3rem 0 0; font-size: 1.12rem; color: #fff; }
.magic-step p {
  margin: 0.3rem 0 0;
  color: var(--stage-muted);
  font-size: 0.94rem;
  line-height: 1.45;
}
.magic-track[data-at="0"] .st1,
.magic-track[data-at="1"] .st1,
.magic-track[data-at="2"] .st2,
.magic-track[data-at="3"] .st3,
.magic-track[data-at="4"] .st3 {
  opacity: 1;
  translate: 0.35rem 0;
}
.magic-track[data-at="0"] .st1 .step,
.magic-track[data-at="1"] .st1 .step,
.magic-track[data-at="2"] .st2 .step,
.magic-track[data-at="3"] .st3 .step,
.magic-track[data-at="4"] .st3 .step {
  background: var(--glow-amber);
  border-color: transparent;
  color: #2a1604;
  box-shadow: 0 0 0 0.35rem rgba(240, 169, 74, 0.18), 0 0 24px rgba(240, 169, 74, 0.5);
}

.magic-demo {
  perspective: 1400px;
  perspective-origin: 50% 30%;
}
.demo-rig {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 1rem;
  align-items: center;
  padding-bottom: 7rem;
  transform-style: preserve-3d;
  transform: rotateX(calc(14deg - var(--p) * 8deg)) rotateY(calc(-16deg + var(--p) * 24deg));
}
.magic-demo-label {
  margin: 0 0 0.55rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--stage-muted);
}
.magic-demo-icon { font-size: 0.9rem; }
.magic-demo-input { transform: translateZ(10px); }
.note {
  position: relative;
  padding: 1.1rem 1.1rem 1.25rem;
  border-radius: 0.3rem;
  background:
    repeating-linear-gradient(transparent 0 calc(2.7rem - 1px), rgba(30, 90, 168, 0.2) calc(2.7rem - 1px) 2.7rem) 0 1.1rem,
    #fdf6e3;
  color: #1f3a68;
  box-shadow: 0 30px 50px -18px rgba(0, 0, 0, 0.7);
  transform: rotateZ(-3deg);
}
.tape {
  position: absolute;
  top: -0.65rem;
  left: 50%;
  width: 4.5rem;
  height: 1.3rem;
  margin-left: -2.25rem;
  background: rgba(255, 236, 170, 0.75);
  transform: rotate(-4deg);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}
.note pre {
  margin: 0;
  font-family: "Caveat", "Segoe Print", "Bradley Hand", cursive;
  font-size: 1.8rem;
  font-weight: 700;
  line-height: 1.5;
  white-space: pre-wrap;
  color: #1f3a68;
}
.ln {
  --hit: clamp(0, calc(var(--s1) * 3.2 - var(--k)), 1);
  --m: clamp(0, calc(var(--s2) * 2 - var(--k) * 0.45), 1);
  position: relative;
  display: inline-block;
}
/* se escribe a mano, renglón por renglón */
.ln-t {
  display: inline-block;
  clip-path: inset(-0.3em calc((1 - clamp(0, calc(var(--s0) * 3 - var(--k)), 1)) * 100%) -0.3em -0.2em);
}
/* resaltado del escáner */
.ln::after {
  content: "";
  position: absolute;
  left: -0.2em;
  right: -0.2em;
  top: 18%;
  bottom: 12%;
  z-index: -1;
  border-radius: 0.25em;
  background: rgba(94, 200, 255, 0.32);
  transform-origin: 0 50%;
  transform: scaleX(var(--hit));
}
/* copia brillante que "viaja" al catálogo */
.ln::before {
  content: attr(data-t);
  position: absolute;
  left: 0;
  top: 0;
  white-space: pre;
  color: var(--glow-blue);
  text-shadow: 0 0 12px rgba(94, 200, 255, 0.9);
  pointer-events: none;
  opacity: calc(min(var(--m) * 6, 1) * (1 - var(--m)));
  transform: translate3d(calc(var(--m) * 13em), calc(var(--m) * -0.4em), 0) scale(calc(1 - var(--m) * 0.35));
}
.ln-ok {
  margin-left: 0.3em;
  font-style: normal;
  font-family: var(--font-sans);
  font-size: 0.7em;
  color: var(--timber-success);
  opacity: var(--m);
}
.beam {
  position: absolute;
  left: -6%;
  right: -6%;
  top: calc(0.6rem + var(--s1) * (100% - 1.2rem));
  height: 3px;
  border-radius: 3px;
  background: linear-gradient(90deg, transparent, var(--glow-blue), #fff, var(--glow-blue), transparent);
  box-shadow: 0 0 18px 4px rgba(94, 200, 255, 0.6);
  opacity: calc(min(var(--s1) * 8, 1) * (1 - var(--s2)));
  pointer-events: none;
}
.magic-demo-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  align-self: stretch;
  padding: 1.5rem 0 0;
  transform: translateZ(30px);
}
.arrow-line {
  flex: 1;
  width: 2px;
  background: linear-gradient(180deg, transparent, var(--glow-blue), transparent);
  opacity: calc(0.3 + var(--s1) * 0.7);
}
.arrow-text {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--glow-amber);
  white-space: nowrap;
  writing-mode: vertical-rl;
  rotate: 180deg;
  text-shadow: 0 0 calc(var(--s1) * 14px) rgba(240, 169, 74, 0.8);
}
.magic-demo-output {
  transform: translateZ(50px);
}
.magic-demo-output ul {
  position: relative;
  margin: 0;
  padding: 0.35rem 0.85rem;
  list-style: none;
  display: grid;
  border-radius: 0.9rem;
  background: #0d1624;
  border: 1px solid rgba(94, 200, 255, 0.25);
  box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.7), 0 0 40px rgba(94, 200, 255, calc(var(--s2) * 0.18));
  perspective: 600px;
}
.magic-demo-output li {
  --m2: clamp(0, calc(var(--s2) * 2 - var(--k) * 0.45 - 0.3), 1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 0.2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 600;
  font-size: 1.04rem;
  color: #e8eef6;
  transform-origin: 50% 0;
  transform: rotateX(calc((1 - var(--m2)) * -95deg));
  opacity: var(--m2);
}
.magic-demo-output li:last-child { border-bottom: none; }
.magic-demo-output ul::before {
  content: "";
  position: absolute;
  inset: 0.35rem 0.85rem;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.09) 0 48%, transparent 48% 78%, rgba(94, 200, 255, 0.14) 78% 100%) 0 16.6% / 100% 0.7rem no-repeat,
    linear-gradient(90deg, rgba(255, 255, 255, 0.09) 0 36%, transparent 36% 80%, rgba(94, 200, 255, 0.14) 80% 100%) 0 50% / 100% 0.7rem no-repeat,
    linear-gradient(90deg, rgba(255, 255, 255, 0.09) 0 42%, transparent 42% 78%, rgba(94, 200, 255, 0.14) 78% 100%) 0 83.4% / 100% 0.7rem no-repeat;
  border-radius: 0.3rem;
  opacity: calc(1 - var(--s2) * 2.5);
  animation: skeleton 1.6s ease-in-out infinite alternate;
}
@keyframes skeleton {
  from { filter: brightness(0.7); }
  to { filter: brightness(1.3); }
}
.magic-demo-output li strong {
  color: var(--glow-blue);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.price-flip {
  --flip: clamp(0, calc((var(--s3) - 0.3) / 0.7), 1);
  position: absolute;
  right: -1rem;
  bottom: -0.5rem;
  width: 14.5rem;
  perspective: 800px;
  transform: translate3d(0, calc((1 - min(var(--s3) * 3, 1)) * 40px), 110px);
  opacity: min(var(--s3) * 4, 1);
}
.price-card {
  position: relative;
  height: 8rem;
  transform-style: preserve-3d;
  transform: rotateY(calc(var(--flip) * 180deg));
}
.face {
  position: absolute;
  inset: 0;
  display: grid;
  align-content: center;
  gap: 0.2rem;
  padding: 0.8rem 0.95rem 0.8rem 1.6rem;
  border-radius: 0.9rem;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  box-shadow: 0 24px 50px -16px rgba(0, 0, 0, 0.7);
}
.face::before {
  content: "";
  position: absolute;
  left: 0.6rem;
  top: 50%;
  width: 0.5rem;
  height: 0.5rem;
  margin-top: -0.25rem;
  border-radius: 50%;
  background: var(--stage-bg);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.5);
}
.face.front {
  background: #fff8ec;
  color: #1a2332;
  border: 1px solid rgba(224, 138, 30, 0.4);
}
.face.back {
  transform: rotateY(180deg);
  background: linear-gradient(140deg, #ffd690, var(--glow-amber) 55%, #e07a1e);
  color: #2a1604;
}
.face b { font-size: 0.95rem; }
.pf-kicker {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--timber-accent);
}
.face.back .pf-kicker { color: #7a2e00; }
.pf-row {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
}
.pf-row em { font-style: normal; font-weight: 800; font-variant-numeric: tabular-nums; }
.pf-row s { opacity: 0.55; font-weight: 600; }
.pf-row.hl {
  margin-top: 0.15rem;
  padding: 0.2rem 0.4rem;
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.45);
}

.magic-outro { padding-top: 1rem; }
.magic-note {
  margin: 0;
  color: var(--stage-muted);
  font-size: 0.9rem;
  line-height: 1.55;
  text-align: center;
}
.magic-note strong {
  color: #fff;
  font-weight: 700;
}

@media (max-width: 899.98px) {
  .magic-track { height: 340vh; }
  .magic-step { padding-block: 0.45rem; }
  .magic-step p {
    max-height: 0;
    opacity: 0;
    overflow: hidden;
    transition: max-height 0.45s ease, opacity 0.45s ease;
  }
  .magic-track[data-at="0"] .st1 p,
  .magic-track[data-at="1"] .st1 p,
  .magic-track[data-at="2"] .st2 p,
  .magic-track[data-at="3"] .st3 p,
  .magic-track[data-at="4"] .st3 p {
    max-height: 4rem;
    opacity: 1;
  }
  .demo-rig {
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    padding-bottom: 8.4rem;
    transform: rotateX(calc(10deg - var(--p) * 6deg));
  }
  .magic-demo-arrow { display: none; }
  .note { padding: 0.8rem 0.75rem 0.9rem; }
  .note pre { font-size: 1.12rem; }
  .ln::before { transform: translate3d(calc(var(--m) * 9em), calc(var(--m) * -0.4em), 0) scale(calc(1 - var(--m) * 0.35)); }
  .magic-demo-output ul { padding: 0.25rem 0.6rem; }
  .magic-demo-output li { font-size: 0.78rem; padding-block: 0.5rem; gap: 0.4rem; }
  .price-flip { right: 50%; width: 12.5rem; margin-right: -6.25rem; bottom: 0; }
  .price-card { height: 7.2rem; }
}

/* ═══════════════════════════════════════════
   POR QUÉ NUBE — órbita 3D y nubes en capas
   ═══════════════════════════════════════════ */
.band.cloud { overflow: clip; }
.cloud-layers {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.cl {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--timber-primary) 14%, transparent), transparent);
}
.c1 { width: 40rem; height: 18rem; left: -10rem; top: 10%; transform: translate3d(calc(var(--p) * 120px), calc(var(--p) * -140px), 0); }
.c2 { width: 30rem; height: 14rem; right: -6rem; top: 40%; transform: translate3d(calc(var(--p) * -160px), calc(var(--p) * -260px), 0); }
.c3 { width: 50rem; height: 20rem; left: 30%; bottom: -6rem; transform: translate3d(0, calc(var(--p) * 90px), 0); }

.cloud-grid {
  display: grid;
  gap: 1rem;
  align-items: center;
  padding-bottom: 0;
}
@media (min-width: 860px) {
  .cloud-grid { grid-template-columns: 1.1fr 0.9fr; gap: 2rem; }
}

.cloud-shape {
  --cloud: var(--timber-primary);
  position: relative;
  display: grid;
  place-items: center;
  width: 3em;
  height: 1.35em;
  margin-top: 0.8em;
  border-radius: 1em;
  background: var(--cloud);
}
.cloud-shape::before,
.cloud-shape::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  background: var(--cloud);
}
.cloud-shape::before { width: 1.35em; height: 1.35em; left: 0.4em; top: -0.65em; }
.cloud-shape::after { width: 1.75em; height: 1.75em; left: 1.05em; top: -0.95em; }
.cloud-shape b {
  position: relative;
  z-index: 1;
  margin-top: -0.35em;
  font-size: 0.6em;
  color: #fff;
}

.orbit {
  position: relative;
  height: 20rem;
  display: grid;
  place-items: center;
  perspective: 900px;
}
.orbit-rig {
  --tilt: calc(66deg - var(--p) * 18deg);
  --spin: calc(var(--p) * 70deg);
  position: relative;
  width: 17rem;
  height: 17rem;
  transform-style: preserve-3d;
  transform: rotateX(var(--tilt)) rotateZ(var(--spin));
}
.ring {
  position: absolute;
  inset: var(--in);
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--timber-primary) 45%, transparent);
  transform-style: preserve-3d;
  animation: spin var(--dur) linear infinite;
}
.r1 { --in: 0rem; --dur: 18s; }
.r2 { --in: 2.6rem; --dur: 12s; border-style: dashed; }
.r3 { --in: 5rem; --dur: 8s; }
@keyframes spin {
  to { rotate: 360deg; }
}
@keyframes unspin {
  to { rotate: -360deg; }
}
.sat {
  position: absolute;
  left: 50%;
  top: 0;
  width: 2.7rem;
  height: 2.7rem;
  margin: -1.35rem 0 0 -1.35rem;
  transform-style: preserve-3d;
  animation: unspin var(--dur) linear infinite;
}
.sat i {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  font-style: normal;
  font-size: 1.25rem;
  background: var(--timber-panel);
  box-shadow: var(--timber-shadow), 0 0 0 1px var(--timber-line);
  transform: rotateZ(calc(-1 * var(--spin))) rotateX(calc(-1 * var(--tilt)));
}
.core {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transform-style: preserve-3d;
}
.core .cloud-shape {
  font-size: 2.1rem;
  filter: drop-shadow(0 12px 30px color-mix(in srgb, var(--timber-primary) 55%, transparent));
  transform: rotateZ(calc(-1 * var(--spin))) rotateX(calc(-1 * var(--tilt)));
  animation: corePulse 3s ease-in-out infinite;
}
@keyframes corePulse {
  50% { scale: 1.06; }
}

.pillars-wrap { padding-top: 1.5rem; }
.pillars {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.9rem;
  perspective: 1000px;
}
@media (min-width: 800px) {
  .pillars { grid-template-columns: repeat(3, 1fr); }
}
.pillars li {
  --e: clamp(0, calc(var(--p) * 1.8 - var(--k) * 0.22), 1);
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  border-radius: var(--timber-radius);
  padding: 1.25rem 1.2rem 1.35rem;
  box-shadow: var(--timber-shadow);
  translate: 0 calc((1 - var(--e)) * 80px) calc((1 - var(--e)) * -180px);
  rotate: x calc((1 - var(--e)) * 32deg);
  opacity: calc(var(--e) * 1.3);
}
.pillars li.is-tilting { box-shadow: 0 24px 50px -18px rgba(18, 32, 56, 0.35); }
.pillar-icon {
  display: grid;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  margin-bottom: 0.7rem;
  border-radius: 0.9rem;
  font-size: 1.35rem;
  background: var(--timber-primary-soft);
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.06);
}
.pillars h3 { margin: 0; font-size: 1.02rem; font-weight: 800; }
.pillars p { margin: 0.4rem 0 0; color: var(--timber-muted); font-size: 0.88rem; line-height: 1.45; }

/* ═══════════════════════════════════════════
   PRICING — tríptico que se abre
   ═══════════════════════════════════════════ */
.billing-toggle {
  margin-top: 1.25rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.65rem 0.75rem;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--timber-muted);
}
.billing-toggle > span.on { color: var(--timber-ink); }
.toggle-track {
  position: relative;
  flex: none;
  box-sizing: border-box;
  width: 3.1rem;
  height: 1.7rem;
  min-height: 0; /* anula el min-height táctil global: deformaba el interruptor en celular */
  padding: 0;
  border: 1px solid var(--timber-line);
  border-radius: 999px;
  background: var(--timber-panel);
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}
.toggle-track::before {
  content: "";
  position: absolute;
  inset: -0.55rem -0.4rem; /* área de toque de ~44 px sin cambiar el tamaño visible */
}
.toggle-track.annual {
  background: var(--timber-primary-soft);
  border-color: var(--timber-primary);
}
.toggle-thumb {
  position: absolute;
  top: 0.18rem;
  left: 0.18rem;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--timber-ink);
  transition: transform 0.3s var(--ease-out);
}
.toggle-track.annual .toggle-thumb {
  transform: translateX(1.35rem);
  background: var(--timber-primary);
}
.save-pill {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  font-style: normal;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  vertical-align: middle;
}
.price-note {
  margin: -0.1rem 0 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--timber-primary);
}

.plan-grid {
  margin-top: 1.4rem;
  display: grid;
  gap: 0.9rem;
  perspective: 1400px;
}
@media (min-width: 900px) {
  .plan-grid { grid-template-columns: repeat(3, 1fr); }
}
.plan {
  --e: clamp(0, calc(var(--p) * 1.5 - var(--k) * 0.12), 1);
  --u: calc(1 - var(--e));
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  height: 100%;
  padding: 1.25rem;
  border-radius: var(--timber-radius);
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
  box-shadow: var(--timber-shadow);
  translate: calc(var(--side) * var(--u) * -50px) calc(var(--u) * 70px) calc(var(--u) * -160px + var(--lift, 0px));
  rotate: y calc(var(--side) * var(--u) * -48deg);
  opacity: calc(0.15 + var(--e) * 1.2);
}
.plan.is-tilting { box-shadow: 0 30px 60px -22px rgba(18, 32, 56, 0.4); }
.plan.hot {
  --lift: 28px;
  border-color: transparent;
  box-shadow: 0 30px 60px -24px color-mix(in srgb, var(--timber-primary) 55%, transparent), var(--timber-shadow);
}
@property --ang {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}
.plan.hot::before {
  content: "";
  position: absolute;
  inset: -1.5px;
  padding: 1.5px;
  border-radius: inherit;
  pointer-events: none;
  background: conic-gradient(from var(--ang), var(--glow-amber), var(--timber-primary), var(--glow-blue), var(--glow-amber));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: angSpin 5s linear infinite;
}
@keyframes angSpin {
  to { --ang: 360deg; }
}
.badge {
  margin: 0;
  width: fit-content;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--timber-primary-soft);
  color: var(--timber-primary);
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
}
.plan h3 { margin: 0; font-size: 1.2rem; font-weight: 800; }
.tag { margin: 0; color: var(--timber-muted); font-size: 0.86rem; min-height: 2.4em; }
.price-box { transform-origin: 50% 50%; }
.price {
  margin: 0.15rem 0 0;
  font-size: 1.95rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: var(--timber-ink);
  font-variant-numeric: tabular-nums;
}
.price span { font-size: 0.8rem; font-weight: 600; color: var(--timber-muted); }
.flip-enter-active,
.flip-leave-active {
  transition: transform 0.26s var(--ease-out), opacity 0.26s ease;
}
.flip-enter-from {
  transform: perspective(500px) rotateX(-85deg);
  opacity: 0;
}
.flip-leave-to {
  transform: perspective(500px) rotateX(85deg);
  opacity: 0;
}
.im-line { margin: 0; font-size: 0.82rem; color: var(--timber-muted); font-weight: 600; }
.plan ul {
  margin: 0.25rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
  flex: 1 1 auto;
}
.plan li {
  position: relative;
  padding-left: 1rem;
  font-size: 0.84rem;
  color: var(--timber-muted);
  line-height: 1.35;
}
.plan li::before {
  content: "✓";
  position: absolute;
  left: 0;
  top: 0;
  font-weight: 800;
  font-size: 0.78rem;
  color: var(--timber-primary);
}
.plan .btn { width: 100%; margin-top: auto; align-self: end; }
@media (max-width: 899.98px) {
  .plan { --side: 0 !important; }
}

.plan-extra {
  margin-top: 1.4rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 0.7rem;
  background: var(--timber-panel);
  border: 1px solid var(--timber-line);
}
.plan-extra p {
  margin: 0;
  font-size: 0.88rem;
  color: var(--timber-muted);
  line-height: 1.4;
}
.promo-banner {
  display: inline-flex; align-items: center; gap: 0.7rem; margin: 1rem 0 0; padding: 0.6rem 0.9rem; max-width: 36rem;
  border-radius: 0.9rem; font-size: 0.92rem; line-height: 1.4;
  background: color-mix(in srgb, var(--timber-accent) 16%, var(--timber-panel));
  border: 1px solid color-mix(in srgb, var(--timber-accent) 45%, var(--timber-line));
}
.promo-banner em { display: block; font-style: normal; font-weight: 700; color: var(--timber-muted); font-size: 0.82rem; }
.promo-tag {
  flex: none; padding: 0.2rem 0.55rem; border-radius: 999px; font-size: 0.7rem; font-weight: 900; letter-spacing: 0.08em;
  text-transform: uppercase; color: #1a1208; background: var(--timber-accent);
}
.plan .price.promo { color: var(--timber-primary); }
.plan-extra strong { color: var(--timber-ink); font-weight: 700; }
.plan-extra a {
  color: var(--timber-primary);
  font-weight: 700;
  font-size: 0.88rem;
  text-decoration: none;
}
.plan-extra a:hover { text-decoration: underline; }
.perpetual-more {
  padding: 0;
  border: 0;
  background: none;
  color: var(--timber-primary);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.perpetual-more:hover { text-decoration: underline; }
.foot-wa { margin-top: 0.5rem; }
.lp-modal-bg {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.45);
}
.lp-modal {
  position: relative;
  width: min(36rem, 100%);
  max-height: 92dvh;
  overflow-y: auto;
  display: grid;
  gap: 0.75rem;
  padding: 1.5rem 1.4rem;
  border-radius: 1.25rem;
  background: var(--timber-panel, #fff);
  color: var(--timber-ink, #111);
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.25);
}
.lp-modal h3 { margin: 0; font-size: 1.5rem; }
.lp-modal h4 { margin: 0.4rem 0 0.3rem; font-size: 0.95rem; font-weight: 800; }
.lp-modal p { margin: 0; }
.lp-modal ul { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.25rem; font-size: 0.92rem; list-style: disc; }
.lp-modal li { display: list-item; }
.lp-modal-kicker { font-size: 0.78rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: var(--timber-muted); }
.lp-modal-small { font-size: 0.88rem; color: var(--timber-muted); }
.lp-modal-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
.lp-modal-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 0.8rem 1.2rem; margin-top: 0.4rem; }
.lp-modal-link { font-weight: 700; color: var(--timber-primary); }
.lp-modal-x {
  position: absolute;
  top: 0.6rem;
  right: 0.7rem;
  width: 2.2rem;
  height: 2.2rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: 1.5rem;
  cursor: pointer;
}
@media (max-width: 560px) {
  .lp-modal-cols { grid-template-columns: minmax(0, 1fr); }
}

.video-wrap {
  display: grid;
  gap: 2.2rem;
  align-items: center;
  justify-items: center;
  text-align: center;
}
.promo-copy { max-width: 32rem; }
.promo-points { list-style: none; margin: 1.3rem 0 0; padding: 0; display: grid; gap: 0.55rem; justify-items: center; font-weight: 700; }
.promo-points span { color: var(--timber-accent); margin-right: 0.45rem; }
.promo-stage { position: relative; width: min(19rem, 78vw); }
.promo-glow {
  position: absolute;
  inset: 8% -22%;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--timber-primary), transparent 70%);
  opacity: 0.38;
  filter: blur(34px);
}
.promo-video {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 9 / 16;
  object-fit: cover;
  border: 0.55rem solid #0b0f1f;
  border-radius: 2.2rem;
  background: #0a1330;
  box-shadow: 0 40px 70px -30px rgba(0, 0, 0, 0.75);
}
@media (min-width: 860px) {
  .video-wrap { grid-template-columns: minmax(0, 1fr) auto; gap: 4rem; text-align: left; justify-items: start; }
  .promo-points { justify-items: start; }
  .promo-stage { justify-self: center; width: 21rem; }
}
.testi-grid {
  display: grid;
  gap: 1rem;
  margin-top: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}
.testi { margin: 0; }
.testi img { border-radius: 50%; object-fit: cover; }
.testi blockquote { margin: 0.6rem 0; line-height: 1.5; }
.testi figcaption { color: var(--timber-muted); font-size: 0.9rem; }

/* ═══════════════════════════════════════════
   HARDWARE — carrusel 3D que gira con el scroll
   ═══════════════════════════════════════════ */
.hw-layout {
  display: grid;
  gap: 1.5rem;
  align-items: center;
}
@media (min-width: 860px) {
  .hw-layout { grid-template-columns: 1fr 1.05fr; gap: 2rem; }
}
.hw-stage {
  position: relative;
  height: 22rem;
  display: grid;
  place-items: center;
  perspective: 1100px;
  perspective-origin: 50% 25%;
}
.hw-ring {
  --r: 8.6rem;
  position: relative;
  width: 14rem;
  height: 15rem;
  transform-style: preserve-3d;
  transform: translateZ(calc(var(--r) * -1)) rotateX(-8deg) rotateY(calc(var(--p) * -320deg + 60deg));
}
.hw-card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 1.25rem;
  text-align: center;
  border-radius: 1.1rem;
  background: linear-gradient(165deg, var(--timber-panel), var(--timber-panel-elevated));
  border: 1px solid var(--timber-line);
  box-shadow: 0 30px 60px -25px rgba(18, 32, 56, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  transform: rotateY(calc(var(--i) * 90deg)) translateZ(var(--r));
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}
.hw-icon {
  display: grid;
  place-items: center;
  width: 4.4rem;
  height: 4.4rem;
  margin-bottom: 0.8rem;
  border-radius: 1.2rem;
  font-size: 2.2rem;
  background: var(--timber-primary-soft);
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.06);
}
.hw-card h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}
.hw-card p {
  margin: 0.35rem 0 0;
  font-size: 0.84rem;
  color: var(--timber-muted);
  line-height: 1.4;
}
.hw-floor {
  position: absolute;
  bottom: 0.25rem;
  left: 50%;
  width: 20rem;
  height: 3.5rem;
  margin-left: -10rem;
  border-radius: 50%;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--timber-primary) 28%, transparent), transparent);
}

/* ═══════════════════════════════════════════
   FINAL CTA — túnel y moneda 3D
   ═══════════════════════════════════════════ */
.final-cta {
  position: relative;
  z-index: 1;
  overflow: hidden;
  text-align: center;
  color: var(--stage-ink);
  background:
    radial-gradient(60rem 30rem at 50% 110%, color-mix(in srgb, var(--timber-primary) 50%, transparent), transparent 70%),
    var(--stage-bg);
}
.tunnel {
  position: absolute;
  inset: 0;
  perspective: 500px;
  pointer-events: none;
}
.tunnel span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 34rem;
  height: 22rem;
  margin: -11rem 0 0 -17rem;
  border-radius: 3rem;
  border: 2px solid rgba(94, 200, 255, 0.26);
  opacity: 0;
  animation: tunnel 8s linear infinite;
  animation-delay: calc(var(--n) * -1s);
}
.tunnel span:nth-child(even) { border-color: rgba(240, 169, 74, 0.24); }
.tunnel::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 46rem;
  height: 26rem;
  margin: -13rem 0 0 -23rem;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--stage-bg) 30%, transparent);
}
@keyframes tunnel {
  0% { transform: translateZ(-900px); opacity: 0; }
  20% { opacity: 0.8; }
  80% { opacity: 0.5; }
  100% { transform: translateZ(380px); opacity: 0; }
}
.final-inner {
  padding-top: 5rem;
  padding-bottom: 5rem;
  transform: perspective(900px) translateZ(calc((1 - var(--p)) * -420px)) rotateX(calc((1 - var(--p)) * 16deg));
  opacity: calc(0.1 + var(--p) * 1.1);
}
.coin-wrap {
  perspective: 600px;
  margin-bottom: 1.4rem;
}
.coin3d {
  position: relative;
  width: 4.5rem;
  height: 4.5rem;
  margin: 0 auto;
  transform-style: preserve-3d;
  animation: coinSpin 6s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes coinSpin {
  0% { transform: rotateY(0deg); }
  45%, 100% { transform: rotateY(360deg); }
}
.coin3d img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 1.1rem;
}
.coin-front {
  transform: translateZ(4px);
  box-shadow: 0 0 40px rgba(94, 154, 232, 0.5);
}
.coin-back { transform: translateZ(-5px) rotateY(180deg); }
.coin-layer {
  position: absolute;
  inset: 0;
  border-radius: 1.1rem;
  background: #133e78;
  transform: translateZ(calc(4px - var(--n) * 1.3px));
}
.final-cta h2 {
  margin-inline: auto;
  max-width: 34rem;
  font-size: clamp(1.8rem, 4.2vw, 3rem);
  color: #fff;
}
.final-cta p {
  margin: 0.8rem auto 0;
  max-width: 32rem;
  color: var(--stage-muted);
  font-size: 1rem;
  line-height: 1.55;
}
.final-cta-actions {
  margin-top: 1.6rem;
  display: flex;
  justify-content: center;
  gap: 0.5rem;
}

/* Celulares y tablets: el túnel 3D (elementos de 34rem con translateZ animado) y la entrada
   con perspectiva ligada al scroll parpadeaban al moverse la barra del navegador. Se dejan estáticos. */
@media (max-width: 899.98px), (hover: none) {
  .tunnel span { display: none; }
  .tunnel::after { display: none; }
  .final-inner {
    transform: none;
    opacity: 1;
  }
  .coin3d { will-change: transform; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
}

/* ═══════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════ */
.foot {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 1.15rem 2.25rem;
  border-top: 1px solid var(--timber-line);
  background: var(--timber-panel);
  font-size: 0.86rem;
  color: var(--timber-muted);
}
.foot-brand p {
  margin: 0.2rem 0 0;
  font-size: 0.78rem;
  color: var(--timber-muted);
  max-width: 20rem;
}
.foot-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
}
.foot-giros { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.9rem; width: 100%; font-size: 0.86rem; }
.foot-giros strong { width: 100%; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--timber-muted); }
.foot a { color: var(--timber-primary); font-weight: 700; text-decoration: none; }
.foot a:hover { text-decoration: underline; }
.foot-brand :deep(.word) { font-size: 1.05rem; }

/* ═══════════════════════════════════════════
   RESPONSIVE (hero)
   ═══════════════════════════════════════════ */
@media (max-width: 959.98px) {
  .hero-copy { text-align: left; }
  .rig { --rx0: 10deg; --ry0: -12deg; }
}
@media (max-width: 600px) {
  .hero { padding-bottom: 6.5rem; }
  .hero-stage { padding: 1rem 0 2rem; }
  .fl { --zk: 0.45; }
  .fl-scan,
  .fl-magic { display: none; }
  .fl-ticket { right: -2%; top: 34%; }
  .fl-ticket .ticket { width: 7.6rem; font-size: 0.52rem; }
  .fl-coin { right: 6%; top: -4%; }
  .fl-coin .coin { width: 2.8rem; height: 2.8rem; font-size: 0.7rem; }
  .fl-sync { left: 6%; bottom: -7%; }
  .chip { font-size: 0.66rem; padding: 0.45rem 0.65rem; }
  .shot { font-size: 0.6rem; }
  .shot-total strong { font-size: 1.1rem; }
  .scroll-cue { display: none; }
  .stars i:nth-child(n + 9) { display: none; }
}

/* ═══════════════════════════════════════════
   PANTALLAS BAJAS: sin escenas fijas, se muestra el estado final
   ═══════════════════════════════════════════ */
@media (max-height: 620px) {
  .pin-track {
    height: auto !important;
    --p: 1 !important;
    --s0: 1 !important;
    --s1: 1 !important;
    --s2: 1 !important;
    --s3: 1 !important;
  }
  .devices-track { --s2: 0 !important; }
  .pin-stage {
    position: relative;
    height: auto;
    padding-block: 3rem;
  }
  .magic-step { opacity: 1; }
  .magic-step p { max-height: none; opacity: 1; }
}

/* ═══════════════════════════════════════════
   REDUCED MOTION: todo estático y legible
   ═══════════════════════════════════════════ */
.landing[data-motion="reduce"] [data-scene] {
  --p: 1 !important;
  --s0: 1 !important;
  --s1: 1 !important;
  --s2: 1 !important;
  --s3: 1 !important;
}
.landing[data-motion="reduce"] .hero { --p: 0 !important; }
.landing[data-motion="reduce"] .devices-track { --s2: 0 !important; }
.landing[data-motion="reduce"] .pin-track { height: auto !important; }
.landing[data-motion="reduce"] .pin-stage {
  position: relative;
  height: auto;
  padding-block: 3.5rem;
}
.landing[data-motion="reduce"] .magic-step { opacity: 1; }
.landing[data-motion="reduce"] .magic-step p { max-height: none; opacity: 1; }
.landing[data-motion="reduce"] .hw-stage { height: auto; perspective: none; }
.landing[data-motion="reduce"] .hw-ring {
  width: 100%;
  height: auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  transform: none;
}
.landing[data-motion="reduce"] .hw-card {
  position: relative;
  inset: auto;
  transform: none;
}
.landing[data-motion="reduce"] .hw-floor { display: none; }
.landing[data-motion="reduce"] *,
.landing[data-motion="reduce"] *::before,
.landing[data-motion="reduce"] *::after {
  animation-duration: 0.001ms !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.001ms !important;
}
</style>

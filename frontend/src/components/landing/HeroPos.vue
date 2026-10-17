<template>
  <div class="pos" role="img" aria-label="Pantalla de venta de Mi Tiendita en modo oscuro: catálogo de abarrotes con precios, ticket con siete artículos y el botón Cobrar con un total de $209.50">
    <div class="pos-top">
      <div class="shop">
        <img src="/logo.svg" alt="" width="34" height="34" />
        <span class="shop-name">
          <small>mitiendita</small>
          <strong>Abarrotes Doña Lupe</strong>
        </span>
      </div>
      <span class="grow"></span>
      <span class="tab on">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l-1 12H7zM9 8V6a3 3 0 0 1 6 0v2" /></svg>Vender
      </span>
      <span class="tab">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>Productos
      </span>
      <span class="tab">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h18v10H3z" /><circle cx="12" cy="12" r="2.5" /></svg>Caja
      </span>
      <span class="grow"></span>
      <span class="offline"><i></i>Sin internet · 3 ventas por subir</span>
      <span class="clock">10:24 a.m.</span>
      <span class="sq">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
      </span>
      <span class="more">Más</span>
    </div>

    <div class="pos-body">
      <!-- Catálogo -->
      <div class="cat">
        <div class="search-row">
          <div class="search">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8a94a8" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            <span>Escanea o busca por nombre o código</span>
          </div>
          <span class="tool">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="7.5" r="1.2" /></svg>Precio
          </span>
          <span class="tool">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" /></svg>Varios
          </span>
        </div>
        <div class="ready"><i></i>Escáner listo · escribe para buscar o escanea el código</div>
        <div class="chips">
          <span v-for="c in cats" :key="c.name" class="chip" :class="{ on: !c.dot }">
            <i v-if="c.dot" :style="{ background: c.dot }"></i>{{ c.name }}
          </span>
        </div>
        <div class="grid">
          <div v-for="p in products" :key="p.name" class="prod" :class="{ in: p.inCart }">
            <div class="thumb" :style="{ background: p.tint, color: p.ink }">
              <svg width="46" height="46" viewBox="0 0 48 48"><path :d="p.d" fill="currentColor" /><path :d="p.d2" fill="#fff" fill-opacity=".35" /></svg>
            </div>
            <div class="pname">{{ p.name }}</div>
            <div class="pprice">{{ p.price }}</div>
            <span v-if="p.inCart" class="badge">{{ p.inCart }}</span>
          </div>
        </div>
        <div class="keys">
          <span v-for="s in shortcuts" :key="s.k"><kbd>{{ s.k }}</kbd>{{ s.t }}</span>
        </div>
      </div>

      <!-- Venta actual -->
      <div class="sale">
        <div class="sale-head">
          <span class="sale-title">
            <strong>Venta actual</strong>
            <small>Ticket #004813 · 7 artículos</small>
          </span>
          <span class="hold">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>En espera
          </span>
          <span class="trash">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
          </span>
        </div>
        <div class="lines">
          <div v-for="it in items" :key="it.name" class="line">
            <span class="lthumb" :style="{ background: it.tint, color: it.ink }">
              <svg width="24" height="24" viewBox="0 0 48 48"><path :d="it.d" fill="currentColor" /></svg>
            </span>
            <span class="lname">
              <b>{{ it.name }}</b>
              <small>{{ it.meta }}</small>
            </span>
            <span class="lprice">{{ it.price }}</span>
          </div>
        </div>
        <div class="totals">
          <div class="trow"><span>Subtotal</span><span>$209.50</span></div>
          <div class="trow dashed"><span>IVA incluido</span><span>$8.07</span></div>
          <div class="grand"><span>TOTAL</span><strong>$209.50</strong></div>
          <div class="acts">
            <span v-for="a in actions" :key="a.t">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path :d="a.d" /></svg>{{ a.t }}
            </span>
          </div>
          <div class="pay"><span>COBRAR</span><span class="pay-r">$209.50<kbd>F12</kbd></span></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// Artículos con su ícono (trazos propios, sin fotos de stock) y una mezcla de giros: abarrotes, farmacia, báscula
const S = {
  egg: ["M10 27a7 9 0 1 0 14 0a7 9 0 1 0 -14 0zM24 27a7 9 0 1 0 14 0a7 9 0 1 0 -14 0z", "M6 31h36l-3 9H9z"],
  tortilla: ["M8 31a16 6 0 1 0 32 0a16 6 0 1 0 -32 0z", "M8 25a16 6 0 1 0 32 0a16 6 0 1 0 -32 0z"],
  bottle: ["M21 4h6v5l3 5v28a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2V14l3 -5z", "M18 22h12v9H18z"],
  pills: ["M9 15h30v22H9z", "M9 15h30v7H9z"],
  bread: ["M8 22a8 8 0 0 1 8 -8h16a8 8 0 0 1 8 8a4 4 0 0 1 -3 3.9V38H11V25.9A4 4 0 0 1 8 22z", "M15 28h18v3H15z"],
  milk: ["M16 12h16v6l3 5v19H13V23l3 -5z", "M13 27h22v8H13z"],
  bag: ["M14 9h20l2 6 -2 4 2 21a2 2 0 0 1 -2 2H14a2 2 0 0 1 -2 -2l2 -21 -2 -4z", "M16 24h16v10H16z"],
  soap: ["M8 22a6 6 0 0 1 6 -6h20a6 6 0 0 1 6 6v6a6 6 0 0 1 -6 6H14a6 6 0 0 1 -6 -6z", "M16 23h16v4H16z"],
};
const T = {
  egg: ["#F5A5241F", "#F5C26B"],
  tortilla: ["#E9C46A1F", "#E9C46A"],
  bottle: ["#FF6B6B1F", "#FF8A8A"],
  pills: ["#7C9CFF1F", "#9DB4FF"],
  bread: ["#D4A3731F", "#D9AE82"],
  milk: ["#FFFFFF14", "#DDE3EC"],
  bag: ["#A0785A26", "#C49A7A"],
  soap: ["#5EC8F21F", "#7DD3F5"],
};
const inCart = { egg: "1", tortilla: "1.25", bottle: "2", pills: "1", bread: "1", soap: "1" };

const products = [
  ["egg", "Huevo blanco 18 pzs", "$72.00"],
  ["tortilla", "Tortilla de maíz (kg)", "$24.00"],
  ["bottle", "Refresco cola 600 ml", "$18.00"],
  ["pills", "Paracetamol 500 mg", "$22.00"],
  ["bread", "Pan de caja grande", "$27.00"],
  ["milk", "Leche entera 1 L", "$28.50"],
  ["bag", "Frijol negro 1 kg", "$38.00"],
  ["soap", "Jabón de barra", "$22.50"],
].map(([k, name, price]) => ({ d: S[k][0], d2: S[k][1], tint: T[k][0], ink: T[k][1], name, price, inCart: inCart[k] || "" }));

const items = [
  ["egg", "Huevo blanco 18 pzs", "1 × $72.00", "$72.00"],
  ["tortilla", "Tortilla de maíz", "1.250 kg × $24.00 · báscula", "$30.00"],
  ["bottle", "Refresco cola 600 ml", "2 × $18.00", "$36.00"],
  ["pills", "Paracetamol 500 mg", "Lote 24B · caduca 03/2028", "$22.00"],
  ["bread", "Pan de caja grande", "1 × $27.00", "$27.00"],
  ["soap", "Jabón de barra", "1 × $22.50", "$22.50"],
].map(([k, name, meta, price]) => ({ d: S[k][0], tint: T[k][0], ink: T[k][1], name, meta, price }));

const cats = [
  { name: "Todo", dot: "" },
  { name: "Abarrotes", dot: "#3DD68C" },
  { name: "Bebidas", dot: "#5B8CFF" },
  { name: "Farmacia", dot: "#B794F6" },
  { name: "Limpieza", dot: "#F5A524" },
];
const shortcuts = [
  { k: "3*", t: "cantidad al escanear" },
  { k: "+ −", t: "pieza" },
  { k: "F2", t: "quitar" },
  { k: "F3", t: "cantidad" },
  { k: "F4", t: "precio" },
  { k: "F6", t: "espera" },
  { k: "F9", t: "descuento" },
  { k: "Ins", t: "varios" },
  { k: "F12", t: "cobrar" },
];
const actions = [
  { t: "Cantidad", d: "M5 9h14M5 15h14M10 4L8 20M16 4l-2 16" },
  { t: "Descuento", d: "M19 5L5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" },
  { t: "En espera", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 9v6M14 9v6" },
];
</script>

<style scoped>
.pos {
  --acc: var(--hero-accent, #2d6be4);
  display: flex;
  flex-direction: column;
  height: 660px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: #0b1120;
  color: #eef2f8;
  font-family: "Geist", system-ui, sans-serif;
  font-size: 13px;
  text-align: left;
  user-select: none;
}
.grow { flex: 1; }
kbd {
  font-family: "Geist Mono", ui-monospace, monospace;
  font-size: 10.5px;
  padding: 2px 6px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #c9d1de;
  background: rgba(255, 255, 255, 0.04);
}

/* barra superior */
.pos-top {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: none;
  height: 56px;
  padding: 0 14px;
  background: #111a2e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.shop { display: flex; align-items: center; gap: 10px; width: 260px; }
.shop img { border-radius: 8px; }
.shop-name { display: flex; flex-direction: column; line-height: 1.2; }
.shop-name small { font-size: 12px; font-weight: 600; letter-spacing: -0.02em; color: #a3adc0; }
.shop-name strong { font-size: 14px; font-weight: 600; }
.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  color: #8a94a8;
  font-size: 14px;
}
.tab.on {
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.07);
  color: #eef2f8;
  font-weight: 600;
  box-shadow: inset 0 -2px 0 var(--acc);
}
.offline {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(245, 165, 36, 0.1);
  color: #f5b54a;
  font-size: 12px;
  font-weight: 500;
}
.offline i { width: 6px; height: 6px; border-radius: 50%; background: #f5a524; }
.clock { color: #c9d1de; font-size: 14px; font-family: "Geist Mono", ui-monospace, monospace; }
.sq {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #c9d1de;
}
.more { padding: 8px 12px; border-radius: 8px; background: rgba(255, 255, 255, 0.06); color: #c9d1de; }

.pos-body { flex: 1; display: flex; gap: 12px; min-height: 0; padding: 12px; }

/* catálogo */
.cat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.search-row { display: flex; gap: 8px; padding: 14px 14px 0; }
.search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--acc) 67%, transparent);
  background: rgba(255, 255, 255, 0.02);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--acc) 15%, transparent);
  color: #6f7a8f;
  font-size: 15px;
}
.tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 70px;
  height: 46px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #c9d1de;
  font-size: 11px;
  font-weight: 500;
}
.ready {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: #8a94a8;
  font-size: 12px;
}
.ready i { width: 7px; height: 7px; border-radius: 50%; background: #3dd68c; }
.chips { display: flex; gap: 8px; padding: 12px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
.chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #c9d1de;
  font-weight: 500;
}
.chip i { width: 7px; height: 7px; border-radius: 50%; }
.chip.on { background: #fff; border-color: #fff; color: #0b1120; }
.grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-content: start;
  padding: 14px;
}
.prod {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(255, 255, 255, 0.02);
}
.prod.in { border-color: color-mix(in srgb, var(--acc) 50%, transparent); }
.thumb { display: flex; align-items: center; justify-content: center; height: 74px; border-radius: 8px; }
.pname { min-height: 34px; font-weight: 500; line-height: 1.3; color: #e3e8f0; }
.pprice { font-size: 15px; font-weight: 600; }
.badge {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--acc);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
}
.keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  padding: 10px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  color: #8a94a8;
  font-size: 11.5px;
}
.keys span { display: flex; align-items: center; gap: 6px; }

/* venta actual */
.sale {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 360px;
  border-radius: 12px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.sale-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}
.sale-title { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.sale-title strong { font-size: 16px; font-weight: 600; }
.sale-title small { color: #8a94a8; font-size: 12px; }
.hold {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 11px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 500;
}
.trash {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #8a94a8;
}
.lines { flex: 1; min-height: 0; padding: 4px 16px; }
.line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}
.lthumb {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 7px;
}
.lname { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.lname b { font-weight: 500; color: #e3e8f0; }
.lname small { color: #8a94a8; font-size: 12px; }
.lprice { font-weight: 600; }
.totals {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0 0 12px 12px;
  background: #0c1324;
}
.trow { display: flex; justify-content: space-between; color: #a3adc0; }
.trow.dashed { padding-bottom: 8px; border-bottom: 1px dashed rgba(255, 255, 255, 0.1); }
.grand { display: flex; justify-content: space-between; align-items: baseline; padding: 4px 0 6px; }
.grand span { color: #a3adc0; font-size: 12px; font-weight: 600; letter-spacing: 0.1em; }
.grand strong { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; }
.acts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.acts span {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 8px 0;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  color: #a3adc0;
  font-size: 12px;
}
.pay {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
  padding: 15px 16px;
  border-radius: 12px;
  background: var(--acc);
  color: #fff;
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.04em;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 10px 30px -10px var(--acc);
}
.pay-r { display: flex; align-items: center; gap: 10px; letter-spacing: 0; }
.pay-r kbd { color: rgba(255, 255, 255, 0.88); border-color: rgba(255, 255, 255, 0.25); background: rgba(255, 255, 255, 0.1); }
</style>

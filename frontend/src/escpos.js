// Ticket en comandos ESC/POS para impresoras térmicas (58 / 80 mm).
// Sin imports: la prueba del backend lo carga como módulo (backend/test/escpos.test.js).

const ESC = 0x1b;
const GS = 0x1d;

// Página de códigos PC850 (ESC t 2): la que traen casi todas las térmicas genéricas y tiene acentos y ñ
const PC850 = {
  "á": 0xa0, "é": 0x82, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5, "ü": 0x81, "Ü": 0x9a,
  "Á": 0xb5, "É": 0x90, "Í": 0xd6, "Ó": 0xe0, "Ú": 0xe9, "¿": 0xa8, "¡": 0xad, "°": 0xf8, "º": 0xa7, "ª": 0xa6,
};
const LOOKALIKE = {
  "×": "x", "−": "-", "–": "-", "—": "-", "·": "-", "•": "-", "★": "*", "“": '"', "”": '"', "‘": "'", "’": "'",
  "«": '"', "»": '"', "…": "...", " ": " ", "\t": " ",
};

/** Texto a bytes PC850; lo que no existe se cambia por su parecido o se le quita el acento. */
export function encodeText(text) {
  const out = [];
  for (const ch of String(text ?? "")) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code < 0x7f) out.push(code);
    else if (ch === "\n") out.push(0x0a);
    else if (PC850[ch] != null) out.push(PC850[ch]);
    else if (LOOKALIKE[ch] != null) for (const c of LOOKALIKE[ch]) out.push(c.charCodeAt(0));
    else {
      const plain = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const c = plain.charCodeAt(0);
      out.push(plain && c >= 0x20 && c < 0x7f ? c : 0x3f);
    }
  }
  return out;
}

/** Largo visible (los caracteres que se imprimen) de un texto. */
function visibleLength(text) {
  return encodeText(text).length;
}

/** Corta un texto en renglones de `cols` caracteres sin partir palabras si se puede. */
export function wrap(text, cols) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (let word of words) {
    while (visibleLength(word) > cols) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      lines.push(word.slice(0, cols));
      word = word.slice(cols);
    }
    if (!cur) cur = word;
    else if (visibleLength(cur) + 1 + visibleLength(word) <= cols) cur += ` ${word}`;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/** Texto a la izquierda y a la derecha en el mismo renglón (con relleno). */
export function leftRight(left, right, cols, fill = " ") {
  const r = String(right ?? "");
  const room = Math.max(1, cols - visibleLength(r) - 1);
  const l = wrap(left, room);
  const last = l.pop();
  const gap = Math.max(1, cols - visibleLength(last) - visibleLength(r));
  return [...l, `${last}${fill.repeat(gap)}${r}`];
}

export class EscPos {
  constructor({ cols = 48 } = {}) {
    this.cols = cols;
    this.bytes = [];
  }
  raw(...b) {
    this.bytes.push(...b.flat());
    return this;
  }
  init() {
    return this.raw(ESC, 0x40, ESC, 0x74, 0x02);
  }
  align(where = "left") {
    return this.raw(ESC, 0x61, where === "center" ? 1 : where === "right" ? 2 : 0);
  }
  bold(on = true) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** Tamaño 1 o 2 (alto y ancho). */
  size(n = 1) {
    return this.raw(GS, 0x21, n === 2 ? 0x11 : 0x00);
  }
  text(t = "") {
    return this.raw(encodeText(t));
  }
  line(t = "") {
    return this.text(t).raw(0x0a);
  }
  lines(list) {
    for (const l of list) this.line(l);
    return this;
  }
  /** Renglón ajustado al ancho, con o sin tamaño doble (que usa la mitad de columnas). */
  wrapped(t, { cols = this.cols } = {}) {
    return this.lines(wrap(t, cols));
  }
  lr(left, right, fill = " ") {
    return this.lines(leftRight(left, right, this.cols, fill));
  }
  rule(ch = "-") {
    return this.line(ch.repeat(this.cols).slice(0, this.cols));
  }
  feed(n = 1) {
    return this.raw(ESC, 0x64, n);
  }
  /** QR modelo 2 (GS ( k). */
  qr(data, { size = 6 } = {}) {
    const bytes = encodeText(data);
    const len = bytes.length + 3;
    return this.raw(
      GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31,
      GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30, bytes,
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30
    );
  }
  /** Pulso para abrir el cajón de dinero (conector 2). */
  drawer() {
    return this.raw(ESC, 0x70, 0x00, 0x19, 0xfa);
  }
  /** Avanza y corta (corte parcial). */
  cut() {
    return this.raw(GS, 0x56, 0x42, 0x03);
  }
  build() {
    return Uint8Array.from(this.bytes);
  }
}

const moneyFmt = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function money(n) {
  return `$${moneyFmt.format(Number(n || 0))}`;
}

/**
 * Arma el ticket de venta. `t` ya trae todo calculado (ver thermalPrinter.js → receiptData):
 * { shop, kind, address, phone, folio, dateText, cashier, countText, prepNumber, customerName, items: [{ name, notes, qtyText, unit, amount }],
 *   subtotal, discountPercentText, discountAmount, cardExtraTax, deliveryFee, total, taxNote,
 *   paid, methodText, methodDetail: [], change, saved, stamp, offlinePending, thanks, note, invoiceUrl }
 */
export function buildReceipt(t, { cols = 48, openDrawer = false } = {}) {
  const p = new EscPos({ cols });
  const half = Math.floor(cols / 2);
  p.init();
  if (openDrawer) p.drawer();

  p.align("center").bold().size(2).wrapped(String(t.shop || "Mi Tiendita").toUpperCase(), { cols: half });
  p.size(1).bold(false);
  if (t.kind) p.line(t.kind);
  if (t.address) p.wrapped(t.address);
  if (t.phone) p.line(`Tel. ${t.phone}`);
  p.align("left").rule("=");
  p.lr(`Ticket No. ${t.folio || ""}`, t.dateText || "");
  p.lr(`Atendió: ${t.cashier || "-"}`, t.countText || "");
  p.rule();
  if (t.prepNumber || t.customerName) {
    p.align("center").bold().size(2);
    if (t.prepNumber) p.line(`PEDIDO #${t.prepNumber}`);
    if (t.customerName) p.wrapped(String(t.customerName).toUpperCase(), { cols: half });
    p.size(1).bold(false).align("left").rule();
  }

  for (const item of t.items || []) {
    p.bold().wrapped(item.name).bold(false);
    if (item.notes) p.wrapped(`  ${item.notes}`);
    p.lr(`  ${item.qtyText} x ${money(item.unit)}${item.per || ""}`, money(item.amount));
  }
  p.rule();

  p.lr("Subtotal", money(t.subtotal));
  if (Number(t.discountAmount)) p.lr(`Descuento ${t.discountPercentText || ""}`.trim(), `-${money(t.discountAmount)}`);
  if (Number(t.cardExtraTax)) p.lr("Comisión pago con tarjeta", `+${money(t.cardExtraTax)}`);
  if (Number(t.deliveryFee)) p.lr("Envío", `+${money(t.deliveryFee)}`);
  p.bold().size(2);
  p.lines(leftRight("TOTAL", money(t.total), half));
  p.size(1).bold(false);
  if (t.taxNote) p.align("right").wrapped(t.taxNote).align("left");

  if (t.paid) {
    p.rule();
    p.lr("Pagó con", t.methodText || "-");
    for (const d of t.methodDetail || []) p.lr(`  ${d[0]}`, d[1]);
    if (t.change != null) p.bold().lr("Su cambio", money(t.change)).bold(false);
  }
  if (t.saved) p.align("center").line(`* Hoy ahorraste ${money(t.saved)} *`).align("left");

  p.feed(1).align("center").bold().line(`[ ${t.stamp || ""} ]`).bold(false);
  if (t.offlinePending) p.wrapped("Venta guardada sin internet. Se sube sola al volver la conexión.");
  if (t.thanks) p.feed(1).wrapped(t.thanks);
  if (t.note) p.wrapped(t.note);

  if (t.invoiceUrl) {
    p.rule("- ");
    p.bold().line("Factura tú mismo").bold(false);
    p.line("Escanea, captura tu RFC y te llega por correo");
    p.qr(t.invoiceUrl, { size: cols >= 48 ? 6 : 5 }).raw(0x0a);
    p.line(`Válido el mes de la compra - Folio ${t.folio || ""}`);
  } else if (t.paid && !t.offlinePending) {
    p.line("Si requiere factura, solicítela en caja.");
  }
  p.feed(1).line("Hecho con Mi Tiendita").align("left").feed(3).cut();
  return p.build();
}

/**
 * Corte de caja. `t` trae todo calculado (lo arma PrintCashCloseView → corteData()):
 * { shop, kind, address, phone, closed, folio, dateText, openedClock, openedBy, closedClock, closedBy,
 *   deliveredBy, duration, salesCount, articles, average, methods: [{ label, amount }], totalSold,
 *   taxCollected, cardExtraTotal, voidedCount, voidedTotal, opening, cashSales, cashRefunds,
 *   expectedCash, countedCash, verdictWord, verdictSub, notes,
 *   tickets: [{ clock, folio, kind, amount, void }], printedText }
 */
export function buildCashClose(t, { cols = 48 } = {}) {
  const p = new EscPos({ cols });
  const half = Math.floor(cols / 2);
  const section = (title) => {
    p.feed(1).bold().line(String(title).toUpperCase()).bold(false).rule();
  };

  p.init();

  // Encabezado
  p.align("center").bold().size(2).wrapped(String(t.shop || "Mi Tiendita").toUpperCase(), { cols: half });
  p.size(1).bold(false);
  if (t.kind) p.line(t.kind);
  if (t.address) p.wrapped(t.address);
  if (t.phone) p.line(`Tel. ${t.phone}`);
  p.align("left").rule("=");

  p.align("center").bold().size(2).wrapped("CORTE DE CAJA", { cols: half });
  p.size(1).line(t.closed ? "Z - FINAL" : "X - PARCIAL").bold(false);
  p.align("left").rule("=");

  p.lr("Turno No.", t.folio || "");
  p.lr("Fecha", t.dateText || "");
  p.lr("Abrió", `${t.openedClock} ${t.openedBy}`);
  p.lr(t.closed ? "Cerró" : "Corte", `${t.closedClock} ${t.closed ? t.closedBy : "Caja abierta"}`);
  if (t.duration) p.lr("Duración", t.duration);

  // Resumen
  section("Resumen");
  p.lr("Ventas", String(t.salesCount));
  p.lr("Artículos", String(t.articles));
  p.lr("Promedio por venta", money(t.average));

  // Formas de pago
  section("Ventas por forma de pago");
  for (const m of t.methods || []) p.lr(m.label, money(m.amount));
  p.rule();
  p.bold().size(2);
  p.lines(leftRight("VENDIDO", money(t.totalSold), half));
  p.size(1).bold(false);
  p.lr("IVA incluido", money(t.taxCollected));
  if (Number(t.cardExtraTotal)) p.lr("Comisiones por tarjeta", money(t.cardExtraTotal));
  if (t.voidedCount) p.lr(`Devueltas o canceladas (${t.voidedCount})`, money(t.voidedTotal));

  // Cuadre del cajón
  section("Cuadre del cajón");
  p.lr("  Fondo inicial", money(t.opening));
  p.lr("+ Ventas en efectivo", money(t.cashSales));
  if (Number(t.cashRefunds)) p.lr("- Devoluciones en efectivo", `-${money(t.cashRefunds)}`);
  p.rule();
  p.bold().lr("= Debe haber", money(t.expectedCash)).bold(false);
  if (t.closed) p.bold().lr("  Se contó", money(t.countedCash)).bold(false);

  // Veredicto
  p.feed(1).align("center").bold().size(2).wrapped(`[ ${String(t.verdictWord || "").toUpperCase()} ]`, { cols: half });
  p.size(1);
  if (t.verdictSub) p.line(t.verdictSub);
  p.bold(false).align("left");

  if (t.notes) {
    section("Observaciones");
    p.wrapped(t.notes);
  }

  // Tickets del turno
  if ((t.tickets || []).length) {
    section(`Tickets del turno · ${t.tickets.length}`);
    for (const k of t.tickets) {
      p.lr(`${k.clock} #${k.folio} ${k.kind}`, k.void ? `(${k.amount})` : k.amount);
    }
  }

  // Firmas
  const w = Math.floor((cols - 4) / 2);
  const pair = (a, b) => `${String(a).slice(0, w).padEnd(w)}    ${String(b).slice(0, w)}`;
  p.feed(3);
  p.line("-".repeat(w) + "    " + "-".repeat(w));
  p.line(pair("Entregó", "Recibió"));
  p.line(pair(String(t.deliveredBy || "").toUpperCase(), ""));

  p.feed(1).align("center");
  if (t.printedText) p.line(`Impreso ${t.printedText}`);
  p.line("Hecho con Mi Tiendita").align("left").feed(3).cut();
  return p.build();
}

/** Ticket corto para «Imprimir prueba». */
export function buildTestPage({ cols = 48, shop = "Mi Tiendita", openDrawer = false } = {}) {
  const p = new EscPos({ cols });
  p.init();
  if (openDrawer) p.drawer();
  p.align("center").bold().size(2).wrapped("PRUEBA", { cols: Math.floor(cols / 2) }).size(1).bold(false);
  p.wrapped(shop).rule();
  p.align("left").lr("Papel", `${cols >= 48 ? 80 : 58} mm (${cols} col.)`);
  p.lr("Acentos", "áéíóú ñÑ ¿¡");
  p.lr("Relleno", money(1234.5), ".");
  p.rule().align("center").line("Si lees esto, la impresora quedó lista.");
  p.qr("https://mitiendita.mx", { size: 4 }).raw(0x0a);
  p.feed(3).cut();
  return p.build();
}
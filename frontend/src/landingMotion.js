import { onMounted, onUnmounted, ref } from "vue";

/**
 * Motor de movimiento de la landing: parallax, escenas 3D guiadas por scroll y tilt.
 *
 * El scroll vive en el contenedor `.landing` (html/body no scrollean), así que todo se
 * mide contra ese elemento. Los valores se escriben como variables CSS dentro de rAF:
 * Vue no re-renderiza en cada frame y el CSS decide qué transformar.
 *
 * Atributos que entiende:
 *   data-scene="view|enter|exit|pin"  → --p (0..1) según la posición en pantalla
 *   data-segments="0-0.4,0.4-0.7"     → --s0, --s1… (suavizados) y data-at = tramos iniciados
 *   data-pointer                      → --mx, --my (-1..1, suavizados; solo mouse fino)
 *   data-depth="320"                  → se desplaza hasta N px a lo largo de toda la página
 *   data-meter                        → --sp (progreso total del scroll)
 *   data-reveal                       → clase is-in al entrar en pantalla (una vez)
 *   data-count="349"                  → cuenta de 0 al valor al aparecer (data-prefix/suffix)
 */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (t) => t * t * (3 - 2 * t);

function parseSegments(raw) {
  if (!raw) return null;
  return raw.split(",").map((pair) => pair.split("-").map(Number));
}

function motionMode() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "reduce";
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) return "full";
  return "lite";
}

function formatCount(node, value) {
  const prefix = node.dataset.prefix || "";
  const suffix = node.dataset.suffix || "";
  node.textContent = `${prefix}${value.toLocaleString("es-MX")}${suffix}`;
}

function countUp(node) {
  const to = Number(node.dataset.count) || 0;
  const t0 = performance.now();
  const dur = 1400;
  const tick = (now) => {
    const t = clamp01((now - t0) / dur);
    formatCount(node, Math.round(to * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function useLandingMotion(rootRef) {
  const mode = ref("full");
  let raf = 0;
  let scenes = [];
  let pointerNodes = [];
  let depthNodes = [];
  let meters = [];
  let io = null;
  let scrolled = null;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, wx: NaN, wy: NaN };
  const media = [];
  let mountedEl = null;

  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function collect() {
    const el = rootRef.value;
    if (!el) return;
    scenes = [...el.querySelectorAll("[data-scene]")].map((node) => ({
      node,
      kind: node.dataset.scene,
      segments: parseSegments(node.dataset.segments),
      p: -1,
      at: -1,
    }));
    pointerNodes = [...el.querySelectorAll("[data-pointer]")];
    depthNodes = [...el.querySelectorAll("[data-depth]")].map((node) => ({
      node,
      range: Number(node.dataset.depth) || 0,
    }));
    meters = [...el.querySelectorAll("[data-meter]")];
  }

  function frame() {
    raf = 0;
    const el = rootRef.value;
    if (!el) return;
    const vh = el.clientHeight || window.innerHeight;
    const top0 = el.getBoundingClientRect().top;
    const st = el.scrollTop;
    const max = Math.max(1, el.scrollHeight - vh);
    const sp = clamp01(st / max);

    // Primero todas las lecturas de layout, luego las escrituras (evita layout thrashing).
    const rects = scenes.map((s) => s.node.getBoundingClientRect());

    scenes.forEach((s, i) => {
      const r = rects[i];
      const top = r.top - top0;
      let p;
      if (s.kind === "pin") {
        const span = r.height - vh;
        p = span > 1 ? clamp01(-top / span) : top <= 0 ? 1 : 0;
      } else if (s.kind === "enter") {
        p = clamp01((vh - top) / (vh * 0.8));
      } else if (s.kind === "exit") {
        p = clamp01(-top / Math.max(1, r.height));
      } else {
        p = clamp01((vh - top) / (vh + r.height));
      }
      if (Math.abs(p - s.p) < 0.0004) return;
      s.p = p;
      const style = s.node.style;
      style.setProperty("--p", p.toFixed(4));
      if (s.segments) {
        let at = 0;
        s.segments.forEach(([a, b], k) => {
          style.setProperty(`--s${k}`, smooth(clamp01((p - a) / (b - a || 1))).toFixed(4));
          if (p >= a) at = k + 1;
        });
        if (s.at !== at) {
          s.at = at;
          s.node.dataset.at = String(at);
        }
      }
    });

    if (mode.value !== "reduce") {
      depthNodes.forEach(({ node, range }) => {
        node.style.transform = `translate3d(0, ${(-sp * range).toFixed(1)}px, 0)`;
      });
    }
    meters.forEach((node) => node.style.setProperty("--sp", sp.toFixed(4)));

    const isScrolled = st > 8;
    if (isScrolled !== scrolled) {
      scrolled = isScrolled;
      if (isScrolled) el.dataset.scrolled = "";
      else delete el.dataset.scrolled;
    }

    if (mode.value === "full") {
      pointer.x += (pointer.tx - pointer.x) * 0.085;
      pointer.y += (pointer.ty - pointer.y) * 0.085;
      if (Math.abs(pointer.x - pointer.wx) > 0.0008 || Math.abs(pointer.y - pointer.wy) > 0.0008) {
        pointer.wx = pointer.x;
        pointer.wy = pointer.y;
        pointerNodes.forEach((node) => {
          node.style.setProperty("--mx", pointer.x.toFixed(4));
          node.style.setProperty("--my", pointer.y.toFixed(4));
        });
      }
      if (Math.abs(pointer.tx - pointer.x) > 0.001 || Math.abs(pointer.ty - pointer.y) > 0.001) {
        schedule();
      }
    }
  }

  function onPointerMove(event) {
    if (mode.value !== "full" || event.pointerType === "touch") return;
    pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    schedule();
  }

  function onPointerOut(event) {
    if (event.relatedTarget) return;
    pointer.tx = 0;
    pointer.ty = 0;
    schedule();
  }

  function setupReveal() {
    const el = rootRef.value;
    if (io) io.disconnect();
    const reveals = [...el.querySelectorAll("[data-reveal]")];
    const counters = [...el.querySelectorAll("[data-count]")];
    if (mode.value === "reduce" || typeof IntersectionObserver === "undefined") {
      reveals.forEach((node) => node.classList.add("is-in"));
      return;
    }
    counters.forEach((node) => {
      if (!node.dataset.counted) formatCount(node, 0);
    });
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const node = entry.target;
          node.classList.add("is-in");
          if (node.dataset.count != null && !node.dataset.counted) {
            node.dataset.counted = "1";
            countUp(node);
          }
          io.unobserve(node);
        });
      },
      { root: el, threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );
    reveals.forEach((node) => io.observe(node));
    counters.forEach((node) => io.observe(node));
  }

  function applyMode() {
    const el = rootRef.value;
    if (!el) return;
    mode.value = motionMode();
    el.dataset.motion = mode.value;
    if (mode.value !== "full") {
      pointer.tx = pointer.ty = pointer.x = pointer.y = 0;
      pointerNodes.forEach((node) => {
        node.style.removeProperty("--mx");
        node.style.removeProperty("--my");
      });
      pointer.wx = pointer.wy = NaN;
    }
    if (mode.value === "reduce") {
      depthNodes.forEach(({ node }) => (node.style.transform = ""));
      el.querySelectorAll("[data-count]").forEach((node) => formatCount(node, Number(node.dataset.count) || 0));
    }
    setupReveal();
    schedule();
  }

  /** Vuelve a leer el DOM (p. ej. después de cargar contenido asíncrono). */
  function refresh() {
    collect();
    setupReveal();
    schedule();
  }

  onMounted(() => {
    const el = rootRef.value;
    if (!el) return;
    mountedEl = el;
    collect();
    applyMode();
    el.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    ["(prefers-reduced-motion: reduce)", "(hover: hover) and (pointer: fine)"].forEach((q) => {
      const mq = window.matchMedia(q);
      mq.addEventListener?.("change", applyMode);
      media.push(mq);
    });
  });

  onUnmounted(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (io) io.disconnect();
    mountedEl?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerout", onPointerOut);
    media.forEach((mq) => mq.removeEventListener?.("change", applyMode));
  });

  return { mode, refresh };
}

function canTilt() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * v-tilt: inclina la tarjeta hacia el cursor con brillo (--rx, --ry, --gx, --gy).
 * El valor es el ángulo máximo en grados (default 10). Solo con mouse y sin reduced motion.
 */
export const vTilt = {
  mounted(el, binding) {
    if (!canTilt()) return;
    const max = Number(binding.value) || 10;
    let raf = 0;
    let last = null;
    const paint = () => {
      raf = 0;
      if (!last) return;
      const rect = el.getBoundingClientRect();
      const x = clamp01((last.clientX - rect.left) / rect.width);
      const y = clamp01((last.clientY - rect.top) / rect.height);
      el.style.setProperty("--rx", `${((0.5 - y) * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((x - 0.5) * max).toFixed(2)}deg`);
      el.style.setProperty("--gx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(y * 100).toFixed(1)}%`);
    };
    const onMove = (event) => {
      last = event;
      el.classList.add("is-tilting");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      last = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.classList.remove("is-tilting");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    el._tilt = { onMove, onLeave };
  },
  unmounted(el) {
    if (!el._tilt) return;
    el.removeEventListener("pointermove", el._tilt.onMove);
    el.removeEventListener("pointerleave", el._tilt.onLeave);
    delete el._tilt;
  },
};

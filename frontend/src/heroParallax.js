import { onMounted, onUnmounted } from "vue";

/**
 * Parallax del hero de la landing.
 *
 * El scroll vive en el contenedor `.landing` (html/body no scrollean). Todo se escribe como
 * variables CSS sobre el elemento del hero dentro de un rAF; el CSS decide qué mover y a qué velocidad:
 *   --sy  píxeles recorridos del scroll (0 hasta la altura del hero)
 *   --tp  0..1: cuánto se ha «abierto» la pantalla inclinada (de 12° a plana)
 *   --mx / --my  -1..1: posición suavizada del puntero (solo con mouse)
 * Con «reducir movimiento» no hay efecto: la pantalla queda inclinada y quieta.
 */
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const smooth = (t) => t * t * (3 - 2 * t);

export function useHeroParallax(rootRef) {
  let scroller = null;
  let raf = 0;
  let dirty = true;
  let tx = 0;
  let ty = 0;
  let cx = 0;
  let cy = 0;
  let fine = false;
  let off = null;

  function write() {
    raf = 0;
    const el = rootRef.value;
    if (!el || !scroller) return;
    if (dirty) {
      dirty = false;
      const heroH = el.offsetHeight || 1;
      const top = Math.max(0, scroller.scrollTop);
      const sy = Math.min(top, heroH);
      const open = smooth(clamp01(top / Math.max(420, scroller.clientHeight * 0.6)));
      el.style.setProperty("--sy", sy.toFixed(1));
      el.style.setProperty("--tp", open.toFixed(3));
    }
    // Puntero suavizado: se sigue animando hasta que alcanza el objetivo
    cx += (tx - cx) * 0.085;
    cy += (ty - cy) * 0.085;
    if (Math.abs(tx - cx) > 0.002 || Math.abs(ty - cy) > 0.002) {
      el.style.setProperty("--mx", cx.toFixed(3));
      el.style.setProperty("--my", cy.toFixed(3));
      schedule();
    }
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(write);
  }

  onMounted(() => {
    const el = rootRef.value;
    if (!el) return;
    scroller = el.closest(".landing");
    if (!scroller) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--tp", "0.33");
      return;
    }
    fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    const onScroll = () => {
      dirty = true;
      schedule();
    };
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
      ty = ((e.clientY - r.top) / Math.max(1, Math.min(r.height, window.innerHeight))) * 2 - 1;
      schedule();
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
      schedule();
    };
    const onResize = () => {
      dirty = true;
      schedule();
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    if (fine) {
      el.addEventListener("pointermove", onMove, { passive: true });
      el.addEventListener("pointerleave", onLeave, { passive: true });
    }
    off = () => {
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
    write();
  });

  onUnmounted(() => {
    if (raf) cancelAnimationFrame(raf);
    if (off) off();
  });
}

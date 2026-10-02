import { h } from "vue";

/* Íconos de línea (24×24, trazo) usados en la pantalla de venta */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  tag: '<path d="M3 12V4.5A1.5 1.5 0 014.5 3H12l9 9-9 9-9-9z"/><circle cx="7.5" cy="7.5" r="1.4"/>',
  plus: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  box: '<path d="M3 7.5L12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 7.5v9L12 21l9-4.5v-9"/><path d="M12 12v9"/>',
  barcode: '<path d="M4 5v14M7.5 5v14M11 5v14M14 5v14M17.5 5v14M20 5v14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>',
  hash: '<path d="M4 9h16M4 15h16M10 4L8 20M16 4l-2 16"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  transfer: '<path d="M4 8h15l-3.5-3.5M20 16H5l3.5 3.5"/>',
  split: '<rect x="2" y="4" width="13" height="10" rx="2"/><path d="M9 14v4a2 2 0 002 2h9a2 2 0 002-2v-6a2 2 0 00-2-2h-5"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19L12 3.5z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  history: '<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  receipt: '<path d="M6 3h12v18l-2.2-1.4L12 21l-3.8-1.4L6 21V3z"/><path d="M9 8h6M9 12h6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  spark: '<path d="M11 3l1.7 5.3L18 10l-5.3 1.7L11 17l-1.7-5.3L4 10l5.3-1.7L11 3z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
};

export default {
  name: "PosIcon",
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 20 },
  },
  setup(props) {
    return () =>
      h("svg", {
        viewBox: "0 0 24 24",
        width: props.size,
        height: props.size,
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 1.9,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        "aria-hidden": "true",
        focusable: "false",
        innerHTML: ICONS[props.name] || "",
      });
  },
};

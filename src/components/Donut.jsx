import { C } from "../theme.js";

// Allocation donut chart (SVG arcs). `size` scales the whole thing.
export default function Donut({ items, total, size = 128 }) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.405, r = size * 0.258;
  let a0 = -Math.PI / 2;
  const arcs = items.map((it) => {
    const frac = it.value / total;
    const a1 = a0 + frac * 2 * Math.PI;
    const big = frac > 0.5 ? 1 : 0;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const xi1 = cx + r * Math.cos(a1), yi1 = cy + r * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a0), yi0 = cy + r * Math.sin(a0);
    const d = `M${x0},${y0} A${R},${R},0,${big},1,${x1},${y1} L${xi1},${yi1} A${r},${r},0,${big},0,${xi0},${yi0} Z`;
    a0 = a1;
    return { d, color: it.color };
  });
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} />)}
      <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontFamily: C.mono, fontSize: size * 0.11, fontWeight: 700, fill: C.ink }}>{(total / 1000).toFixed(1)}k</text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle" style={{ fontFamily: C.sans, fontSize: size * 0.065, fill: C.dim }}>Total</text>
    </svg>
  );
}

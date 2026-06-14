import { useState } from "react";
import { C } from "../theme.js";

// Monochrome donut with external connector-line labels (reference style).
// items: [{ label, value }].
//  - Caps slices: if more than MAX, the smallest are rolled into "Other" so the
//    chart stays readable even with 10–20 holdings.
//  - Labels are de-overlapped per side (pushed apart to a min vertical gap), so
//    they never sit on top of each other.
const SHADES = ["#13243B", "#1F4068", "#2E6FB0", "#46A0FF", "#73B2EA", "#A6CBEB", "#CBDCEE", "#E4EDF6"];

function seg(cx, cy, R, r, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
  const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
  const xi1 = cx + r * Math.cos(a1), yi1 = cy + r * Math.sin(a1);
  const xi0 = cx + r * Math.cos(a0), yi0 = cy + r * Math.sin(a0);
  return `M${x0},${y0} A${R},${R},0,${large},1,${x1},${y1} L${xi1},${yi1} A${r},${r},0,${large},0,${xi0},${yi0} Z`;
}

// Push a sorted list of y-positions apart to at least `gap`, kept within [min,max].
function spread(ys, gap, min, max) {
  for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < gap) ys[i] = ys[i - 1] + gap;
  if (ys.length && ys[ys.length - 1] > max) {
    ys[ys.length - 1] = max;
    for (let i = ys.length - 2; i >= 0; i--) if (ys[i + 1] - ys[i] < gap) ys[i] = ys[i + 1] - gap;
  }
  if (ys.length && ys[0] < min) {
    ys[0] = min;
    for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] < gap) ys[i] = ys[i - 1] + gap;
  }
  return ys;
}

export default function AllocationDonut({ items, centerLabel }) {
  const W = 520, H = 300, cx = 260, cy = 150, R = 102, r = 62;
  const [hover, setHover] = useState(null); // index of the hovered slice (pops out)

  // sort, then roll only the SMALL slices (< 4% of the total) into "Other" so the
  // chart stays readable without an oversized "Other" wedge. A lone small slice
  // keeps its own name (no point calling a single 3% holding "Other").
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0) || 1;
  const big = sorted.filter((d) => d.value / total >= 0.04);
  const small = sorted.filter((d) => d.value / total < 0.04);
  let data = big;
  if (small.length === 1) data = [...big, small[0]];
  else if (small.length > 1) data = [...big, { label: "Other", value: small.reduce((s, x) => s + x.value, 0) }];
  if (data.length === 0) data = sorted; // everything was tiny — show as-is

  // build slices with geometry
  let a = -Math.PI / 2;
  const slices = data.map((it, i) => {
    const frac = it.value / total;
    const a0 = a, a1 = a + frac * 2 * Math.PI; a = a1;
    const mid = (a0 + a1) / 2;
    const right = Math.cos(mid) >= 0;
    return {
      ...it, frac, color: SHADES[i % SHADES.length], right,
      d: seg(cx, cy, R, r, a0, a1),
      ax: cx + R * Math.cos(mid), ay: cy + R * Math.sin(mid),
      mx: Math.cos(mid), my: Math.sin(mid), // radial direction (for hover pop-out)
    };
  });

  // de-overlap labels per side
  ["R", "L"].forEach((side) => {
    const grp = slices.filter((s) => (s.right ? "R" : "L") === side).sort((p, q) => p.ay - q.ay);
    const ys = spread(grp.map((s) => s.ay), 30, 16, H - 16);
    grp.forEach((s, i) => { s.ly = ys[i]; });
  });

  const trunc = (t) => (t.length > 14 ? t.slice(0, 13) + "…" : t);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 520, height: "auto", display: "block", margin: "0 auto" }}>
      {slices.map((s, i) => (
        <path
          key={i} d={s.d} fill={s.color}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          transform={hover === i ? `translate(${s.mx * 9} ${s.my * 9})` : undefined}
          style={{ transition: "transform .13s ease", cursor: "pointer" }}
        />
      ))}
      {slices.map((s, i) => {
        const labelX = s.right ? cx + R + 50 : cx - R - 50;
        const kneeX = s.right ? cx + R + 16 : cx - R - 16;
        return (
          <g key={"l" + i}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            transform={hover === i ? `translate(${s.mx * 9} ${s.my * 9})` : undefined}
            style={{ transition: "transform .13s ease", cursor: "pointer" }}>
            <polyline points={`${s.ax},${s.ay} ${kneeX},${s.ly} ${s.right ? labelX - 6 : labelX + 6},${s.ly}`} fill="none" stroke={C.muted} strokeWidth="1" />
            <text x={labelX} y={s.ly - 2} textAnchor={s.right ? "start" : "end"} style={{ fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, fill: C.ink }}>{trunc(s.label)}</text>
            <text x={labelX} y={s.ly + 13} textAnchor={s.right ? "start" : "end"} style={{ fontFamily: C.sans, fontSize: 11.5, fontWeight: 500, fill: C.dim }}>{(s.frac * 100).toFixed(1)}%</text>
          </g>
        );
      })}
      <text x={cx} y={cy - 3} textAnchor="middle" style={{ fontFamily: C.sans, fontSize: 19, fontWeight: 600, fill: C.ink }}>{(total / 1000).toFixed(1)}k</text>
      <text x={cx} y={cy + 15} textAnchor="middle" style={{ fontFamily: C.sans, fontSize: 10.5, fontWeight: 500, fill: C.dim, letterSpacing: "0.04em" }}>{(centerLabel || "TOTAL").toUpperCase()}</text>
    </svg>
  );
}

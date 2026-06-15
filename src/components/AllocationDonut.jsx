import { useRef, useState } from "react";
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

export default function AllocationDonut({ items, centerLabel, onSelect }) {
  const click = (s) => { if (s.ticker && onSelect) onSelect(s.ticker); };
  const W = 520, H = 300, cx = 260, cy = 150, R = 102, r = 62;
  const [hover, setHover] = useState(null); // index of the hovered slice (pops out)
  const svgRef = useRef(null);

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
      ...it, frac, color: SHADES[i % SHADES.length], right, a0, a1,
      d: seg(cx, cy, R, r, a0, a1),
      ax: cx + R * Math.cos(mid), ay: cy + R * Math.sin(mid),
      mx: Math.cos(mid), my: Math.sin(mid), // radial direction (for hover pop-out)
    };
  });

  // Which slice is under the cursor — computed from the cursor's ANGLE/position on
  // the whole chart (not per-slice mouse-enter/leave). This avoids the flicker where
  // a slice pops out from under the cursor → "leave" → pops back → "enter" → loop.
  function sliceAt(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const vx = (e.clientX - rect.left) * (W / rect.width);
    const vy = (e.clientY - rect.top) * (H / rect.height);
    const dx = vx - cx, dy = vy - cy, dist = Math.hypot(dx, dy);
    if (dist < r - 6 || dist > R + 16) return -1; // outside the ring
    let ang = Math.atan2(dy, dx);
    if (ang < -Math.PI / 2) ang += 2 * Math.PI; // match slice range [-π/2, 3π/2)
    return slices.findIndex((s) => ang >= s.a0 && ang < s.a1);
  }
  const onMove = (e) => { const i = sliceAt(e); setHover(i >= 0 ? i : null); };
  const onClickSvg = (e) => { const i = sliceAt(e); if (i >= 0) click(slices[i]); };
  const hoverClickable = hover != null && slices[hover]?.ticker && onSelect;

  // de-overlap labels per side
  ["R", "L"].forEach((side) => {
    const grp = slices.filter((s) => (s.right ? "R" : "L") === side).sort((p, q) => p.ay - q.ay);
    const ys = spread(grp.map((s) => s.ay), 38, 14, H - 14); // gap fits 2-line labels + hover pop-out
    grp.forEach((s, i) => { s.ly = ys[i]; });
  });

  const trunc = (t) => (t.length > 14 ? t.slice(0, 13) + "…" : t);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClickSvg} style={{ width: "100%", maxWidth: 520, height: "auto", display: "block", margin: "0 auto", cursor: hoverClickable ? "pointer" : "default" }}>
      {slices.map((s, i) => (
        <path
          key={i} d={s.d} fill={s.color}
          transform={hover === i ? `translate(${s.mx * 9} ${s.my * 9})` : undefined}
          style={{ transition: "transform .13s ease", pointerEvents: "none" }}
        />
      ))}
      {slices.map((s, i) => {
        const labelX = s.right ? cx + R + 50 : cx - R - 50;
        const kneeX = s.right ? cx + R + 16 : cx - R - 16;
        return (
          <g key={"l" + i}
            transform={hover === i ? `translate(${s.mx * 9} ${s.my * 9})` : undefined}
            style={{ transition: "transform .13s ease", pointerEvents: "none" }}>
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

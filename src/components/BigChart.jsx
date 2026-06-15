import { useRef, useState, useEffect } from "react";
import { C } from "../theme.js";

const money = (v) => `P£${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function fmtTime(t, res) {
  const d = new Date(t * 1000);
  if (res === "15m" || res === "1h") return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  if (res === "1mo") return d.toLocaleString("en-GB", { month: "short", year: "numeric" });
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// REAL mode: fit-to-width (does NOT make the tab scroll). Scroll the WHEEL over
// the graph to zoom in/out (around the cursor). Hover shows a crosshair tooltip.
// Optional `avgCost` draws a dashed line at the user's average buy price (only
// when it falls within the visible price range).
function PointsChart({ points, resolution, avgCost, height, blue, zoomable, onHover, bare }) {
  const wrapRef = useRef(null);
  const [win, setWin] = useState(null); // {lo,hi} zoom window
  const [hov, setHov] = useState(null);
  const N = points.length;

  // reset zoom only when the underlying dataset changes (ticker / timeframe)
  useEffect(() => { setWin(null); setHov(null); }, [N, points[0]?.t]);

  const lo = win ? win.lo : 0;
  const hi = win ? win.hi : N - 1;
  const vpts = points.slice(lo, hi + 1);
  const vals = vpts.map((p) => p.c);
  const m = vals.length;
  const denom = m > 1 ? m - 1 : 1;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || max * 0.01 || 1;
  const W = 800, H = height, px = 4, py = 14, padR = bare ? 6 : 52;
  const xAt = (i) => px + (i / denom) * (W - px - padR);
  const yAt = (v) => H - py - ((v - min) / range) * (H - py * 2);
  const xPct = (i) => (xAt(i) / W) * 100;
  const yPct = (v) => (yAt(v) / H) * 100;
  const line = vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const up = vals[m - 1] >= vals[0];
  const col = blue ? C.blue : up ? C.green : C.red;
  const gid = "gp" + height;
  const levels = bare ? [] : [0, 1, 2, 3].map((k) => { const v = min + (range * k) / 3; return { v, y: yAt(v) }; });
  const showAvg = avgCost != null && avgCost >= min && avgCost <= max;
  const ci = hov != null && hov >= 0 && hov < m ? hov : null;

  // wheel-zoom (native listener so we can preventDefault the page scroll).
  // Only enabled on the MAX timeframe (`zoomable`); other timeframes don't zoom.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !zoomable) return;
    function onWheel(e) {
      e.preventDefault();
      // Hide the crosshair while zooming — no mousemove fires during a wheel scroll, so
      // a kept `hov` index would be redrawn against the new window and appear to jump.
      // It reappears under the cursor on the next mouse move.
      setHov(null);
      if (onHover) onHover(null);
      const size = hi - lo;
      const r = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const center = lo + frac * size;
      let ns = Math.round(size * (e.deltaY < 0 ? 0.94 : 1.064)); // gentler zoom
      if (e.deltaY < 0 && ns >= size) ns = size - 1; // never stall on round-back
      if (e.deltaY > 0 && ns <= size) ns = size + 1;
      ns = Math.max(6, Math.min(N - 1, ns));
      let nlo = Math.round(center - frac * ns), nhi = nlo + ns;
      if (nlo < 0) { nlo = 0; nhi = ns; }
      if (nhi > N - 1) { nhi = N - 1; nlo = nhi - ns; }
      setWin(ns >= N - 1 ? null : { lo: Math.max(0, nlo), hi: nhi });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [lo, hi, N, zoomable]);

  function onMove(e) {
    // Map the cursor to the DATA area (px … W-padR), not the whole container, so
    // the crosshair dot/tooltip sit exactly under the mouse.
    const r = wrapRef.current.getBoundingClientRect();
    const raw = (e.clientX - r.left) / r.width;
    const f = Math.max(0, Math.min(1, (raw - px / W) / ((W - padR) / W - px / W)));
    const idx = Math.round(f * denom);
    if (idx === hov) return; // still on the same data point → skip the re-render (smoother)
    setHov(idx);
    // Report the hovered point so the parent headline can track it (T212 style).
    if (onHover) { const ii = Math.max(0, Math.min(m - 1, idx)); onHover({ value: vpts[ii].c, label: fmtTime(vpts[ii].t, resolution) }); }
  }
  function onLeave() { setHov(null); if (onHover) onHover(null); }

  const dot = (left, top, color) => ({ position: "absolute", left: `${left}%`, top: `${top}%`, transform: "translate(-50%,-50%)", width: 9, height: 9, borderRadius: "50%", background: color, border: "2px solid #fff", boxShadow: C.sh, pointerEvents: "none" });

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }} onMouseMove={onMove} onMouseLeave={onLeave}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity="0.15" />
            <stop offset="100%" stopColor={col} stopOpacity="0" />
          </linearGradient>
        </defs>
        {levels.map((lv, i) => (
          <g key={i}>
            <line x1={px} y1={lv.y} x2={W - padR} y2={lv.y} stroke={C.lineSoft} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <text x={W - padR + 6} y={lv.y + 3} style={{ fontFamily: C.mono, fontSize: 9, fill: C.muted }}>{Math.round(lv.v).toLocaleString("en-GB")}</text>
          </g>
        ))}
        {showAvg && <line x1={px} y1={yAt(avgCost)} x2={W - padR} y2={yAt(avgCost)} stroke={C.dim} strokeWidth="1" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
        <polyline points={`${line} ${W - padR},${H} ${px},${H}`} fill={`url(#${gid})`} stroke="none" />
        <polyline points={line} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {ci != null && <line x1={xAt(ci)} y1={py} x2={xAt(ci)} y2={H - py} stroke={C.muted} strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>

      {/* HTML overlays (perfect circles / crisp text — no SVG stretch distortion) */}
      {ci == null && <span style={dot(xPct(m - 1), yPct(vals[m - 1]), col)} />}
      {ci != null && <span style={dot(xPct(ci), yPct(vals[ci]), col)} />}
      {showAvg && (
        <div style={{ position: "absolute", right: 4, top: `${yPct(avgCost)}%`, transform: "translateY(-50%)", background: C.fill, color: C.dim, fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 6, pointerEvents: "none" }}>Avg {money(avgCost)}</div>
      )}
      {ci != null && (
        // Anchor the tooltip to the side of the cursor that keeps it INSIDE the
        // chart (flip past the midpoint), with an 8px gap, so it never bleeds
        // into neighbouring sections' text/lines.
        <div style={{ position: "absolute", top: 4, left: `${xPct(ci)}%`, transform: xPct(ci) > 50 ? "translateX(calc(-100% - 8px))" : "translateX(8px)", background: C.ink, color: "#fff", padding: "5px 9px", borderRadius: 8, fontSize: 11.5, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: C.sh, zIndex: 2 }}>
          <div style={{ fontWeight: 700 }}>{money(vals[ci])}</div>
          <div style={{ opacity: 0.7, fontSize: 10.5 }}>{fmtTime(vpts[ci].t, resolution)}</div>
        </div>
      )}
    </div>
  );
}

// SYNTHETIC mode: series + count → stretched illustrative chart (account / perf).
export default function BigChart({ series, count, points, resolution, avgCost, height = 220, forceUp, axes = false, blue = false, zoomable = false, onHover, bare = false }) {
  if (points && points.length > 1) return <PointsChart points={points} resolution={resolution} avgCost={avgCost} height={height} blue={blue} zoomable={zoomable} onHover={onHover} bare={bare} />;

  const vals = series.slice(-count);
  const n = vals.length;
  const denom = n > 1 ? n - 1 : 1;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || max * 0.01 || 1;
  const W = 800, H = height, px = 4, py = 14;
  const padR = axes ? 52 : px;
  const xAt = (i) => px + (i / denom) * (W - px - padR);
  const yAt = (v) => H - py - ((v - min) / range) * (H - py * 2);
  const line = vals.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const up = forceUp || vals[n - 1] >= vals[0];
  const col = blue ? C.blue : up ? C.green : C.red;
  const xN = xAt(n - 1), yN = yAt(vals[n - 1]);
  const gid = "g" + (blue ? "b" : up ? "u" : "d") + height;
  const levels = axes ? [0, 1, 2, 3].map((k) => { const v = min + (range * k) / 3; return { v, y: yAt(v) }; }) : [];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.15" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      {levels.map((lv, i) => (
        <g key={i}>
          <line x1={px} y1={lv.y} x2={W - padR} y2={lv.y} stroke={C.lineSoft} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={W - padR + 6} y={lv.y + 3} style={{ fontFamily: C.mono, fontSize: 9, fill: C.muted }}>{Math.round(lv.v).toLocaleString("en-GB")}</text>
        </g>
      ))}
      <polyline points={`${line} ${W - padR},${H} ${px},${H}`} fill={`url(#${gid})`} stroke="none" />
      <polyline points={line} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xN} cy={yN} r="4" fill={col} />
    </svg>
  );
}

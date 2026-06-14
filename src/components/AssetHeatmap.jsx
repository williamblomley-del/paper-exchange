import { C } from "../theme.js";
import { pct } from "../lib/format.js";
import { usePrices } from "../lib/pricesContext.js";
import Logo from "./Logo.jsx";

// Asset-allocation TREEMAP, Trading 212 style. Uses a SQUARIFIED layout so tiles
// stay close to square (a clean "puzzle") for any set of weights — not thin
// blocky slivers. Each tile is centred on logo + ticker + daily %, and tinted on
// a graded scale: strong red (big fall) → light red → light green → strong green.

// Virtual layout box. Its aspect ratio MATCHES the rendered container (portrait:
// ~430px wide × VH tall), so the squarified tiles render at their TRUE proportions
// — natural, varied rectangles like Trading 212, NOT squished tall slivers. The
// container is a fixed portrait size regardless of how many holdings there are.
const VW = 430, VH = 620;

function worst(areas, len) {
  if (!areas.length) return Infinity;
  const sum = areas.reduce((a, b) => a + b, 0);
  const mx = Math.max(...areas), mn = Math.min(...areas), s2 = sum * sum;
  return Math.max((len * len * mx) / s2, s2 / (len * len * mn));
}

function squarify(items) {
  const out = [];
  const rect = { x: 0, y: 0, w: VW, h: VH };
  let idx = 0;
  while (idx < items.length) {
    const remVal = items.slice(idx).reduce((s, i) => s + i.value, 0) || 1;
    const scale = (rect.w * rect.h) / remVal;
    const len = Math.min(rect.w, rect.h);
    const row = [], areas = [];
    let j = idx;
    while (j < items.length) {
      const a = items[j].value * scale;
      if (!row.length || worst(areas, len) >= worst([...areas, a], len)) { row.push(items[j]); areas.push(a); j++; }
      else break;
    }
    const sum = areas.reduce((a, b) => a + b, 0);
    const thick = sum / len;
    const vertical = rect.w > rect.h;
    let off = vertical ? rect.y : rect.x;
    row.forEach((it, k) => {
      const cell = areas[k] / thick;
      if (vertical) { out.push({ ...it, x: rect.x, y: off, w: thick, h: cell }); off += cell; }
      else { out.push({ ...it, x: off, y: rect.y, w: cell, h: thick }); off += cell; }
    });
    if (vertical) { rect.x += thick; rect.w -= thick; } else { rect.y += thick; rect.h -= thick; }
    idx = j;
  }
  return out;
}

// Soft PASTEL tint by magnitude (Trading 212 style): gentle floor, capped low so
// even big movers read as a light mint/blush rather than a saturated block.
function tint(chg) {
  const alpha = 0.10 + Math.min(Math.abs(chg) / 4, 1) * 0.34; // 0.10 → 0.44
  const base = chg >= 0 ? "12,175,113" : "229,72,77";
  return `rgba(${base},${alpha})`;
}

export default function AssetHeatmap({ positions, onSelect }) {
  const { priceOf, chgOf } = usePrices();
  const items = Object.entries(positions).map(([t, p]) => {
    return { t, value: p.shares * priceOf(t), chg: chgOf(t) };
  }).sort((a, b) => b.value - a.value);
  if (items.length === 0) return null;

  const tiles = squarify(items);

  return (
    <div style={{ padding: "18px 20px 24px", borderTop: `1px solid ${C.line}` }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>Asset allocation</div>
      <div style={{ fontSize: 12, color: C.dim, marginBottom: 14 }}>Each asset's share and how it's doing today.</div>

      {/* Logo + ticker + % are a FIXED, uniform size on EVERY tile (small, T212
          style). The three only show when the tile is big enough to contain them
          (logo dropped first, then ticker) so nothing overflows the rectangle. */}
      <div style={{ position: "relative", width: "100%", height: VH }}>
        {tiles.map(({ t, chg, x, y, w, h }) => {
          const bg = tint(chg);
          const wpx = (w / VW) * 100, hpx = (h / VH) * 100;
          // VW matches the rendered width, so virtual w/h ≈ rendered px.
          const rw = w, rh = h;
          const showLogo = rh >= 58 && rw >= 36;
          const showTicker = rh >= 32 && rw >= 30;
          return (
            <div key={t} onClick={() => onSelect && onSelect(t)} className="lift" style={{
              position: "absolute", left: `${(x / VW) * 100}%`, top: `${(y / VH) * 100}%`,
              width: `${wpx}%`, height: `${hpx}%`, border: "4px solid #fff", borderRadius: 14,
              boxSizing: "border-box", background: bg, color: C.ink, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 4, overflow: "hidden", textAlign: "center", padding: 4,
            }}>
              {showLogo && <Logo ticker={t} size={20} round />}
              {showTicker && <div style={{ fontSize: 11, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>{t}</div>}
              <div style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1, color: chg >= 0 ? C.green : C.red }}>{pct(chg)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

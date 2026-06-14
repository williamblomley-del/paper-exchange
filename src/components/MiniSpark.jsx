import { C } from "../theme.js";

// Tiny inline sparkline for watchlist rows. Verbatim from PaperExchange.jsx.
export default function MiniSpark({ series, up }) {
  const min = Math.min(...series), max = Math.max(...series), range = max - min || 1;
  const w = 46, h = 22;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? C.green : C.red} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

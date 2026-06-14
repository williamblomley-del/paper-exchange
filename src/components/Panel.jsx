import { C } from "../theme.js";

// Flat white surface — no grey border/shadow framing (Trading 212 style).
// Structure comes from internal divider lines, not a card outline.
export default function Panel({ children, pad = 20 }) {
  return (
    <div style={{ background: C.card, borderRadius: 16, padding: pad }}>
      {children}
    </div>
  );
}

import { C } from "../theme.js";
import { userColor } from "../lib/format.js";

// Circular initial avatar, coloured deterministically from the name.
// Verbatim from PaperExchange.jsx.
export default function Avatar({ name, size = 30, ring }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: userColor(name),
      color: "#fff", flexShrink: 0, display: "flex", alignItems: "center",
      justifyContent: "center", fontWeight: 800, fontSize: size * 0.42,
      boxShadow: ring ? `0 0 0 2px ${C.card},0 0 0 3.5px ${userColor(name)}` : "none",
    }}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

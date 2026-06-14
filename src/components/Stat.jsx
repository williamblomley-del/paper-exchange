import { C } from "../theme.js";

// Small labelled metric — flat (no grey fill box), to match the white aesthetic.
export default function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.dim, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 400, color: color || C.ink }}>{value}</div>
    </div>
  );
}

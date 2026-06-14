// Design tokens. Reworked to a white, airy theme (Trading 212 / Portfolio
// Dashboard references): page is white, gray is used ONLY for small inner fill
// boxes/inputs, type is a rounded sans (Manrope) with tabular figures.

export const C = {
  bg: "#FFFFFF",        // page background (was a heavy gray — now white)
  card: "#FFFFFF",      // cards / panels
  fill: "#F4F5F7",      // the ONLY gray: inner stat boxes, inputs, toggles
  fillSoft: "#F9FAFB",  // even lighter fill (hover, alt rows)
  ink: "#0D1117",
  dim: "#6B7585",
  muted: "#AEB6C2",
  line: "#ECEEF2",      // card borders
  lineSoft: "#F1F3F6",  // row separators, chart gridlines
  green: "#0CAF71", greenSoft: "rgba(12,175,113,0.10)",
  red: "#E5484D", redSoft: "rgba(229,72,77,0.10)",
  blue: "#46A0FF", amber: "#B8741A", amberSoft: "rgba(184,116,26,0.10)",
  // Numbers use the same rounded sans (with tabular figures, set globally) —
  // no monospace, to match the photos. `mono` kept as a key so existing
  // references keep working; it just points at the sans now.
  // Closest free Google Font to Trading 212's geometric sans (their exact face
  // is proprietary). Numbers use the same family with tabular figures.
  sans: "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  mono: "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
  sh: "0 1px 2px rgba(13,17,23,0.04), 0 4px 18px rgba(13,17,23,0.05)",
};

export const START_CASH = 10000;
export const DONUT = ["#0CAF71","#3B6FF5","#8B5CF6","#F59E0B","#EC4899","#06B6D4","#84CC16","#F97316"];

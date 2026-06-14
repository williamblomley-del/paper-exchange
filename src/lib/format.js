// Formatting helpers — copied verbatim from PaperExchange.jsx.
// fmt: number -> "1,234.56"   P: number -> "P£1,234.56"   pct: number -> "+5.43%"
// userColor: deterministic colour from a username string (for avatars).

export const fmt = (n, dp = 2) =>
  (n ?? 0).toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const P = (n) => `P£${fmt(n)}`;

// Native-currency money: $ / £ / € etc. Used for a stock's real quoted price.
const SYM = { USD: "$", GBP: "£", EUR: "€", JPY: "¥", CAD: "C$", AUD: "A$", CHF: "CHF ", HKD: "HK$" };
export const curSym = (c) => SYM[c] || (c ? c + " " : "$");
export const money = (n, c) => `${curSym(c)}${fmt(n)}`;

// Currency by exchange suffix — overrides a (possibly cached/defaulted) currency,
// so London (.L) always shows £, Frankfurt/Paris (.DE/.PA) €, etc.
const SUFFIX_CUR = {
  L: "GBP", PA: "EUR", AS: "EUR", BR: "EUR", LS: "EUR", MC: "EUR", MI: "EUR", DE: "EUR",
  F: "EUR", MU: "EUR", HM: "EUR", SG: "EUR", DU: "EUR", BE: "EUR", HA: "EUR", VI: "EUR", IR: "EUR",
  ST: "SEK", HE: "EUR", CO: "DKK", OL: "NOK", TO: "CAD", V: "CAD", HK: "HKD", T: "JPY",
  SW: "CHF", AX: "AUD", NS: "INR", BO: "INR",
};
export const currencyOf = (symbol, dataCur) =>
  SUFFIX_CUR[((symbol || "").split(".")[1] || "").toUpperCase()] || dataCur || "USD";

export const pct = (n) => `${n >= 0 ? "+" : ""}${fmt(n)}%`;

export function userColor(name = "") {
  const pal = ["#6366F1","#EC4899","#14B8A6","#F59E0B","#84CC16","#8B5CF6","#F97316","#06B6D4"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return pal[h % pal.length];
}

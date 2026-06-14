import { C } from "../theme.js";
import { P, pct, money } from "../lib/format.js";
import { usePrices } from "../lib/pricesContext.js";
import Panel from "../components/Panel.jsx";
import Stat from "../components/Stat.jsx";
import Avatar from "../components/Avatar.jsx";
import Logo from "../components/Logo.jsx";

// LEADERBOARD — real players in your game, ranked by total value.
// board: [{ id, username, value, ret }] (from App). meId = my user id.
export default function Leaderboard({ board = [], meId, game, selUser, setSelUser }) {
  const { priceOf, curOf, detailOf } = usePrices();
  if (!game) {
    return <Panel pad={40}><div style={{ textAlign: "center", color: C.dim, fontSize: 14 }}>You're not in a game yet.</div></Panel>;
  }
  if (board.length === 0) {
    return (
      <Panel pad={40}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{game.name || "Your game"}</div>
          <div style={{ color: C.dim, fontSize: 14 }}>No players yet — share your code <b style={{ color: C.blue, fontFamily: C.mono, letterSpacing: "0.1em" }}>{game.code}</b> to invite friends.</div>
        </div>
      </Panel>
    );
  }

  const sel = board.find((r) => r.id === selUser) || board.find((r) => r.id === meId) || board[0];

  return (
    <Panel pad={0}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", alignItems: "start" }}>
        {/* rankings */}
        <div style={{ borderRight: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "18px 24px 12px", borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{game.name || "Leaderboard"}</span>
            <span style={{ fontSize: 12.5, color: C.dim }}>{board.length} player{board.length > 1 ? "s" : ""} · code <b style={{ color: C.ink, fontFamily: C.mono, letterSpacing: "0.08em" }}>{game.code}</b></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr 1fr", gap: 8, padding: "12px 24px 10px", fontSize: 11, color: C.dim, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${C.line}` }}>
            <span>Rank</span><span>Player</span><span style={{ textAlign: "right" }}>Value</span><span style={{ textAlign: "right" }}>Return</span>
          </div>
          {board.map((r, i) => {
            const isMe = r.id === meId;
            const medals = ["🥇", "🥈", "🥉"];
            const on = sel.id === r.id;
            return (
              <div key={r.id} onClick={() => setSelUser(r.id)} className="wrow" style={{ display: "grid", gridTemplateColumns: "48px 1fr 1fr 1fr", gap: 8, padding: "13px 24px", alignItems: "center", cursor: "pointer", borderBottom: `1px solid ${C.lineSoft}`, background: on ? "rgba(70,160,255,0.06)" : isMe ? "rgba(184,116,26,0.05)" : "transparent" }}>
                <span style={{ fontSize: i < 3 ? 18 : 13, color: C.muted, fontWeight: 700 }}>{i < 3 ? medals[i] : i + 1}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Avatar name={r.username} size={30} />
                  <span style={{ fontWeight: isMe ? 800 : 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.username}</span>
                  {isMe && <span style={{ fontSize: 9, fontWeight: 700, color: C.amber, padding: "2px 7px", borderRadius: 6, background: C.amberSoft }}>YOU</span>}
                </span>
                <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13.5 }}>{P(r.value)}</span>
                <span style={{ textAlign: "right", fontWeight: 600, fontSize: 13, color: r.ret >= 0 ? C.green : C.red }}>{pct(r.ret)}</span>
              </div>
            );
          })}
        </div>

        {/* selected player */}
        <div style={{ padding: 24, position: "sticky", top: 88 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}>
            <Avatar name={sel.username} size={46} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{sel.username}{sel.id === meId ? " (you)" : ""}</div>
              <div style={{ fontSize: 12.5, color: C.dim }}>Rank #{board.findIndex((r) => r.id === sel.id) + 1} of {board.length}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 28, marginBottom: 20 }}>
            <Stat label="Portfolio Value" value={P(sel.value)} />
            <Stat label="All-Time Return" value={pct(sel.ret)} color={sel.ret >= 0 ? C.green : C.red} />
          </div>
          {/* this player's holdings (read-only) */}
          <div style={{ fontSize: 12, color: C.dim, fontWeight: 700, margin: "20px 0 6px" }}>Holdings</div>
          {(() => {
            const hs = [...(sel.holdings || [])].map((h) => ({ ...h, val: h.shares * priceOf(h.ticker) })).sort((a, b) => b.val - a.val);
            if (hs.length === 0) return <div style={{ fontSize: 12.5, color: C.dim, padding: "6px 0" }}>No holdings yet — all in cash.</div>;
            return hs.map((h) => (
              <div key={h.ticker} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  <Logo ticker={h.ticker} size={26} />
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{h.ticker}</div>
                    <div style={{ fontSize: 11, color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>{detailOf(h.ticker)?.name || h.ticker}</div>
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{P(h.val)}</div>
                  <div style={{ fontSize: 11, color: C.dim }}>{h.shares.toFixed(2)} @ {money(h.avgCost, curOf(h.ticker))}</div>
                </span>
              </div>
            ));
          })()}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0 0", fontSize: 12.5, color: C.dim }}>
            <span>Cash</span><span style={{ fontWeight: 600, color: C.ink }}>{P(sel.cash ?? 0)}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

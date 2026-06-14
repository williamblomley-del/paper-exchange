import { useState } from "react";
import { C } from "../theme.js";
import { P } from "../lib/format.js";
import { createGame, joinGame } from "../lib/supabase.js";

// Post-login lobby: pick one of your games, create a new one (with custom
// starting cash + optional recurring deposit), or join a friend's by code.
const CADENCES = [
  ["daily", "Every day"], ["2d", "Every 2 days"], ["2pw", "Twice a week"],
  ["weekly", "Every week"], ["monthly", "Every month"],
];

export default function GamePicker({ userId, defaultName, memberships, onEnter, refresh, onSignOut }) {
  const [view, setView] = useState("home"); // home | create | join (home always offers both)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  // create form
  const [name, setName] = useState("");
  const [username, setUsername] = useState(defaultName || "");
  const [startCash, setStartCash] = useState("10000");
  const [hasDeposit, setHasDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("150");
  const [depositCadence, setDepositCadence] = useState("daily");

  // join form
  const [code, setCode] = useState("");
  const [joinName, setJoinName] = useState(defaultName || "");

  const input = { width: "100%", padding: "12px 14px", fontSize: 15, background: C.fill, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 12 };
  const label = { fontSize: 12.5, fontWeight: 600, color: C.dim, marginBottom: 6, display: "block" };

  async function doCreate(e) {
    e.preventDefault(); setMsg(null);
    if (username.trim().length < 2) return setMsg({ kind: "err", text: "Pick a display name (2+ chars)." });
    if (!(Number(startCash) > 0)) return setMsg({ kind: "err", text: "Starting cash must be more than 0." });
    setBusy(true);
    const { game, membership, error } = await createGame({
      name, startCash, username,
      depositAmount: hasDeposit ? depositAmount : 0,
      depositCadence: hasDeposit ? depositCadence : null,
    }, userId);
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: error.message || "Couldn't create the game." });
    await refresh();
    onEnter(membership || { id: game?.id });
  }

  async function doJoin(e) {
    e.preventDefault(); setMsg(null);
    if (joinName.trim().length < 2) return setMsg({ kind: "err", text: "Pick a display name (2+ chars)." });
    if (code.trim().length < 4) return setMsg({ kind: "err", text: "Enter the game code." });
    setBusy(true);
    const { membership, error } = await joinGame(code, joinName, userId);
    setBusy(false);
    if (error) return setMsg({ kind: "err", text: error.message || "Couldn't join." });
    await refresh();
    onEnter(membership);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: C.sans, color: C.ink }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg,${C.blue},#6366F1)` }} />
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>PaperExchange</span>
        </div>

        {msg && <div style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13.5, background: msg.kind === "ok" ? C.greenSoft : C.redSoft, color: msg.kind === "ok" ? C.green : C.red }}>{msg.text}</div>}

        {view === "home" && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 6 }}>{memberships.length ? "Your games" : "Welcome 👋"}</div>
            {!memberships.length && <div style={{ fontSize: 13.5, color: C.dim, textAlign: "center", marginBottom: 18 }}>Start your own game, or join a friend's with their code.</div>}
            <div style={{ marginBottom: memberships.length ? 18 : 0 }}>
              {memberships.map((m) => (
                <button key={m.id} onClick={() => onEnter(m)} className="lift" style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", marginBottom: 10, border: `1px solid ${C.line}`, borderRadius: 12, background: C.card, cursor: "pointer" }}>
                  <span>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{m.games?.name || "Game"}</div>
                    <div style={{ fontSize: 12.5, color: C.dim }}>as {m.username} · code {m.games?.code}</div>
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{P(Number(m.cash))}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>cash</div>
                  </span>
                </button>
              ))}
            </div>
            <button onClick={() => { setView("create"); setMsg(null); }} className="trbtn" style={{ width: "100%", padding: "13px 0", fontSize: 15, fontWeight: 700, border: "none", borderRadius: 12, background: C.blue, color: "#fff", marginBottom: 10 }}>Start a new game</button>
            <button onClick={() => { setView("join"); setMsg(null); }} className="btn" style={{ width: "100%", padding: "12px 0", fontSize: 15, fontWeight: 700, border: `1px solid ${C.line}`, borderRadius: 12, background: C.card, color: C.ink }}>Join a game</button>
          </>
        )}

        {view === "create" && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>Start a game</div>
            <div style={{ fontSize: 13.5, color: C.dim, textAlign: "center", marginBottom: 22 }}>Set the rules, then share the code.</div>
            <form onSubmit={doCreate}>
              <label style={label}>Game name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Lads" maxLength={30} className="pi" style={input} />
              <label style={label}>Your display name in this game</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" maxLength={16} className="pi" style={input} />
              <label style={label}>Starting cash (P£) — everyone begins with this</label>
              <input value={startCash} onChange={(e) => setStartCash(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="10000" className="pi" style={input} />

              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0 12px" }}>
                <input id="dep" type="checkbox" checked={hasDeposit} onChange={(e) => setHasDeposit(e.target.checked)} style={{ width: 16, height: 16 }} />
                <label htmlFor="dep" style={{ fontSize: 13.5, fontWeight: 600 }}>Add a recurring deposit (drip-feed cash)</label>
              </div>
              {hasDeposit && (
                <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
                  <label style={label}>Amount each time (P£)</label>
                  <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="150" className="pi" style={input} />
                  <label style={label}>How often</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {CADENCES.map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setDepositCadence(k)} style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 600, border: `1px solid ${depositCadence === k ? C.blue : C.line}`, borderRadius: 999, background: depositCadence === k ? "rgba(70,160,255,0.10)" : C.card, color: depositCadence === k ? C.blue : C.dim }}>{l}</button>
                    ))}
                  </div>
                  {Number(depositAmount) > 0 && (
                    <div style={{ fontSize: 12, color: C.dim, marginTop: 10 }}>Each player gets <b style={{ color: C.ink }}>{P(Number(depositAmount))}</b> {(CADENCES.find((c) => c[0] === depositCadence) || [])[1]?.toLowerCase()}.</div>
                  )}
                </div>
              )}

              <button type="submit" disabled={busy} className="trbtn" style={{ width: "100%", padding: "13px 0", fontSize: 15.5, fontWeight: 700, border: "none", borderRadius: 10, background: C.blue, color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy ? "Creating…" : "Create game"}</button>
            </form>
            <BackRow show={memberships.length > 0} onBack={() => { setView("home"); setMsg(null); }} onSignOut={onSignOut} />
          </>
        )}

        {view === "join" && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>Join a game</div>
            <div style={{ fontSize: 13.5, color: C.dim, textAlign: "center", marginBottom: 22 }}>Enter your friend's game code.</div>
            <form onSubmit={doJoin}>
              <label style={label}>Game code</label>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. 7KQ2M9" maxLength={6} className="pi" style={{ ...input, letterSpacing: "0.15em", fontWeight: 700 }} />
              <label style={label}>Your display name in this game</label>
              <input value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Username" maxLength={16} className="pi" style={input} />
              <button type="submit" disabled={busy} className="trbtn" style={{ width: "100%", padding: "13px 0", fontSize: 15.5, fontWeight: 700, border: "none", borderRadius: 10, background: C.blue, color: "#fff", opacity: busy ? 0.6 : 1 }}>{busy ? "Joining…" : "Join game"}</button>
            </form>
            <BackRow show={memberships.length > 0} onBack={() => { setView("home"); setMsg(null); }} onSignOut={onSignOut} />
          </>
        )}

        {view === "home" && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button onClick={onSignOut} style={{ border: "none", background: "none", color: C.dim, fontWeight: 600, fontSize: 13 }}>Sign out</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BackRow({ show, onBack, onSignOut }) {
  return (
    <div style={{ textAlign: "center", marginTop: 16, display: "flex", gap: 18, justifyContent: "center" }}>
      {show && <button onClick={onBack} style={{ border: "none", background: "none", color: C.blue, fontWeight: 700, fontSize: 13.5 }}>← Your games</button>}
      <button onClick={onSignOut} style={{ border: "none", background: "none", color: C.dim, fontWeight: 600, fontSize: 13.5 }}>Sign out</button>
    </div>
  );
}

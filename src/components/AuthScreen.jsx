import { useState } from "react";
import { C } from "../theme.js";
import { signIn, signUp } from "../lib/supabase.js";

// Account auth only (email + password). Creating / joining games happens AFTER
// sign-in, in the GamePicker — so one account can run many games. `username`
// here is just a default display name that pre-fills the per-game name.
export default function AuthScreen() {
  const [mode, setMode] = useState("signup"); // signup | signin
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const inputStyle = { width: "100%", padding: "12px 14px", fontSize: 15, background: C.fill, border: `1px solid ${C.line}`, borderRadius: 10, marginBottom: 12 };

  async function submit(e) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signIn(email.trim(), password);
        if (error) throw new Error("Wrong email or password.");
      } else {
        if (username.trim().length < 2 || username.trim().length > 16) throw new Error("Name must be 2–16 characters.");
        if (!email.includes("@")) throw new Error("Enter a valid email.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
        const { data, error } = await signUp(email.trim(), password, username.trim());
        if (error) throw new Error(error.message.includes("registered") ? "That email already has an account — sign in instead." : error.message);
        if (!data.session) { setMsg({ kind: "ok", text: "Account made! Check your email to confirm, then sign in." }); setMode("signin"); }
      }
    } catch (e2) {
      setMsg({ kind: "err", text: e2.message || "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: C.sans, color: C.ink }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: `linear-gradient(135deg,${C.blue},#6366F1)` }} />
          <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>PaperExchange</span>
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center", marginBottom: 4 }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </div>
        <div style={{ fontSize: 13.5, color: C.dim, textAlign: "center", marginBottom: 22 }}>
          {mode === "signup" ? "Then start a game or join your friends'." : "Sign in to your games."}
        </div>

        {msg && <div style={{ padding: "11px 14px", borderRadius: 10, marginBottom: 14, fontSize: 13.5, background: msg.kind === "ok" ? C.greenSoft : C.redSoft, color: msg.kind === "ok" ? C.green : C.red, border: `1px solid ${msg.kind === "ok" ? "rgba(12,175,113,.18)" : "rgba(229,72,77,.18)"}` }}>{msg.text}</div>}

        <form onSubmit={submit}>
          {mode === "signup" && <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Display name" maxLength={16} className="pi" style={inputStyle} />}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="pi" style={inputStyle} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="pi" style={inputStyle} />
          <button type="submit" disabled={busy} className="trbtn" style={{ width: "100%", padding: "13px 0", fontSize: 15.5, fontWeight: 700, border: "none", borderRadius: 10, background: C.blue, color: "#fff", opacity: busy ? 0.6 : 1, marginTop: 2 }}>
            {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <div style={{ textAlign: "center", fontSize: 13.5, color: C.dim, marginTop: 18 }}>
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMsg(null); }} style={{ border: "none", background: "none", color: C.blue, fontWeight: 700, fontSize: 13.5 }}>
            {mode === "signup" ? "Sign in" : "Create account"}
          </button>
        </div>
      </div>
    </div>
  );
}

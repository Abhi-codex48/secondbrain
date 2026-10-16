import { useState } from "react";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabase";
import { errMsg } from "../components/ui";

export function Auth() {
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href.split("#")[0] } });
        if (error) throw error;
        if (!data.session) setMsg({ ok: true, text: "Check your email to confirm your account, then sign in." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.href.split("#")[0] });
        if (error) throw error;
        setMsg({ ok: true, text: "If this email has an account, a reset link has been sent." });
      }
    } catch (err) {
      setMsg({ ok: false, text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <form className="card" onSubmit={submit}>
        <div className="brand" style={{ fontSize: "1.3rem" }}>
          <img src="./icon.svg" alt="" style={{ width: 40, height: 40 }} />
          <span>Second Brain</span>
        </div>
        <p className="muted">{mode === "in" ? "Sign in to your private study notes." : mode === "up" ? "Create your private account." : "Reset your password."}</p>
        <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" />
        {mode !== "reset" && (
          <input className="input" type="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (8+ characters)" aria-label="Password" />
        )}
        {msg && <p className={msg.ok ? "" : "muted"} style={{ color: msg.ok ? "var(--ok)" : "var(--bad)", fontWeight: 700 }}>{msg.text}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : mode === "up" ? <UserPlus size={18} /> : <LogIn size={18} />}
          {mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
        </button>
        <div className="between tiny">
          {mode === "in" ? (
            <>
              <button type="button" style={{ color: "var(--accent)", fontWeight: 800 }} onClick={() => setMode("up")}>Create account</button>
              <button type="button" style={{ color: "var(--ink-2)", fontWeight: 700 }} onClick={() => setMode("reset")}>Forgot password?</button>
            </>
          ) : (
            <button type="button" style={{ color: "var(--accent)", fontWeight: 800 }} onClick={() => setMode("in")}>Back to sign in</button>
          )}
        </div>
      </form>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="auth">
      <div className="card">
        <div className="brand" style={{ fontSize: "1.3rem" }}><img src="./icon.svg" alt="" style={{ width: 40, height: 40 }} /><span>Second Brain</span></div>
        <h2>Almost ready</h2>
        <p className="muted">This copy of the app isn't connected to a database yet. Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> as described in the README, then rebuild.</p>
      </div>
    </div>
  );
}

export function NewPassword({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="auth">
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.updateUser({ password: pw });
        if (error) setErr(error.message);
        else onDone();
      }}>
        <h2>Set a new password</h2>
        <input className="input" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" aria-label="New password" autoComplete="new-password" />
        {err && <p style={{ color: "var(--bad)" }}>{err}</p>}
        <button className="btn primary block">Save password</button>
      </form>
    </div>
  );
}

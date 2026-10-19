import { useState } from "react";
import { Globe2, Loader2, Lock, Newspaper, PenLine } from "lucide-react";
import { signInWithGoogle } from "../lib/firebase";
import { errMsg } from "../components/ui";

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export function Auth() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await signInWithGoogle();
    } catch (e) {
      const m = errMsg(e);
      setErr(/unauthorized-domain/.test(m) ? "This website address isn't allowed yet. In Firebase → Authentication → Settings → Authorized domains, add this site's domain." : m);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth">
      <i className="blob b1" aria-hidden="true" />
      <i className="blob b2" aria-hidden="true" />
      <i className="blob b3" aria-hidden="true" />
      <main className="auth-card">
        <img className="auth-logo" src="./icon.svg" alt="" />
        <h1>Second Brain</h1>
        <p className="auth-lead">Your news, notes and handwriting, in one private place.</p>
        <ul className="auth-points">
          <li style={{ ["--c" as string]: "var(--news-2)" }}><span><Newspaper size={18} /></span>Every section of 13 newspapers and PIB, with full articles and key points</li>
          <li style={{ ["--c" as string]: "var(--more-1)" }}><span><Globe2 size={18} /></span>A daily world briefing: wars, economies, markets and On this day</li>
          <li style={{ ["--c" as string]: "var(--notes-1)" }}><span><PenLine size={18} /></span>Notes, handwriting, and a pen to mark up any page</li>
          <li style={{ ["--c" as string]: "var(--notes-2)" }}><span><Lock size={18} /></span>Private to your Google account and synced on all your devices</li>
        </ul>
        <button className="btn auth-google" onClick={go} disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : <GoogleIcon />}
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
        {err && <p className="auth-err" role="alert">{err}</p>}
        <p className="tiny auth-fine">Free, with no ads. Download or delete everything any time from Settings.</p>
      </main>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="auth">
      <div className="card">
        <div className="brand" style={{ fontSize: "1.3rem" }}><img src="./icon.svg" alt="" style={{ width: 40, height: 40 }} /><span>Second Brain</span></div>
        <h2>Sign-in is being set up</h2>
        <p className="muted">Please check back shortly.</p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
      <div className="card">
        <div className="brand" style={{ fontSize: "1.3rem" }}>
          <img src="./icon.svg" alt="" style={{ width: 40, height: 40 }} />
          <span>Second Brain</span>
        </div>
        <p className="muted">Your private UPSC notes and daily news. Sign in to sync across your phone, tablet and laptop.</p>
        <button className="btn line block" style={{ minHeight: 52 }} onClick={go} disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" /> : <GoogleIcon />}
          Continue with Google
        </button>
        {err && <p style={{ color: "var(--bad)", fontWeight: 700 }}>{err}</p>}
        <p className="tiny">Only you can see your notes. They are stored in your own Firebase project.</p>
      </div>
    </div>
  );
}

export function NotConfigured() {
  return (
    <div className="auth">
      <div className="card">
        <div className="brand" style={{ fontSize: "1.3rem" }}><img src="./icon.svg" alt="" style={{ width: 40, height: 40 }} /><span>Second Brain</span></div>
        <h2>Almost ready</h2>
        <p className="muted">This copy of the app isn't connected to Firebase yet. Add your Firebase web settings to <code>src/firebase-config.ts</code> (see the README).</p>
      </div>
    </div>
  );
}

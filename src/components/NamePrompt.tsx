import { useState } from "react";
import { Sparkles } from "lucide-react";
import { googleFirstName, setName, shouldAskName, skipName } from "../lib/profile";

/** Asks your name once on this browser, to greet you by it. */
export function NamePrompt() {
  const [open, setOpen] = useState(shouldAskName);
  const [v, setV] = useState(googleFirstName);
  if (!open) return null;
  const save = () => { if (v.trim()) setName(v); else skipName(); setOpen(false); };
  return (
    <>
      <div className="scrim" />
      <form className="sheet name-sheet" role="dialog" aria-label="Your name" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <span className="name-ic"><Sparkles size={22} /></span>
        <h2>Welcome to Second Brain!</h2>
        <p className="muted">What should we call you?</p>
        <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={40} autoComplete="given-name" />
        <button className="btn primary block" type="submit">{v.trim() ? `Continue as ${v.trim()}` : "Continue"}</button>
        <button className="btn soft block" type="button" onClick={() => { skipName(); setOpen(false); }}>Skip</button>
        <p className="tiny">Kept only in this browser. Change it anytime in Settings.</p>
      </form>
    </>
  );
}

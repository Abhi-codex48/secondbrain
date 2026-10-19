import { useState } from "react";
import { Link2, Copy, Share2, X, Loader2, Check, Clock } from "lucide-react";
import { createShare, shareUrl, type ShareInput } from "../lib/api";
import { fmtDate, fmtTime } from "../lib/date";
import { errMsg, useToast } from "./ui";

const PRESETS: [string, number | null][] = [["1 hour", 1], ["1 day", 24], ["7 days", 168], ["30 days", 720], ["No expiry", null]];

/**
 * Share any item as a link that opens straight to it (and to the passage, if
 * one was selected), valid for as long as you choose. Asks whether to keep the
 * item in your Library too.
 */
export function ShareDialog({ input, keep, onClose }: {
  input: ShareInput;
  /** How to keep this item in the Library; leave out when it is already there (a note). */
  keep?: { label: string; run: () => Promise<unknown> };
  onClose: () => void;
}) {
  const [hours, setHours] = useState<number | null>(24);
  const [custom, setCustom] = useState(false);
  const [n, setN] = useState("3");
  const [unit, setUnit] = useState<"hours" | "days">("days");
  const [alsoKeep, setAlsoKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expires: string | null } | null>(null);
  const toast = useToast();

  const validity = custom ? Math.max(1, Math.min(24 * 365, Number(n) * (unit === "days" ? 24 : 1) || 0)) : hours;
  const create = async () => {
    if (custom && !(Number(n) > 0)) return toast("Enter how long the link should work", { bad: true });
    setBusy(true);
    try {
      const sh = await createShare(input, validity);
      if (keep && alsoKeep) await keep.run().catch(() => {});
      setLink({ url: shareUrl(sh.id), expires: sh.expires_at });
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link!.url); toast("Link copied"); } catch { toast("Couldn't copy; select the link and copy it", { bad: true }); }
  };
  const send = async () => {
    try { await navigator.share({ title: input.title, url: link!.url }); } catch { /* cancelled */ }
  };

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet share-sheet" role="dialog" aria-label="Share">
        <div className="between"><h2 className="row"><Link2 size={20} />Share</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
        <p className="share-what">{input.focus ? <>“{input.focus.slice(0, 160)}{input.focus.length > 160 ? "…" : ""}”<span className="tiny"> from {input.title}</span></> : input.title}</p>

        {!link ? (
          <>
            <div className="stack" style={{ gap: 8 }}>
              <b className="row" style={{ gap: 6 }}><Clock size={16} />Link works for</b>
              <div className="chips wrap">
                {PRESETS.map(([label, h]) => (
                  <button key={label} className={`chip ${!custom && hours === h ? "on" : ""}`} onClick={() => { setCustom(false); setHours(h); }}>{label}</button>
                ))}
                <button className={`chip ${custom ? "on" : ""}`} onClick={() => setCustom(true)}>Custom</button>
              </div>
              {custom && (
                <div className="row share-custom">
                  <input className="input" type="number" min={1} max={365} inputMode="numeric" value={n} onChange={(e) => setN(e.target.value)} aria-label="How long" />
                  <select className="select" value={unit} onChange={(e) => setUnit(e.target.value as "hours" | "days")} aria-label="Unit"><option value="hours">hours</option><option value="days">days</option></select>
                </div>
              )}
              <span className="tiny">{validity ? `After that, the link stops working.` : "The link works until you remove it in Settings → Shared links."}</span>
            </div>
            {keep && (
              <label className="share-keep">
                <input type="checkbox" checked={alsoKeep} onChange={(e) => setAlsoKeep(e.target.checked)} />
                <span><b>Keep it in your Library too?</b><span className="tiny"> Since you're sharing this, it will also be saved to {keep.label}.</span></span>
              </label>
            )}
            <button className="btn primary block" onClick={create} disabled={busy}>{busy ? <Loader2 size={17} className="spin" /> : <Link2 size={17} />}Create link</button>
            <p className="tiny">Anyone with the link can open this item (no sign-in needed). The rest of your notes stay private.</p>
          </>
        ) : (
          <>
            <div className="share-link"><Check size={18} color="var(--ok)" /><input className="input" readOnly value={link.url} onFocus={(e) => e.target.select()} aria-label="Share link" /></div>
            <div className="row">
              <button className="btn soft" onClick={copy}><Copy size={16} />Copy link</button>
              {"share" in navigator && <button className="btn primary" onClick={send}><Share2 size={16} />Send via apps</button>}
            </div>
            <span className="tiny">{link.expires ? `Works until ${fmtDate(link.expires)}, ${fmtTime(link.expires)}.` : "Works until you remove it."}{keep && alsoKeep ? ` Also saved to ${keep.label}.` : ""}</span>
          </>
        )}
      </div>
    </>
  );
}

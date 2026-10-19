import { useEffect, useRef, useState } from "react";
import { Palette, Newspaper, DatabaseBackup, HardDrive, User, Download, Upload, FileArchive, Loader2, CheckCircle2, AlertTriangle, LogOut, Trash2, CircleHelp, Link2, Copy, Pencil } from "lucide-react";
import { deleteEverything, deleteOldNewsData, emptyTrash, listMyShares, newsHealth, revokeShare, shareUrl, storageUsage, type Share } from "../lib/api";
import { downloadJsonBackup, downloadMarkdownZip, restoreBackup } from "../lib/backup";
import { auth, confirmIdentity, deleteAccount, signOut } from "../lib/firebase";
import { getName, initials, setName } from "../lib/profile";
import { applyTheme, currentTheme, PALETTES, type PaletteId } from "../lib/theme";
import type { Source } from "../lib/types";
import { fmtDate, fmtTime, relTime } from "../lib/date";
import { errMsg, Skeleton, useConfirm, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

const MB = 1024 * 1024;
const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < MB ? `${(b / 1024).toFixed(1)} KB` : `${(b / MB).toFixed(1)} MB`);
// Firestore free (Spark) plan: about 1 GiB stored. Check the Firebase console for exact usage.
const DB_LIMIT = 1024 * MB;

/** A settings group that opens on tap, like a phone's settings app. */
function Section({ icon, title, sub, children, color, open }: { icon: React.ReactNode; title: string; sub?: React.ReactNode; children: React.ReactNode; color: string; open?: boolean }) {
  return (
    <details className="sset" open={open} style={{ ["--s" as string]: color }}>
      <summary>
        <span className="sic">{icon}</span>
        <span className="stt"><b>{title}</b>{sub && <span className="tiny">{sub}</span>}</span>
      </summary>
      <div className="sbody">{children}</div>
    </details>
  );
}

function Profile() {
  const [name, setNameState] = useState(getName);
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(name);
  const u = auth.currentUser;
  const save = () => { setName(v); setNameState(v.trim()); setEditing(false); };
  return (
    <section className="profile-card">
      <span className="profile-av">{u?.photoURL ? <img src={u.photoURL} alt="" referrerPolicy="no-referrer" /> : initials(name, u?.email ?? "")}</span>
      <div className="profile-info">
        {editing ? (
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} maxLength={40} aria-label="Your name" />
            <button className="btn primary sm">Save</button>
          </form>
        ) : (
          <b className="profile-name">{name || "Add your name"}</b>
        )}
        <span className="tiny">{u?.email}</span>
      </div>
      {!editing && <button className="icon-btn" onClick={() => { setV(name); setEditing(true); }} aria-label="Edit your name" title="Edit your name"><Pencil size={18} /></button>}
    </section>
  );
}

export function Settings() {
  const [theme, setTheme] = useState(currentTheme());
  const [health, setHealth] = useState<{ generatedAt: string | null; sources: Source[] } | null>(null);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof storageUsage>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const email = auth.currentUser?.email ?? "";

  const refresh = () => {
    newsHealth().then(setHealth).catch(() => setHealth({ generatedAt: null, sources: [] }));
    storageUsage().then(setUsage).catch(() => setUsage(null));
  };
  useEffect(() => {
    setTitle("Settings");
    refresh();
    const upd = () => setTheme(currentTheme());
    window.addEventListener("sb-theme", upd);
    return () => window.removeEventListener("sb-theme", upd);
  }, []);

  const pickTheme = (p: PaletteId) => setTheme(applyTheme(p, theme.mode));

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast(done);
      refresh();
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setBusy(null);
    }
  };

  const onRestore = async (f?: File) => {
    if (!f) return;
    if (!(await confirm({ title: "Restore this backup?", body: "Notes, folders and tasks from the file are added back. Items that already exist are replaced by the backup's version; nothing else is deleted. Restoring the same file twice does not create duplicates.", confirm: "Restore" }))) {
      if (file.current) file.current.value = "";
      return;
    }
    setBusy("restore");
    setRestoreMsg("Reading file…");
    try {
      const counts = await restoreBackup(f, setRestoreMsg);
      setRestoreMsg(`Restored ${counts.notes ?? 0} notes, ${counts.folders ?? 0} folders and ${counts.todos ?? 0} tasks.`);
      refresh();
    } catch (e) {
      setRestoreMsg(null);
      toast(errMsg(e), { bad: true });
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  };

  const wipe = async () => {
    if (!(await confirm({ title: "Delete everything?", body: "All notes, folders, tasks and saved news in your account will be permanently deleted. Download a backup first if you may need them.", confirm: "Delete everything", danger: true, typeToConfirm: "DELETE" }))) return;
    await run("all", deleteEverything, "Everything was deleted");
  };

  const removeAccount = async () => {
    if (!(await confirm({ title: "Delete your account?", body: "All your notes, handwriting, folders, tasks and saved news are permanently deleted from our servers, and your sign-in is removed. This cannot be undone. Download a backup first if you may need anything. You'll be asked to confirm with Google.", confirm: "Delete my account", danger: true, typeToConfirm: "DELETE" }))) return;
    setBusy("account");
    try {
      await confirmIdentity();
      await deleteEverything();
      await deleteAccount();
      try { localStorage.clear(); } catch { /* ignore */ }
      toast("Your account and all your data were deleted");
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      toast(code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" ? "Account not deleted: Google confirmation was cancelled" : code === "auth/user-mismatch" ? "Please confirm with the same Google account you're signed in with" : errMsg(e), { bad: true });
    } finally {
      setBusy(null);
    }
  };

  const total = usage ? usage.notes_bytes + usage.trash_bytes + usage.other_bytes : 0;

  return (
    <div className="page">
      <h1>Settings</h1>
      <Profile />

      <h3 className="sgroup">Personalise</h3>
      <Section icon={<Palette size={19} />} title="Appearance" sub={`${PALETTES.find((p) => p.id === theme.palette)?.name ?? ""} · ${theme.mode === "reading" ? "Reading" : theme.mode === "dark" ? "Dark" : "Light"} mode`} color="var(--notes-1)">
        <div className="palette-pick">
          {PALETTES.map((p) => (
            <button key={p.id} className={theme.palette === p.id ? "on" : ""} onClick={() => pickTheme(p.id)}>
              <span className="sw">{p.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span>
              {p.name}
            </button>
          ))}
        </div>
        <p className="tiny">Light, Reading and Dark mode: tap the theme button at the top of any screen.</p>
      </Section>

      <h3 className="sgroup">Content</h3>
      <Section icon={<Newspaper size={19} />} title="News sources" sub={health ? `${health.sources.filter((x) => x.ok).length} of ${health.sources.length} working · updated ${relTime(health.generatedAt)}` : "Checking…"} color="var(--news-2)">
        <p className="tiny">Headlines are collected every hour from each paper's section feeds and filed under the paper's own section. If all of a paper's feeds fail, its headlines come from Google News and are filed under Top stories.</p>
        {health === null ? <Skeleton /> : health.sources.length === 0 ? <p className="muted">The first hourly news update hasn't run yet.</p> : (
          <div>
            <p className="tiny">Last update {relTime(health.generatedAt)}</p>
            {health.sources.map((s) => (
              <div key={s.key} className="set-row">
                <div className="grow stack" style={{ gap: 2 }}>
                  <b>{s.name}</b>
                  <span className="tiny">{s.ok ? `${s.count} headlines${s.fallback ? " · via Google News" : ""}` : <span style={{ color: "var(--warn)" }}>Not responding{s.error ? `: ${s.error.slice(0, 120)}` : ""}</span>}</span>
                </div>
                {s.ok ? <CheckCircle2 size={18} color="var(--ok)" /> : <AlertTriangle size={18} color="var(--warn)" />}
              </div>
            ))}
          </div>
        )}
      </Section>

      <SharedLinks />

      <h3 className="sgroup">Your data</h3>
      <Section icon={<DatabaseBackup size={19} />} title="Backup and restore" sub="Download, export or restore everything" color="var(--more-1)">
        <p className="tiny">The backup file contains everything: notes with their images and handwriting, folders, tasks, saved news and dates. Version history is not included.</p>
        <div className="row">
          <button className="btn primary" onClick={() => run("json", downloadJsonBackup, "Backup downloaded")} disabled={!!busy}>{busy === "json" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}Download backup</button>
          <button className="btn line" onClick={() => run("md", downloadMarkdownZip, "Export downloaded")} disabled={!!busy}>{busy === "md" ? <Loader2 size={17} className="spin" /> : <FileArchive size={17} />}Export as Markdown (.zip)</button>
          <button className="btn line" onClick={() => file.current?.click()} disabled={!!busy}>{busy === "restore" ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}Restore from backup</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onRestore(e.target.files?.[0])} />
        </div>
        {restoreMsg && <p className="row tiny" style={{ color: busy ? "var(--ink-2)" : "var(--ok)" }}>{busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}{restoreMsg}</p>}
      </Section>

      <Section icon={<HardDrive size={19} />} title="Storage" sub={usage ? `${fmtBytes(total)} used of about 1 GB` : "Calculating…"} color="var(--warn)">
        {!usage ? <Skeleton /> : (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <div className="between"><b>Your data</b><span className="tiny">{fmtBytes(total)} of about 1 GB (Firebase free plan)</span></div>
              <div className="meter"><i style={{ width: `${Math.max(1, Math.min(100, (total / DB_LIMIT) * 100))}%` }} /></div>
              <span className="tiny">Notes {fmtBytes(usage.notes_bytes)} ({usage.notes_count}) · Trash {fmtBytes(usage.trash_bytes)} ({usage.trash_count}) · News and other {fmtBytes(usage.other_bytes)}</span>
            </div>
            <p className="tiny">An estimate from this device; the Firebase console shows exact usage.</p>
            <h3>Free up space</h3>
            <div className="row">
              <button className="btn soft sm" disabled={!!busy} onClick={() => run("news", () => deleteOldNewsData(30), "Old news marks and pasted text deleted")}>Delete news data older than 30 days</button>
              <button className="btn soft sm" disabled={!!busy || !usage.trash_count} onClick={async () => { if (await confirm({ title: "Empty Trash?", body: `${usage.trash_count} notes will be permanently deleted.`, confirm: "Empty Trash", danger: true })) run("trash", emptyTrash, "Trash emptied"); }}>Empty Trash</button>
            </div>
            <div className="alert bad" style={{ marginTop: 6 }}>
              <AlertTriangle size={20} color="var(--bad)" />
              <div className="stack" style={{ gap: 8 }}>
                <span>Delete all your data from this account.</span>
                <button className="btn danger sm" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={wipe}>Delete everything…</button>
              </div>
            </div>
          </>
        )}
      </Section>

      <h3 className="sgroup">Help</h3>
      <a className="sset slink" href="#/guide" style={{ ["--s" as string]: "var(--accent)" }}>
        <span className="sic"><CircleHelp size={19} /></span>
        <span className="stt"><b>How it works</b><span className="tiny">Every feature, in a few lines each</span></span>
      </a>

      <h3 className="sgroup">Account</h3>
      <button className="sset slink" onClick={() => signOut()} style={{ ["--s" as string]: "var(--ink-2)" }}>
        <span className="sic"><LogOut size={19} /></span>
        <span className="stt"><b>Sign out</b><span className="tiny">{email}</span></span>
      </button>
      <Section icon={<User size={19} />} title="Delete account" sub="Remove your account and all its data" color="var(--bad)">
        <div className="alert bad">
          <Trash2 size={20} color="var(--bad)" />
          <div className="stack" style={{ gap: 8 }}>
            <b>Delete account</b>
            <span className="tiny">Permanently deletes your account and every note, drawing, folder, task and saved article in it. Signing out does not delete anything.</span>
            <button className="btn danger sm" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={removeAccount}>{busy === "account" ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}Delete my account…</button>
          </div>
        </div>
      </Section>
    </div>
  );
}

/** Every link you shared, with when it stops working; remove any at once. */
function SharedLinks() {
  const [items, setItems] = useState<Share[] | null>(null);
  const toast = useToast();
  useEffect(() => { listMyShares().then(setItems).catch(() => setItems([])); }, []);
  const live = (x: Share) => !x.expires_at || Date.parse(x.expires_at) > Date.now();
  return (
    <Section icon={<Link2 size={19} />} title="Shared links" sub={items ? `${items.filter(live).length} active` : "Loading…"} color="var(--notes-2)">
      {items === null ? <Skeleton /> : items.length === 0 ? <p className="tiny">Links you share from a note, an article or a selected passage appear here. You can turn any of them off.</p> : (
        <ul className="rlist">
          {items.map((x) => (
            <li key={x.id} className="rrow">
              <div className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                <span className="t">{x.focus ? `“${x.focus.slice(0, 80)}${x.focus.length > 80 ? "…" : ""}”` : x.title}</span>
                <span className="tiny">{live(x) ? (x.expires_at ? `Works until ${fmtDate(x.expires_at)}, ${fmtTime(x.expires_at)}` : "No expiry") : "Expired"} · shared {relTime(x.created_at)}</span>
              </div>
              {live(x) && <button className="icon-btn sm" aria-label="Copy link" title="Copy link" onClick={() => navigator.clipboard.writeText(shareUrl(x.id)).then(() => toast("Link copied")).catch(() => {})}><Copy size={15} /></button>}
              <button className="icon-btn sm" aria-label={live(x) ? "Turn off this link" : "Remove from list"} title={live(x) ? "Turn off this link" : "Remove"} onClick={async () => {
                await revokeShare(x.id).catch((e) => toast(errMsg(e), { bad: true }));
                setItems((xs) => xs?.filter((y) => y.id !== x.id) ?? null);
                toast(live(x) ? "Link turned off" : "Removed");
              }}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

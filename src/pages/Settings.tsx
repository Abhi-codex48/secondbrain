import { useEffect, useRef, useState } from "react";
import { Palette, Sun, Moon, Newspaper, DatabaseBackup, HardDrive, User, Download, Upload, FileArchive, Loader2, CheckCircle2, AlertTriangle, LogOut } from "lucide-react";
import { deleteEverything, deleteOldNewsData, emptyTrash, newsHealth, storageUsage } from "../lib/api";
import { downloadJsonBackup, downloadMarkdownZip, restoreBackup } from "../lib/backup";
import { auth, clearLocalConfig, signOut } from "../lib/firebase";
import { applyTheme, currentTheme, PALETTES, type Mode, type PaletteId } from "../lib/theme";
import type { Source } from "../lib/types";
import { relTime } from "../lib/date";
import { errMsg, Skeleton, useConfirm, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

const MB = 1024 * 1024;
const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < MB ? `${(b / 1024).toFixed(1)} KB` : `${(b / MB).toFixed(1)} MB`);
// Firestore free (Spark) plan: about 1 GiB stored. Check the Firebase console for exact usage.
const DB_LIMIT = 1024 * MB;

function Section({ icon, title, children, color }: { icon: React.ReactNode; title: string; children: React.ReactNode; color: string }) {
  return (
    <section className="card pad-lg stack">
      <h2 className="row" style={{ gap: 10 }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{icon}</span>
        {title}
      </h2>
      {children}
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
  }, []);

  const pickTheme = (p?: PaletteId, m?: Mode) => setTheme(applyTheme(p ?? theme.palette, m ?? theme.mode));

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

  const total = usage ? usage.notes_bytes + usage.trash_bytes + usage.other_bytes : 0;

  return (
    <div className="page">
      <h1>Settings</h1>

      <Section icon={<Palette size={19} />} title="Appearance" color="var(--notes-1)">
        <div className="palette-pick">
          {PALETTES.map((p) => (
            <button key={p.id} className={theme.palette === p.id ? "on" : ""} onClick={() => pickTheme(p.id)}>
              <span className="sw">{p.swatch.map((c) => <i key={c} style={{ background: c }} />)}</span>
              {p.name}
            </button>
          ))}
        </div>
        <div className="seg" style={{ maxWidth: 320 }}>
          <button className={theme.mode === "light" ? "on" : ""} onClick={() => pickTheme(undefined, "light")}><Sun size={17} />Light</button>
          <button className={theme.mode === "dark" ? "on" : ""} onClick={() => pickTheme(undefined, "dark")}><Moon size={17} />Dark</button>
        </div>
      </Section>

      <Section icon={<Newspaper size={19} />} title="News sources" color="var(--news-2)">
        <p className="tiny">Headlines are collected automatically every hour from the newspapers' public feeds. Sports, entertainment and shopping stories are left out. If a paper's own feed fails, its headlines come from Google News instead.</p>
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

      <Section icon={<DatabaseBackup size={19} />} title="Backup and restore" color="var(--more-1)">
        <p className="tiny">The backup file contains everything: notes with their images and handwriting, folders, tasks, saved news and dates. Version history is not included.</p>
        <div className="row">
          <button className="btn primary" onClick={() => run("json", downloadJsonBackup, "Backup downloaded")} disabled={!!busy}>{busy === "json" ? <Loader2 size={17} className="spin" /> : <Download size={17} />}Download backup</button>
          <button className="btn line" onClick={() => run("md", downloadMarkdownZip, "Export downloaded")} disabled={!!busy}>{busy === "md" ? <Loader2 size={17} className="spin" /> : <FileArchive size={17} />}Export as Markdown (.zip)</button>
          <button className="btn line" onClick={() => file.current?.click()} disabled={!!busy}>{busy === "restore" ? <Loader2 size={17} className="spin" /> : <Upload size={17} />}Restore from backup</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onRestore(e.target.files?.[0])} />
        </div>
        {restoreMsg && <p className="row tiny" style={{ color: busy ? "var(--ink-2)" : "var(--ok)" }}>{busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}{restoreMsg}</p>}
      </Section>

      <Section icon={<HardDrive size={19} />} title="Storage" color="var(--warn)">
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

      <Section icon={<User size={19} />} title="Account" color="var(--ink-2)">
        <div className="between">
          <span className="muted">{email}</span>
          <button className="btn line" onClick={() => signOut()}><LogOut size={17} />Sign out</button>
        </div>
        <button className="btn soft sm" style={{ alignSelf: "flex-start" }} onClick={async () => { if (await confirm({ title: "Disconnect this device?", body: "Signs out and removes the Firebase settings saved on this device. Your notes stay safe in Firebase.", confirm: "Disconnect" })) { await signOut(); clearLocalConfig(); window.location.reload(); } }}>Disconnect this device from Firebase</button>
      </Section>
    </div>
  );
}

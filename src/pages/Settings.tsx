import { useEffect, useRef, useState } from "react";
import { Palette, Sun, Moon, Newspaper, Sparkles, DatabaseBackup, HardDrive, User, Download, Upload, FileArchive, Loader2, CheckCircle2, AlertTriangle, LogOut, Pencil } from "lucide-react";
import { deleteOldNews, deleteOldVersions, deleteUnusedImages, emptyTrash, lastSync, listSources, storageUsage, updateSource, type Usage } from "../lib/api";
import { downloadJsonBackup, downloadMarkdownZip, restoreBackup } from "../lib/backup";
import { supabase } from "../lib/supabase";
import { applyTheme, currentTheme, PALETTES, type Mode, type PaletteId } from "../lib/theme";
import type { Source } from "../lib/types";
import { relTime } from "../lib/date";
import { errMsg, Sheet, Skeleton, useConfirm, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

const MB = 1024 * 1024;
const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < MB ? `${(b / 1024).toFixed(1)} KB` : `${(b / MB).toFixed(1)} MB`);
// Supabase free plan limits as published at build time; check your dashboard for current values.
const DB_LIMIT = 500 * MB;
const FILE_LIMIT = 1024 * MB;

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
  const [sources, setSources] = useState<Source[] | null>(null);
  const [editing, setEditing] = useState<Source | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [ai, setAi] = useState<{ ai_count: number; ai_day: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const refresh = () => {
    listSources().then(setSources).catch(() => setSources([]));
    storageUsage().then(setUsage).catch(() => setUsage(null));
    lastSync().then((s) => setAi(s ? { ai_count: s.ai_count, ai_day: s.ai_day } : null)).catch(() => {});
  };
  useEffect(() => {
    setTitle("Settings");
    refresh();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
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

  const toggleSource = (s: Source) => run(`src-${s.key}`, () => updateSource(s.key, { enabled: !s.enabled }));

  const onRestore = async (f?: File) => {
    if (!f) return;
    if (!(await confirm({ title: "Restore this backup?", body: "Notes, folders and tasks from the file are added back. Items that already exist are updated to the backup's version; nothing else is deleted. Restoring the same file twice does not create duplicates.", confirm: "Restore" }))) {
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

  const deleteEverything = async () => {
    if (!(await confirm({ title: "Delete everything?", body: "All notes, folders, tasks, news and images in your account will be permanently deleted. Download a backup first if you may need them.", confirm: "Delete everything", danger: true, typeToConfirm: "DELETE" }))) return;
    await run("all", async () => {
      for (const t of ["note_versions", "notes", "folders", "todos", "news_items"]) {
        const { error } = await supabase.from(t).delete().not("id", "is", null);
        if (error) throw new Error(error.message);
      }
      const { data: u } = await supabase.auth.getUser();
      const { data: files } = await supabase.storage.from("attachments").list(u.user!.id, { limit: 1000 });
      if (files?.length) await supabase.storage.from("attachments").remove(files.map((f) => `${u.user!.id}/${f.name}`));
    }, "Everything was deleted");
  };

  const dbBytes = usage ? usage.notes_bytes + usage.trash_bytes + usage.versions_bytes + usage.news_bytes : 0;

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
        <p className="tiny">News is checked when you open News (at most once an hour) or when you tap Refresh. Only UPSC-related headlines are kept, and unsaved news older than 14 days is removed automatically. If a paper's own feed fails, its headlines come from Google News instead.</p>
        {sources === null ? <Skeleton /> : sources.length === 0 ? <p className="muted">Open the News page once to set up the default sources.</p> : (
          <div>
            {sources.map((s) => (
              <div key={s.key} className="set-row">
                <div className="grow stack" style={{ gap: 2 }}>
                  <b>{s.name}</b>
                  <span className="tiny">
                    {!s.enabled ? "Off" : s.last_error && !s.last_count ? <span style={{ color: "var(--warn)" }}>Not responding: {s.last_error.slice(0, 120)}</span> : s.last_ok_at ? `OK ${relTime(s.last_ok_at)}${s.used_fallback ? " · via Google News (headlines only)" : ""} · ${s.last_count ?? 0} new last time` : "Not checked yet"}
                  </span>
                </div>
                <button className="icon-btn sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.name} feeds`}><Pencil size={16} /></button>
                <button className="switch" role="switch" aria-checked={s.enabled} aria-label={`${s.name} on or off`} onClick={() => toggleSource(s)} disabled={busy === `src-${s.key}`} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section icon={<Sparkles size={19} />} title="AI summaries" color="var(--accent)">
        <p className="muted">Summaries use the free tier of Google Gemini, set up on your server. Google may use what is sent on the free tier to improve its products. Only the article text, or the typed text of a note when you tap "Summarise with AI", is sent. Handwriting and other notes are never sent. There is no paid fallback.</p>
        <p className="tiny">Today: {ai && ai.ai_day ? ai.ai_count : 0} AI requests used (app limit 150 per day; Gemini's own free daily limit also applies).</p>
      </Section>

      <Section icon={<DatabaseBackup size={19} />} title="Backup and restore" color="var(--more-1)">
        <p className="tiny">The JSON backup restores everything: notes, folders, handwriting, AI summaries, tasks, saved news and dates. Images inside notes are kept as links; the image files are not inside the backup.</p>
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
              <div className="between"><b>Database</b><span className="tiny">{fmtBytes(dbBytes)} of about 500 MB (free plan)</span></div>
              <div className="meter"><i style={{ width: `${Math.max(1, Math.min(100, (dbBytes / DB_LIMIT) * 100))}%` }} /></div>
              <span className="tiny">Notes {fmtBytes(usage.notes_bytes)} ({usage.notes_count}) · Trash {fmtBytes(usage.trash_bytes)} ({usage.trash_count}) · History {fmtBytes(usage.versions_bytes)} · News {fmtBytes(usage.news_bytes)} ({usage.news_count})</span>
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <div className="between"><b>Images</b><span className="tiny">{fmtBytes(usage.files_bytes)} of 1 GB · {usage.files_count} files</span></div>
              <div className="meter"><i style={{ width: `${Math.max(1, Math.min(100, (usage.files_bytes / FILE_LIMIT) * 100))}%` }} /></div>
            </div>
            <p className="tiny">Row sizes are estimates; the Supabase dashboard shows exact usage including indexes.</p>
            <h3>Free up space</h3>
            <div className="row">
              <button className="btn soft sm" disabled={!!busy} onClick={() => run("news", () => deleteOldNews(3), "Old news deleted")}>Delete unsaved news older than 3 days</button>
              <button className="btn soft sm" disabled={!!busy || !usage.trash_count} onClick={async () => { if (await confirm({ title: "Empty Trash?", body: `${usage.trash_count} notes will be permanently deleted.`, confirm: "Empty Trash", danger: true })) run("trash", emptyTrash, "Trash emptied"); }}>Empty Trash</button>
              <button className="btn soft sm" disabled={!!busy} onClick={() => run("ver", deleteOldVersions, "History older than 30 days deleted")}>Delete history older than 30 days</button>
              <button className="btn soft sm" disabled={!!busy || !usage.files_count} onClick={() => run("img", async () => { const n = await deleteUnusedImages(); toast(`${n} unused image${n === 1 ? "" : "s"} deleted`); })}>Delete unused images</button>
            </div>
            <div className="alert bad" style={{ marginTop: 6 }}>
              <AlertTriangle size={20} color="var(--bad)" />
              <div className="stack" style={{ gap: 8 }}>
                <span>Delete all your data from this account.</span>
                <button className="btn danger sm" style={{ alignSelf: "flex-start" }} disabled={!!busy} onClick={deleteEverything}>Delete everything…</button>
              </div>
            </div>
          </>
        )}
      </Section>

      <Section icon={<User size={19} />} title="Account" color="var(--ink-2)">
        <div className="between">
          <span className="muted">{email}</span>
          <button className="btn line" onClick={() => supabase.auth.signOut()}><LogOut size={17} />Sign out</button>
        </div>
      </Section>

      {editing && <FeedSheet source={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}

function FeedSheet({ source, onClose, onSaved }: { source: Source; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState(source.feeds.join("\n"));
  const toast = useToast();
  const save = async () => {
    const feeds = text.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    const bad = feeds.find((f) => !/^https?:\/\/[^\s]+\.[^\s]+/i.test(f));
    if (bad) return toast(`Not a valid link: ${bad}`, { bad: true });
    try {
      await updateSource(source.key, { feeds });
      onSaved();
      onClose();
      toast("Feeds saved. Tap Refresh on News to check them.");
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };
  return (
    <Sheet title={`${source.name} feeds`} onClose={onClose}>
      <p className="tiny">One RSS feed link per line. Leave empty to use Google News headlines for {source.site}.</p>
      <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 160, fontFamily: "ui-monospace, monospace", fontSize: ".82rem" }} aria-label="Feed links" />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn soft" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Sheet>
  );
}

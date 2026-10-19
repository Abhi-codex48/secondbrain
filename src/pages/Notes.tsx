import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderPlus, Search, Pin, PinOff, Trash2, RotateCcw, Settings2, Inbox, Layers, ListChecks, PenLine, Newspaper, NotebookPen, FileDown } from "lucide-react";
import { exportNotesPdf } from "../lib/pdf";
import { createFolder, deleteFolder, deleteNoteForever, emptyTrash, folderCounts, listFolders, listNotes, noteSources, restoreNote, saveNote, updateFolder, type NoteFilter } from "../lib/api";
import type { Folder, Note } from "../lib/types";
import { addDays, fmtDate, istDay } from "../lib/date";
import { go, type Route } from "../lib/router";
import { FOLDER_COLORS } from "../lib/theme";
import { errMsg, Sheet, Skeleton, useConfirm, useDebounced, useToast } from "../components/ui";
import { PageThumb } from "../components/Studio";
import { setTitle } from "../components/Layout";

export const FOLDER_HEX: Record<string, string> = {
  violet: "#7c4dff", coral: "#ff6a3d", teal: "#12b5a5", blue: "#2f6bff", pink: "#e0489a", amber: "#e3a008", green: "#18a058", slate: "#64748b",
};
const fhex = (c?: string | null) => FOLDER_HEX[c ?? "violet"] ?? FOLDER_HEX.violet;

function highlight(text: string, q: string) {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return text;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="hit">{part}</mark> : part));
}

function snippet(text: string, q: string, len = 220) {
  const w = q.trim().split(/\s+/)[0]?.toLowerCase();
  if (!w) return text.slice(0, len);
  const i = text.toLowerCase().indexOf(w);
  if (i < 60) return text.slice(0, len);
  return `…${text.slice(i - 60, i - 60 + len)}`;
}

type DateRange = "" | "today" | "7" | "30" | "custom";

export function Notes({ route }: { route: Route }) {
  const sel = route.query.get("f") ?? ""; // "", "none", "pinned", "trash" or a folder id
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof folderCounts>> | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [q, setQ] = useState(route.query.get("q") ?? "");
  const dq = useDebounced(q, 250);
  const [kind, setKind] = useState("");
  const [source, setSource] = useState("");
  const [range, setRange] = useState<DateRange>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hasKeyPoints, setHasKeyPoints] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [manage, setManage] = useState<Folder | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const refreshMeta = useCallback(async () => {
    const [fs, c, s] = await Promise.all([listFolders(), folderCounts(), noteSources()]);
    setFolders(fs);
    setCounts(c);
    setSources(s);
  }, []);

  useEffect(() => {
    refreshMeta().catch((e) => toast(errMsg(e), { bad: true }));
  }, [refreshMeta, toast]);

  const filter = useMemo<NoteFilter>(() => {
    const f: NoteFilter = { q: dq, kind: kind || undefined, source: source || undefined, hasKeyPoints: hasKeyPoints || undefined };
    if (sel === "trash") f.trash = true;
    else if (sel === "none") f.folderId = null;
    else if (sel === "pinned") f.pinned = true;
    else if (sel) f.folderId = sel;
    const today = istDay();
    if (range === "today") f.from = today;
    if (range === "7") f.from = addDays(today, -6);
    if (range === "30") f.from = addDays(today, -29);
    if (range === "custom") {
      f.from = from || undefined;
      f.to = to || undefined;
    }
    return f;
  }, [dq, kind, source, hasKeyPoints, sel, range, from, to]);

  const load = useCallback(async () => {
    try {
      setNotes(await listNotes(filter));
    } catch (e) {
      toast(errMsg(e), { bad: true });
      setNotes([]);
    }
  }, [filter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const current = folders.find((f) => f.id === sel);
  const title = sel === "trash" ? "Trash" : sel === "none" ? "Unfiled" : sel === "pinned" ? "Pinned" : current?.name ?? "All notes";
  useEffect(() => setTitle(title), [title]);
  const pick = (f: string) => go(f ? `notes?f=${encodeURIComponent(f)}` : "notes");

  const togglePin = async (n: Note) => {
    setNotes((xs) => xs?.map((x) => (x.id === n.id ? { ...x, pinned: !n.pinned } : x)) ?? null);
    try {
      await saveNote({ id: n.id, pinned: !n.pinned });
      refreshMeta();
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };

  const restore = async (n: Note) => {
    await restoreNote(n.id);
    toast("Restored");
    load();
    refreshMeta();
  };
  const destroy = async (n: Note) => {
    if (!(await confirm({ title: "Delete forever?", body: `"${n.title || "Untitled"}" will be permanently deleted. This cannot be undone.`, confirm: "Delete forever", danger: true }))) return;
    await deleteNoteForever(n.id);
    load();
    refreshMeta();
  };
  // Exports exactly the notes on screen (this folder, with any search and filters applied).
  const exportPdf = () => {
    if (!notes?.length) return toast("There are no notes here to export");
    exportNotesPdf(notes, title, folders);
  };

  const empty = async () => {
    if (!(await confirm({ title: "Empty Trash?", body: `All ${counts?.trash ?? ""} notes in Trash will be permanently deleted.`, confirm: "Empty Trash", danger: true }))) return;
    await emptyTrash();
    toast("Trash emptied");
    load();
    refreshMeta();
  };

  const activeFilters = [kind, source, range, hasKeyPoints ? "kp" : ""].filter(Boolean).length;

  return (
    <div className="page" style={{ ["--c1" as string]: "var(--notes-1)" }}>
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="kicker">Repository</span>
          <h1 className="row" style={{ gap: 10 }}>
            {current && <i style={{ width: 16, height: 16, borderRadius: 5, background: fhex(current.color) }} />}
            {title}
          </h1>
        </div>
        <div className="row">
          {current && <button className="btn soft sm" onClick={() => setManage(current)}><Settings2 size={16} />Folder</button>}
          {sel !== "trash" && <button className="btn soft sm" onClick={exportPdf} title="Export the notes shown here as one PDF"><FileDown size={16} />Export PDF</button>}
          {sel !== "trash" && <button className="btn grad sm" style={{ ["--c1" as string]: "var(--news-1)", ["--c2" as string]: "var(--news-2)" }} onClick={() => go(`draw/new/new${current ? `?f=${current.id}` : ""}`)}><PenLine size={16} />Write by hand</button>}
          {sel === "trash" && (counts?.trash ?? 0) > 0 && <button className="btn danger sm" onClick={empty}><Trash2 size={16} />Empty Trash</button>}
        </div>
      </div>

      <div className="notes-layout">
        <div className="card folders-card" style={{ padding: 10 }}>
          <div className="folders">
            <FolderBtn on={sel === ""} color="var(--ink)" icon={<Layers size={16} />} name="All notes" n={counts?.total} onClick={() => pick("")} />
            <FolderBtn on={sel === "pinned"} color="#e3a008" icon={<Pin size={16} />} name="Pinned" n={counts?.pinned} onClick={() => pick("pinned")} />
            {folders.map((f) => (
              <FolderBtn key={f.id} on={sel === f.id} color={fhex(f.color)} name={f.name} n={counts?.by[f.id] ?? 0} onClick={() => pick(f.id)} />
            ))}
            <FolderBtn on={sel === "none"} color="#94a3b8" icon={<Inbox size={16} />} name="Unfiled" n={counts?.none} onClick={() => pick("none")} />
            <FolderBtn on={sel === "trash"} color="#e0384f" icon={<Trash2 size={16} />} name="Trash" n={counts?.trash} onClick={() => pick("trash")} />
            <button className="folder-btn" onClick={() => setNewFolder(true)} style={{ color: "var(--accent)" }}>
              <FolderPlus size={18} /><span className="nm">New folder</span>
            </button>
          </div>
        </div>

        <div className="stack">
          <label className="searchbox">
            <Search size={19} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, text and sources — results update as you type" aria-label="Search notes" />
          </label>
          <div className="filters">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Type">
              <option value="">All types</option>
              <option value="note">My notes</option>
              <option value="article">Saved articles</option>
              <option value="ink">Handwriting</option>
            </select>
            <select className="select" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
              <option value="">All sources</option>
              {sources.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select className="select" value={range} onChange={(e) => setRange(e.target.value as DateRange)} aria-label="Date">
              <option value="">Any date</option>
              <option value="today">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="custom">Pick dates…</option>
            </select>
            <button className={`btn ${hasKeyPoints ? "primary" : "line"}`} style={{ minHeight: 42 }} onClick={() => setHasKeyPoints((v) => !v)}><ListChecks size={16} />With key points</button>
          </div>
          {range === "custom" && (
            <div className="row">
              <input type="date" className="input" style={{ width: "auto", flex: 1 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
              <span className="tiny">to</span>
              <input type="date" className="input" style={{ width: "auto", flex: 1 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            </div>
          )}
          <div className="between tiny">
            <span>{notes ? `${notes.length} note${notes.length === 1 ? "" : "s"}` : "Loading…"}{activeFilters ? ` · ${activeFilters} filter${activeFilters > 1 ? "s" : ""}` : ""}</span>
            {(activeFilters > 0 || q) && <button className="tiny" style={{ color: "var(--accent)", fontWeight: 800 }} onClick={() => { setKind(""); setSource(""); setRange(""); setHasKeyPoints(false); setQ(""); }}>Clear all</button>}
          </div>

          {notes === null ? (
            <div className="note-list">{[0, 1, 2, 3].map((i) => <div key={i} className="card"><Skeleton /></div>)}</div>
          ) : notes.length === 0 ? (
            <div className="card empty">
              <NotebookPen size={34} />
              <b>{sel === "trash" ? "Trash is empty" : q || activeFilters ? "Nothing matches" : "No notes here yet"}</b>
              {sel !== "trash" && !q && <button className="btn primary" onClick={() => go(`note/new${current ? `?f=${current.id}` : ""}`)}>Write a note</button>}
            </div>
          ) : (
            <div className="note-list">
              {notes.map((n, i) => {
                const folder = folders.find((f) => f.id === n.folder_id);
                const inkOnly = !n.body_text && n.ink?.length;
                return (
                  <article key={n.id} className="card ncard note" style={{ ["--fc" as string]: fhex(folder?.color), animationDelay: `${Math.min(i, 12) * 25}ms`, cursor: "pointer" }} onClick={() => sel !== "trash" && go(`note/${n.id}`)}>
                    <div className="meta">
                      {n.kind === "article" ? <Newspaper size={14} /> : n.kind === "ink" ? <PenLine size={14} /> : <NotebookPen size={14} />}
                      {folder && <span className="tag" style={{ background: `${fhex(folder.color)}22`, color: fhex(folder.color) }}>{folder.name}</span>}
                      {n.source_name && <span>{n.source_name}</span>}
                      <span>· {fmtDate(n.read_on, { day: "numeric", month: "short" })}</span>
                      {n.key_points && <span className="tag ai">Key points</span>}
                      {n.ink?.length ? <span className="tag">Handwriting</span> : null}
                    </div>
                    <h3>{highlight(n.title || "Untitled", dq)}</h3>
                    {inkOnly ? <PageThumb page={n.ink![0]} maxHeight={110} /> : (n.body_text || n.key_points?.lead) && <p>{highlight(snippet(n.body_text || n.key_points?.lead || "", dq), dq)}</p>}
                    <div className="row" style={{ justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                      {sel === "trash" ? (
                        <>
                          <button className="btn soft sm" onClick={() => restore(n)}><RotateCcw size={16} />Restore</button>
                          <button className="btn danger sm" onClick={() => destroy(n)}><Trash2 size={16} />Delete forever</button>
                        </>
                      ) : (
                        <button className="icon-btn sm" onClick={() => togglePin(n)} aria-label={n.pinned ? "Unpin" : "Pin"} title={n.pinned ? "Unpin" : "Pin to top"}>
                          {n.pinned ? <PinOff size={17} color="#e3a008" /> : <Pin size={17} />}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {newFolder && (
        <FolderSheet
          onClose={() => setNewFolder(false)}
          onSave={async (name, color) => {
            const f = await createFolder(name, color);
            await refreshMeta();
            pick(f.id);
          }}
        />
      )}
      {manage && (
        <FolderSheet
          folder={manage}
          onClose={() => setManage(null)}
          onSave={async (name, color) => {
            await updateFolder(manage.id, { name, color });
            await refreshMeta();
          }}
          onDelete={async () => {
            const n = counts?.by[manage.id] ?? 0;
            if (!(await confirm({ title: `Delete "${manage.name}"?`, body: n ? `Its ${n} note${n > 1 ? "s" : ""} will move to Unfiled. No note is deleted.` : "The folder is empty.", confirm: "Delete folder", danger: true }))) return;
            await deleteFolder(manage.id);
            setManage(null);
            await refreshMeta();
            pick("");
          }}
        />
      )}
    </div>
  );
}

function FolderBtn({ on, color, name, n, onClick, icon }: { on: boolean; color: string; name: string; n?: number; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button className={`folder-btn ${on ? "on" : ""}`} style={{ ["--fc" as string]: color }} onClick={onClick}>
      {icon ? <span style={{ color, display: "grid" }}>{icon}</span> : <span className="fdot" />}
      <span className="nm">{name}</span>
      {n !== undefined && <span className="n">{n}</span>}
    </button>
  );
}

function FolderSheet({ folder, onClose, onSave, onDelete }: { folder?: Folder; onClose: () => void; onSave: (name: string, color: string) => Promise<void>; onDelete?: () => void }) {
  const [name, setName] = useState(folder?.name ?? "");
  const [color, setColor] = useState(folder?.color ?? "violet");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave(name.trim(), color);
      onClose();
    } catch (err) {
      const m = errMsg(err);
      toast(/duplicate|unique/i.test(m) ? "A folder with this name already exists" : m, { bad: true });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={folder ? "Edit folder" : "New folder"} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name, e.g. Polity" maxLength={80} aria-label="Folder name" />
        <div className="row" role="radiogroup" aria-label="Colour">
          {FOLDER_COLORS.map((c) => (
            <button type="button" key={c} className={`swatch ${color === c ? "on" : ""}`} style={{ background: FOLDER_HEX[c], width: 34, height: 34, borderRadius: 10 }} onClick={() => setColor(c)} aria-label={c} aria-checked={color === c} role="radio" />
          ))}
        </div>
        <div className="row">
          {onDelete && <button type="button" className="btn danger" onClick={onDelete}><Trash2 size={16} />Delete</button>}
          <span className="grow" />
          <button type="button" className="btn soft" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !name.trim()}>{folder ? "Save" : "Create"}</button>
        </div>
      </form>
    </Sheet>
  );
}

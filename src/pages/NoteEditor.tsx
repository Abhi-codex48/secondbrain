import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pin, PinOff, Trash2, History, Sparkles, PenLine, CloudOff, Check, Loader2, AlertTriangle, ExternalLink, X, RotateCcw } from "lucide-react";
import { getNote, listFolders, listVersions, restoreNote, saveNote, summarise, trashNote, htmlToText } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { Folder, InkPage, Note, NoteVersion } from "../lib/types";
import { fmtDate, fmtTime, istDay } from "../lib/date";
import { back, go, type Route } from "../lib/router";
import { RichEditor } from "../components/RichEditor";
import { InkPageEditor, InkThumb, svgToPng } from "../components/Ink";
import { SummaryView, summaryToHtml } from "../components/SummaryView";
import { errMsg, Sheet, Skeleton, useConfirm, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";
import { downloadBlob } from "../lib/backup";

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";
type Draft = Partial<Note> & { id: string };

const draftKey = (id: string) => `sb-draft-${id}`;
const readDraft = (id: string): (Draft & { _at: number }) | null => {
  try {
    const s = localStorage.getItem(draftKey(id));
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};
const writeDraft = (d: Draft) => {
  try {
    localStorage.setItem(draftKey(d.id), JSON.stringify({ ...d, _at: Date.now() }));
  } catch { /* storage full or blocked: the cloud save still runs */ }
};
const clearDraft = (id: string) => {
  try {
    localStorage.removeItem(draftKey(id));
  } catch { /* ignore */ }
};

export function NoteEditor({ id, route }: { id: string; route: Route }) {
  const isNew = id === "new";
  const [noteId] = useState(() => (isNew ? crypto.randomUUID() : id));
  const [note, setNoteState] = useState<Draft | null>(null);
  const noteRef = useRef<Draft | null>(null);
  const setNote = (n: Draft | null) => {
    noteRef.current = n;
    setNoteState(n);
  };
  const [folders, setFolders] = useState<Folder[]>([]);
  const [state, setState] = useState<SaveState>("idle");
  const [history, setHistory] = useState(false);
  const [summing, setSumming] = useState(false);
  const [localDraft, setLocalDraft] = useState<Draft | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const pending = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const base = useRef<string | null>(null); // server updated_at we started from
  const created = useRef(!isNew);
  const warnedConflict = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        setFolders(await listFolders());
        if (isNew) {
          const f = route.query.get("f");
          setNote({ id: noteId, kind: "note", title: "", body_html: "", ink: null, folder_id: f && f !== "none" ? f : null, read_on: istDay(), pinned: false });
          setTitle("New note");
          return;
        }
        const n = await getNote(noteId);
        base.current = n.updated_at;
        setNote(n);
        setTitle(n.title || "Untitled");
        const d = readDraft(noteId);
        if (d && d._at > Date.parse(n.updated_at)) setLocalDraft(d);
      } catch (e) {
        const d = readDraft(noteId);
        if (d) {
          setNote(d);
          setState("offline");
          toast("Showing the copy saved on this device", { bad: true });
        } else toast(errMsg(e), { bad: true });
      }
    })();
  }, [isNew, noteId, route.query, toast]);

  const flush = useCallback(async () => {
    const d = pending.current;
    if (!d) return;
    if (!navigator.onLine) {
      setState("offline");
      return;
    }
    setState("saving");
    try {
      if (created.current && base.current && !warnedConflict.current) {
        const { data } = await supabase.from("notes").select("updated_at").eq("id", d.id).maybeSingle();
        if (data && Date.parse(data.updated_at) > Date.parse(base.current) + 1000) {
          warnedConflict.current = true;
          toast("This note was also changed on another device. That version is kept in History.");
        }
      }
      const saved = await saveNote(d);
      if (pending.current === d) pending.current = null;
      base.current = saved.updated_at;
      if (!created.current) {
        created.current = true;
        window.history.replaceState(null, "", `#/note/${saved.id}`);
      }
      clearDraft(d.id);
      setState(pending.current ? "saving" : "saved");
      if (pending.current) timer.current = setTimeout(flush, 600);
    } catch (e) {
      setState(navigator.onLine ? "error" : "offline");
      if (navigator.onLine) toast(`Couldn't save: ${errMsg(e)}. Your text is kept on this device.`, { bad: true });
    }
  }, [toast]);

  useEffect(() => {
    const on = () => flush();
    window.addEventListener("online", on);
    const leave = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("beforeunload", leave);
      clearTimeout(timer.current);
      if (pending.current) flush();
    };
  }, [flush]);

  const update = useCallback((patch: Partial<Note>) => {
    const n = noteRef.current;
    if (!n) return;
    const next = { ...n, ...patch };
    noteRef.current = next;
    setNoteState(next);
    const hasContent = next.title || next.body_html || next.ink?.some((p) => p.strokes.length) || next.ai_summary;
    if (!hasContent && !created.current) return; // don't create empty notes
    pending.current = next;
    writeDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 900);
    setState("saving");
  }, [flush]);

  const setInkPage = useCallback((i: number, p: InkPage) => {
    const ink = [...(noteRef.current?.ink ?? [])];
    ink[i] = p;
    update({ ink });
  }, [update]);

  const addInk = () => update({ ink: [...(note?.ink ?? []), { id: crypto.randomUUID(), height: 900, strokes: [] }] });
  const removeInk = async (i: number) => {
    if (note?.ink?.[i]?.strokes.length && !(await confirm({ title: "Delete this handwriting page?", body: "You can get it back from History.", confirm: "Delete page", danger: true }))) return;
    const ink = (note?.ink ?? []).filter((_, k) => k !== i);
    update({ ink: ink.length ? ink : null });
  };

  const doSummary = async () => {
    if (!note) return;
    const text = `${note.title ?? ""}\n\n${htmlToText(note.body_html ?? "")}`.trim();
    if (text.length < 80) return toast("Write a few sentences first; handwriting is not read by the AI", { bad: true });
    setSumming(true);
    try {
      const r = await summarise({ text, title: note.title, length: "short", basedOn: "note" });
      update({ ai_summary: r.summary });
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setSumming(false);
    }
  };

  const remove = async () => {
    await flush();
    if (!created.current) return back();
    await trashNote(noteId);
    toast("Moved to Trash", { undo: async () => { await restoreNote(noteId); go(`note/${noteId}`); } });
    go("notes");
  };

  if (!note) return <div className="page"><div className="card"><Skeleton lines={6} /></div></div>;

  return (
    <div className="page" style={{ gap: 14 }}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button className="btn soft sm" onClick={async () => { clearTimeout(timer.current); await flush(); back(); }}><ArrowLeft size={17} />Back</button>
        <SaveBadge s={state} />
        <span className="grow" />
        <button className="icon-btn" onClick={() => update({ pinned: !note.pinned })} aria-label={note.pinned ? "Unpin" : "Pin"} title={note.pinned ? "Unpin" : "Pin to top"}>
          {note.pinned ? <PinOff size={20} color="#e3a008" /> : <Pin size={20} />}
        </button>
        {created.current && <button className="icon-btn" onClick={() => setHistory(true)} aria-label="History" title="Version history"><History size={20} /></button>}
        <button className="icon-btn" onClick={remove} aria-label="Delete" title="Move to Trash"><Trash2 size={20} /></button>
      </div>

      {localDraft && (
        <div className="alert info">
          <CloudOff size={20} />
          <div className="stack" style={{ gap: 8 }}>
            <p>This device has newer changes to this note that were not saved to the cloud.</p>
            <div className="row">
              <button className="btn primary sm" onClick={() => { const { _at, ...d } = localDraft as Draft & { _at?: number }; void _at; setNote(d); update(d); setLocalDraft(null); }}>Use this device's version</button>
              <button className="btn soft sm" onClick={() => { clearDraft(noteId); setLocalDraft(null); }}>Keep the cloud version</button>
            </div>
          </div>
        </div>
      )}

      <div className="editor-head">
        <input className="title-input" value={note.title ?? ""} onChange={(e) => update({ title: e.target.value })} placeholder="Title" aria-label="Title" />
        <div className="row">
          <select className="select" style={{ width: "auto", minWidth: 150, flex: "0 1 220px" }} value={note.folder_id ?? ""} onChange={(e) => update({ folder_id: e.target.value || null })} aria-label="Folder">
            <option value="">No folder</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label className="row tiny" style={{ gap: 6 }}>
            Read on
            <input type="date" className="input" style={{ width: "auto", minHeight: 40 }} value={note.read_on ?? istDay()} max={istDay()} onChange={(e) => e.target.value && update({ read_on: e.target.value })} />
          </label>
        </div>
      </div>

      {note.source_url && (
        <div className="card row" style={{ padding: 12 }}>
          <ExternalLink size={16} />
          <a href={note.source_url} target="_blank" rel="noopener noreferrer" className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.source_name ?? note.source_url}</a>
          <span className="tiny">{note.source_published_at ? `Published ${fmtDate(note.source_published_at)}` : "Publication date not given"}</span>
        </div>
      )}

      <RichEditor html={note.body_html ?? ""} onChange={(html) => update({ body_html: html })} autofocus={isNew} placeholder="Write anything. Select text to format or highlight it." />

      {(note.ink ?? []).map((p, i) => (
        <InkPageEditor
          key={p.id ?? i}
          page={p}
          onChange={(np) => setInkPage(i, np)}
          onDelete={() => removeInk(i)}
          onExport={async (svg) => downloadBlob(await svgToPng(svg, "#ffffff"), `${(note.title || "handwriting").slice(0, 40)}-${i + 1}.png`)}
        />
      ))}

      <div className="row">
        <button className="btn grad" style={{ ["--c1" as string]: "var(--news-1)", ["--c2" as string]: "var(--news-2)" }} onClick={addInk}><PenLine size={17} />Write by hand</button>
        <button className="btn grad" style={{ ["--c1" as string]: "var(--notes-1)", ["--c2" as string]: "var(--more-2)" }} onClick={doSummary} disabled={summing}>
          {summing ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}{note.ai_summary ? "New AI summary" : "Summarise with AI"}
        </button>
      </div>
      {summing && <p className="tiny">Your typed text in this note is being sent to the free AI service to summarise it.</p>}

      {note.ai_summary && (
        <SummaryView
          s={note.ai_summary}
          actions={
            <>
              <button className="btn soft sm" onClick={() => update({ body_html: `${note.body_html ?? ""}${summaryToHtml(note.ai_summary!)}` })}>Copy into note</button>
              <button className="icon-btn sm" onClick={() => update({ ai_summary: null })} aria-label="Remove AI summary" title="Remove AI summary"><X size={17} /></button>
            </>
          }
        />
      )}

      {history && <HistorySheet noteId={noteId} onClose={() => setHistory(false)} onRestore={(v) => { update({ title: v.title ?? "", body_html: v.body_html ?? "", ink: v.ink, ai_summary: v.ai_summary }); setHistory(false); toast("Earlier version restored. The replaced version is kept in History."); }} />}
    </div>
  );
}

/** Removes scripts and event handlers before showing stored HTML (e.g. from a restored backup file). */
function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,iframe,object,embed,form,link,meta").forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
  return doc.body.innerHTML;
}

function SaveBadge({ s }: { s: SaveState }) {
  if (s === "idle") return null;
  if (s === "saving") return <span className="savestate"><Loader2 size={14} className="spin" /><span>Saving…</span></span>;
  if (s === "saved") return <span className="savestate ok"><Check size={14} /><span>Saved to cloud</span></span>;
  if (s === "offline") return <span className="savestate warn"><CloudOff size={14} /><span>Offline · kept on this device</span></span>;
  return <span className="savestate bad"><AlertTriangle size={14} /><span>Not saved yet · kept on this device</span></span>;
}

function HistorySheet({ noteId, onClose, onRestore }: { noteId: string; onClose: () => void; onRestore: (v: NoteVersion) => void }) {
  const [vs, setVs] = useState<NoteVersion[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    listVersions(noteId).then(setVs).catch(() => setVs([]));
  }, [noteId]);
  return (
    <Sheet title="Version history" onClose={onClose} wide>
      <p className="tiny">A snapshot is kept when you edit after a 10-minute gap (up to 30 per note).</p>
      {vs === null ? <Skeleton /> : vs.length === 0 ? <p className="muted">No earlier versions yet.</p> : (
        <div className="stack" style={{ gap: 0 }}>
          {vs.map((v) => (
            <div key={v.id} className="set-row" style={{ alignItems: "flex-start" }}>
              <div className="grow stack" style={{ gap: 6 }}>
                <b>{fmtDate(v.created_at)}, {fmtTime(v.created_at)}</b>
                <span className="tiny">{v.title || "Untitled"}</span>
                {open === v.id && (
                  <div className="card" style={{ maxHeight: 280, overflow: "auto" }}>
                    <div className="prose compact" dangerouslySetInnerHTML={{ __html: sanitize(v.body_html || "<p><em>No typed text</em></p>") }} />
                    {v.ink?.[0] && <InkThumb page={v.ink[0]} />}
                  </div>
                )}
              </div>
              <button className="btn soft sm" onClick={() => setOpen(open === v.id ? null : v.id)}>{open === v.id ? "Hide" : "View"}</button>
              <button className="btn primary sm" onClick={() => onRestore(v)}><RotateCcw size={15} />Restore</button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

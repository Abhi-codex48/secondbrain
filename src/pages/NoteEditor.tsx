import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Pin, PinOff, Trash2, History, ListChecks, PenLine, CloudOff, Check, Loader2, AlertTriangle, ExternalLink, X, RotateCcw } from "lucide-react";
import { getNote, listFolders, listVersions, restoreNote, saveNote, trashNote, htmlToText } from "../lib/api";
import type { Folder, InkPage, Note, NoteVersion } from "../lib/types";
import { fmtDate, fmtTime, istDay } from "../lib/date";
import { back, go, type Route } from "../lib/router";
import { RichEditor } from "../components/RichEditor";
import { InkPageEditor, InkThumb, svgToPng } from "../components/Ink";
import { KeyPointsView } from "../components/KeyPointsView";
import { keyPoints, keyPointsToHtml } from "../lib/keypoints";
import { errMsg, Sheet, Skeleton, useConfirm, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";
import { downloadBlob } from "../lib/backup";

type SaveState = "idle" | "saving" | "saved" | "offline" | "error";
type Draft = Partial<Note> & { id: string };

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
  const toast = useToast();
  const confirm = useConfirm();
  const pending = useRef<Draft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const created = useRef(!isNew);
  const saveSeq = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setFolders(await listFolders().catch(() => []));
        if (isNew) {
          const f = route.query.get("f");
          setNote({ id: noteId, kind: "note", title: "", body_html: "", ink: null, folder_id: f && f !== "none" ? f : null, read_on: istDay(), pinned: false });
          setTitle("New note");
          return;
        }
        const n = await getNote(noteId);
        setNote(n);
        setTitle(n.title || "Untitled");
      } catch (e) {
        toast(errMsg(e), { bad: true });
      }
    })();
  }, [isNew, noteId, route.query, toast]);

  // Saving writes to this device at once (Firestore keeps it even offline) and syncs in the background.
  const flush = useCallback(() => {
    const d = pending.current;
    if (!d) return;
    pending.current = null;
    clearTimeout(timer.current);
    try {
      const { synced } = saveNote(d);
      if (!created.current) {
        created.current = true;
        window.history.replaceState(null, "", `#/note/${d.id}`);
      }
      const seq = ++saveSeq.current;
      setState(navigator.onLine ? "saving" : "offline");
      synced
        .then(() => seq === saveSeq.current && !pending.current && setState("saved"))
        .catch((e) => {
          setState("error");
          toast(`Couldn't save to the cloud: ${errMsg(e)}`, { bad: true });
        });
    } catch (e) {
      setState("error");
      toast(errMsg(e), { bad: true });
    }
  }, [toast]);

  useEffect(() => {
    const off = () => setState((s) => (s === "saving" ? "offline" : s));
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("offline", off);
      flush();
    };
  }, [flush]);

  const update = useCallback((patch: Partial<Note>) => {
    const n = noteRef.current;
    if (!n) return;
    const next = { ...n, ...patch };
    noteRef.current = next;
    setNoteState(next);
    const hasContent = next.title || next.body_html || next.ink?.some((p) => p.strokes.length) || next.key_points;
    if (!hasContent && !created.current) return; // don't create empty notes
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
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

  const doKeyPoints = () => {
    if (!note) return;
    const text = htmlToText(note.body_html ?? "");
    const k = keyPoints(text, { title: note.title, basedOn: "note", detailed: text.length > 3000 });
    if (!k) return toast("Write a few full sentences first; handwriting can't be read", { bad: true });
    update({ key_points: k });
  };

  const remove = async () => {
    flush();
    if (!created.current) return back();
    await trashNote(noteId);
    toast("Moved to Trash", { undo: async () => { await restoreNote(noteId); go(`note/${noteId}`); } });
    go("notes");
  };

  if (!note) return <div className="page"><div className="card"><Skeleton lines={6} /></div></div>;

  return (
    <div className="page" style={{ gap: 14 }}>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button className="btn soft sm" onClick={() => { flush(); back(); }}><ArrowLeft size={17} />Back</button>
        <SaveBadge s={state} />
        <span className="grow" />
        <button className="icon-btn" onClick={() => update({ pinned: !note.pinned })} aria-label={note.pinned ? "Unpin" : "Pin"} title={note.pinned ? "Unpin" : "Pin to top"}>
          {note.pinned ? <PinOff size={20} color="#e3a008" /> : <Pin size={20} />}
        </button>
        {created.current && <button className="icon-btn" onClick={() => setHistory(true)} aria-label="History" title="Version history"><History size={20} /></button>}
        <button className="icon-btn" onClick={remove} aria-label="Delete" title="Move to Trash"><Trash2 size={20} /></button>
      </div>

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
        <button className="btn grad" style={{ ["--c1" as string]: "var(--notes-1)", ["--c2" as string]: "var(--more-2)" }} onClick={doKeyPoints}>
          <ListChecks size={17} />{note.key_points ? "Update key points" : "Pick key points"}
        </button>
      </div>

      {note.key_points && (
        <KeyPointsView
          k={note.key_points}
          actions={
            <>
              <button className="btn soft sm" onClick={() => update({ body_html: `${note.body_html ?? ""}${keyPointsToHtml(note.key_points!)}` })}>Copy into note</button>
              <button className="icon-btn sm" onClick={() => update({ key_points: null })} aria-label="Remove key points" title="Remove key points"><X size={17} /></button>
            </>
          }
        />
      )}

      {history && <HistorySheet noteId={noteId} onClose={() => setHistory(false)} onRestore={(v) => { update({ title: v.title ?? "", body_html: v.body_html ?? "", ink: v.ink, key_points: v.key_points }); setHistory(false); toast("Earlier version restored. The replaced version is kept in History."); }} />}
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
  if (s === "offline") return <span className="savestate warn"><CloudOff size={14} /><span>Offline · saved on this device, will sync</span></span>;
  return <span className="savestate bad"><AlertTriangle size={14} /><span>Not synced · see message</span></span>;
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

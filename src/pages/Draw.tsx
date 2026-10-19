import { useCallback, useEffect, useRef, useState } from "react";
import { getNote, saveNote } from "../lib/api";
import { itemsOf, type Page } from "../lib/ink";
import type { Note } from "../lib/types";
import { fmtDate } from "../lib/date";
import { back, go, type Route } from "../lib/router";
import { Studio } from "../components/Studio";
import { errMsg, useConfirm, useToast } from "../components/ui";
import { ChevronLeft, ChevronRight, FileDown, FilePlus2, Trash2 } from "lucide-react";
import { exportPagesPdf } from "../lib/pdf";
import { setTitle } from "../components/Layout";

/** Full-screen handwriting for a note's pages (#/draw/<noteId|new>/<page|new>). */
export function Draw({ noteId, pageParam, route }: { noteId: string; pageParam: string; route: Route }) {
  const [id] = useState(() => (noteId === "new" ? crypto.randomUUID() : noteId));
  const [note, setNote] = useState<Note | null | undefined>(undefined);
  const [idx, setIdx] = useState(0);
  const toast = useToast();
  const pending = useRef<Page | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const noteRef = useRef<Note | null>(null);
  const blank = useRef<Page>({ id: crypto.randomUUID(), height: 1400, paper: "lines", items: [] });
  const confirm = useConfirm();

  useEffect(() => {
    (async () => {
      let n: Note | null = null;
      if (noteId !== "new") n = await getNote(noteId).catch(() => null);
      noteRef.current = n;
      const pages = n?.ink ?? [];
      setIdx(pageParam === "new" || !/^\d+$/.test(pageParam) ? pages.length : Math.min(Number(pageParam), pages.length));
      setNote(n);
      setTitle(n?.title || "Handwriting");
    })();
  }, [noteId, pageParam]);

  const write = useCallback((p: Page) => {
    const n = noteRef.current;
    const pages = [...(n?.ink ?? [])];
    pages[Math.min(idx, pages.length)] = { ...p, id: p.id ?? crypto.randomUUID() };
    if (!n && !itemsOf(p).length) return; // don't create empty notes
    try {
      const { note: saved, synced } = saveNote({
        id,
        ink: pages,
        ...(n ? {} : { kind: "ink" as const, title: `Handwritten note · ${fmtDate(new Date().toISOString())}`, folder_id: route.query.get("f") || null }),
      });
      noteRef.current = saved;
      setNote(saved); // refresh the page count and buttons
      synced.catch((e) => toast(`Couldn't sync: ${errMsg(e)}`, { bad: true }));
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  }, [id, idx, route.query, toast]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (pending.current) write(pending.current);
    pending.current = null;
  }, [write]);

  useEffect(() => () => flush(), [flush]);

  if (note === undefined) return null;
  const saved = noteRef.current?.ink ?? [];
  const page: Page = saved[idx] ?? blank.current;
  const total = Math.max(saved.length, idx + 1);

  // Moving between pages saves the current one first.
  const goTo = (i: number) => {
    flush();
    if (i >= (noteRef.current?.ink?.length ?? 0)) blank.current = { id: crypto.randomUUID(), height: 1400, paper: page.paper ?? "lines", items: [] };
    setIdx(i);
  };
  const removePage = async () => {
    flush();
    const pages = [...(noteRef.current?.ink ?? [])];
    if (idx >= pages.length) return goTo(Math.max(0, idx - 1));
    if (!(await confirm({ title: `Delete page ${idx + 1}?`, body: "You can get it back from the note's History.", confirm: "Delete page", danger: true }))) return;
    pages.splice(idx, 1);
    const { note: n } = saveNote({ id, ink: pages });
    noteRef.current = n;
    setIdx(Math.max(0, Math.min(idx, pages.length - 1)));
    setNote(n);
  };
  const pdf = () => {
    flush();
    const pages = (noteRef.current?.ink ?? []).filter((p) => itemsOf(p).length);
    if (!pages.length) return toast("Write something first");
    exportPagesPdf(pages, noteRef.current?.title || "Handwritten note");
  };

  return (
    <Studio
      key={`${idx}-${page.id ?? ""}`}
      page={page}
      pager={
        <div className="studio-pager" role="toolbar" aria-label="Pages">
          <button className="icon-btn sm" onClick={() => goTo(idx - 1)} disabled={idx === 0} aria-label="Previous page"><ChevronLeft size={18} /></button>
          <span className="pg">Page {idx + 1} of {total}</span>
          <button className="icon-btn sm" onClick={() => goTo(idx + 1)} disabled={idx >= total - 1} aria-label="Next page"><ChevronRight size={18} /></button>
          <button className="btn soft sm" onClick={() => goTo(total)} disabled={idx >= saved.length} title={idx >= saved.length ? "Write on this page first" : "Add a page"}><FilePlus2 size={16} />New page</button>
          <span className="grow" />
          <button className="icon-btn sm" onClick={pdf} aria-label="Export as PDF" title="Export all pages as PDF"><FileDown size={18} /></button>
          <button className="icon-btn sm" onClick={removePage} aria-label="Delete this page" title="Delete this page"><Trash2 size={17} /></button>
        </div>
      }
      title={note?.title || "New handwritten note"}
      onChange={(p) => {
        // autosave a second after the last change
        pending.current = p;
        clearTimeout(timer.current);
        timer.current = setTimeout(flush, 1000);
      }}
      onSave={(p) => {
        clearTimeout(timer.current);
        pending.current = null;
        write(p);
        toast("Saved");
        if (noteRef.current) go(`note/${id}`);
        else back();
      }}
      onClose={() => {
        flush();
        back();
      }}
    />
  );
}

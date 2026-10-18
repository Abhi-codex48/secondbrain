import { useCallback, useEffect, useRef, useState } from "react";
import { getNote, saveNote } from "../lib/api";
import { itemsOf, type Page } from "../lib/ink";
import type { Note } from "../lib/types";
import { fmtDate } from "../lib/date";
import { back, go, type Route } from "../lib/router";
import { Studio } from "../components/Studio";
import { errMsg, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

/** Full-screen handwriting for one page of a note (#/draw/<noteId|new>/<page|new>). */
export function Draw({ noteId, pageParam, route }: { noteId: string; pageParam: string; route: Route }) {
  const [id] = useState(() => (noteId === "new" ? crypto.randomUUID() : noteId));
  const [note, setNote] = useState<Note | null | undefined>(undefined);
  const [idx, setIdx] = useState(0);
  const toast = useToast();
  const pending = useRef<Page | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const noteRef = useRef<Note | null>(null);

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
    pages[idx] = { ...p, id: p.id ?? crypto.randomUUID() };
    if (!n && !itemsOf(p).length) return; // don't create empty notes
    try {
      const { note: saved, synced } = saveNote({
        id,
        ink: pages,
        ...(n ? {} : { kind: "ink" as const, title: `Handwritten note · ${fmtDate(new Date().toISOString())}`, folder_id: route.query.get("f") || null }),
      });
      noteRef.current = saved;
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
  const page: Page = note?.ink?.[idx] ?? { id: crypto.randomUUID(), height: 1400, paper: "lines", items: [] };
  return (
    <Studio
      page={page}
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

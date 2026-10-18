import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { saveNote } from "../lib/api";
import { W, itemsOf, uid, type Page } from "../lib/ink";
import { go } from "../lib/router";
import { Studio } from "./Studio";
import { errMsg, useToast } from "./ui";

/** Takes a picture of what is on screen now, so drawings can be saved on top of it. */
async function captureScreen(): Promise<string | null> {
  try {
    const { toCanvas } = await import("html-to-image");
    const vw = window.innerWidth, vh = window.innerHeight;
    const canvas = await toCanvas(document.body, {
      width: vw,
      height: vh,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      skipFonts: true,
      backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`, transformOrigin: "top left" },
      filter: (n) => !(n instanceof HTMLElement && (n.classList.contains("fab-stack") || n.classList.contains("toasts"))),
    });
    for (const q of [0.8, 0.65, 0.5, 0.35]) {
      const url = canvas.toDataURL("image/jpeg", q);
      if (url.length < 320_000) return url;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pen mode: freezes the current screen and opens the drawing studio over it.
 * Saving keeps the picture, your marks and the page's text in a private note.
 */
export function DrawOverlay({ onClose, context }: { onClose: () => void; context: { title: string; href: string } }) {
  const [page, setPage] = useState<Page | null>(null);
  const [text] = useState(() => (document.querySelector("main")?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3000));
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    const height = Math.round((window.innerHeight * W) / window.innerWidth);
    captureScreen().then((src) => {
      if (!alive) return;
      setPage({ id: uid(), height, paper: "plain", items: src ? [{ type: "image", id: uid(), x: 0, y: 0, w: W, h: height, src, locked: true }] : [] });
      if (!src) toast("Couldn't capture this screen; you can still draw and save.");
    });
    return () => { alive = false; };
  }, [toast]);

  if (!page) {
    return (
      <div className="studio" style={{ display: "grid", placeItems: "center", background: "rgba(20,14,40,.35)" }}>
        <span className="toast"><Loader2 size={16} className="spin" />Getting the page ready…</span>
      </div>
    );
  }

  const save = (p: Page) => {
    const marks = itemsOf(p).filter((i) => !(i.type === "image" && i.locked));
    if (!marks.length) {
      toast("Draw something first");
      return;
    }
    try {
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const { note } = saveNote({
        kind: "ink",
        title: `Notes on: ${context.title}`.slice(0, 140),
        body_html: `<p>Drawn over <a href="${context.href}">${esc(context.title)}</a></p>${text ? `<blockquote><p>${esc(text).replace(/\n+/g, "</p><p>")}</p></blockquote>` : ""}`,
        ink: [p],
      });
      toast("Saved as a note", { action: { label: "Open", run: () => go(`note/${note.id}`) } });
      onClose();
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };

  return <Studio page={page} title={`Drawing on: ${context.title}`} mode="overlay" onSave={save} onClose={onClose} />;
}

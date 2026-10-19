import { useEffect, useState } from "react";
import { Share2, BookOpen, BookmarkCheck, Bookmark as BookmarkIcon, NotebookPen, Loader2 } from "lucide-react";
import { addBookmark, addLink, saveNote, setNewsStatus } from "../lib/api";
import { go, type Route } from "../lib/router";
import { errMsg, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Something shared to Second Brain from another app (the phone's Share menu).
 * Asks whether to keep it in the Library, and where.
 */
export function ShareIn({ route }: { route: Route }) {
  const title = route.query.get("title") ?? "";
  const text = route.query.get("text") ?? "";
  // Many apps put the link inside the text ("Look at this https://…").
  const url = route.query.get("url") || text.match(/https?:\/\/\S+/)?.[0] || "";
  const note = text.replace(url, "").trim();
  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => setTitle("Shared to Second Brain"), []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast(errMsg(e), { bad: true }); } finally { setBusy(null); }
  };
  const read = () => run("read", async () => { const id = await addLink(url, title); go(`read/${id}`); });
  const keepArticle = () => run("article", async () => {
    const id = await addLink(url, title);
    await setNewsStatus(id, "saved");
    toast("Saved to Library → Articles");
    go(`read/${id}`);
  });
  const bookmark = () => run("bookmark", async () => {
    await addBookmark({ title: title || note.slice(0, 120) || host, url, text: note, source: host || "Shared", kind: "Shared with me" });
    toast("Saved to Library → Bookmarks");
    go("library?t=bookmarks");
  });
  const asNote = () => run("note", async () => {
    const { note: n } = saveNote({
      title: title || (url ? host : note.slice(0, 80)) || "Shared",
      body_html: `${note ? `<p>${esc(note)}</p>` : ""}${url ? `<p><a href="${esc(url)}">${esc(url)}</a></p>` : ""}`,
      source_url: url || null,
      source_name: host || null,
    });
    go(`note/${n.id}`);
  });

  if (!url && !note && !title) {
    return <div className="page"><div className="card empty"><Share2 size={32} /><b>Nothing was shared</b><a className="btn line" href="#/">Go Home</a></div></div>;
  }
  return (
    <div className="page">
      <div className="stack" style={{ gap: 4 }}>
        <span className="kicker" style={{ color: "var(--accent)" }}>Shared to Second Brain</span>
        <h1>Keep it in your Library?</h1>
      </div>
      <div className="card stack shared-in">
        {title && <b>{title}</b>}
        {note && <p className="muted">{note}</p>}
        {url && <a className="tiny" href={url} target="_blank" rel="noopener noreferrer">{url}</a>}
      </div>
      <div className="share-actions">
        {url && <button className="btn primary" onClick={read} disabled={!!busy}>{busy === "read" ? <Loader2 size={17} className="spin" /> : <BookOpen size={17} />}Read it now</button>}
        {url && <button className="btn soft" onClick={keepArticle} disabled={!!busy}>{busy === "article" ? <Loader2 size={17} className="spin" /> : <BookmarkCheck size={17} />}Save to Articles</button>}
        <button className="btn soft" onClick={bookmark} disabled={!!busy}>{busy === "bookmark" ? <Loader2 size={17} className="spin" /> : <BookmarkIcon size={17} />}Save to Bookmarks</button>
        <button className="btn soft" onClick={asNote} disabled={!!busy}>{busy === "note" ? <Loader2 size={17} className="spin" /> : <NotebookPen size={17} />}Save as a note</button>
        <a className="btn line" href="#/">Don't keep it</a>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Search as SearchIcon, ExternalLink, BookOpen, NotebookPen, Newspaper, Globe } from "lucide-react";
import { listNews, listNotes } from "../lib/api";
import type { NewsItem, Note } from "../lib/types";
import { fmtDate } from "../lib/date";
import { go, type Route } from "../lib/router";
import { googleUrl, searchWikipedia, type WikiHit } from "../lib/wiki";
import { Skeleton, useDebounced } from "../components/ui";
import { setTitle } from "../components/Layout";

export function Search({ route }: { route: Route }) {
  const initial = route.query.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const dq = useDebounced(q.trim(), 350);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [wiki, setWiki] = useState<WikiHit[] | null>(null);
  const [wikiErr, setWikiErr] = useState(false);

  useEffect(() => setQ(initial), [initial]);
  useEffect(() => {
    setTitle(dq ? `Search: ${dq}` : "Search");
    if (!dq) {
      setNotes(null); setNews(null); setWiki(null);
      return;
    }
    window.history.replaceState(null, "", `#/search?q=${encodeURIComponent(dq)}`);
    const ctrl = new AbortController();
    setNotes(null); setNews(null); setWiki(null); setWikiErr(false);
    listNotes({ q: dq, limit: 30 }).then(setNotes).catch(() => setNotes([]));
    listNews({ q: dq, limit: 20 }).then(setNews).catch(() => setNews([]));
    searchWikipedia(dq, ctrl.signal).then(setWiki).catch((e) => { if (e.name !== "AbortError") { setWiki([]); setWikiErr(true); } });
    return () => ctrl.abort();
  }, [dq]);

  return (
    <div className="page">
      <h1>Search</h1>
      <form className="searchbox" style={{ minHeight: 56, borderRadius: 18 }} onSubmit={(e) => e.preventDefault()}>
        <SearchIcon size={20} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type anything you remember…" aria-label="Search" enterKeyHint="search" />
      </form>

      {dq && (
        <div className="row">
          <a className="btn line" href={googleUrl(dq)} target="_blank" rel="noopener noreferrer"><Globe size={17} />Search Google<ExternalLink size={14} /></a>
          <a className="btn line" href={`https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(dq)}`} target="_blank" rel="noopener noreferrer"><BookOpen size={17} />Open Wikipedia<ExternalLink size={14} /></a>
        </div>
      )}

      {!dq ? (
        <div className="card empty"><SearchIcon size={32} /><span>Search your notes, saved news and Wikipedia at once. Google opens in a new tab.</span></div>
      ) : (
        <div className="news-grid" style={{ alignItems: "start" }}>
          <div className="card stack">
            <h2 className="row"><NotebookPen size={20} color="var(--notes-1)" />My notes</h2>
            {notes === null ? <Skeleton /> : notes.length === 0 ? <p className="muted">No notes match.</p> : notes.map((n) => (
              <a key={n.id} className="result" href={`#/note/${n.id}`}>
                <b>{n.title || "Untitled"}</b>
                <span className="tiny">{fmtDate(n.read_on)}{n.source_name ? ` · ${n.source_name}` : ""}</span>
                {n.body_text && <span className="muted" style={{ fontSize: ".88rem" }}>{n.body_text.slice(0, 160)}</span>}
              </a>
            ))}
          </div>
          <div className="stack">
            <div className="card stack">
              <h2 className="row"><BookOpen size={20} color="var(--more-1)" />Wikipedia</h2>
              {wiki === null ? <Skeleton /> : wikiErr ? <p className="muted">Wikipedia could not be reached.</p> : wiki.length === 0 ? <p className="muted">No articles found.</p> : wiki.map((w) => (
                <a key={w.url} className="result" href={w.url} target="_blank" rel="noopener noreferrer">
                  <b className="row">{w.title}<ExternalLink size={13} /></b>
                  <span className="muted" style={{ fontSize: ".88rem" }}>{w.snippet}…</span>
                </a>
              ))}
            </div>
            <div className="card stack">
              <h2 className="row"><Newspaper size={20} color="var(--news-2)" />News</h2>
              {news === null ? <Skeleton /> : news.length === 0 ? <p className="muted">No fetched news matches.</p> : news.map((n) => (
                <button key={n.id} className="result" style={{ textAlign: "left" }} onClick={() => go(`read/${n.id}`)}>
                  <b>{n.title}</b>
                  <span className="tiny">{n.source_name} · {n.published_at ? fmtDate(n.published_at) : "date not given"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Link2, Loader2, RefreshCw, X, Newspaper, AlertTriangle } from "lucide-react";
import { fetchArticle, lastSync, listNews, listSources, setNewsStatus, syncNews } from "../lib/api";
import type { NewsItem, Source } from "../lib/types";
import { fmtDate, fmtTime, istDay, relTime } from "../lib/date";
import { go } from "../lib/router";
import { TOPICS } from "../../supabase/functions/_shared/classify";
import { errMsg, Skeleton, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

const SRC_COLORS = ["#ff7a45", "#7c4dff", "#12b5a5", "#2f6bff", "#e0384f", "#d4a106", "#18a058", "#d63ca5", "#0aa5ff", "#8b5cf6", "#f97316"];
export const srcColor = (key: string) => SRC_COLORS[[...key].reduce((a, ch) => a + ch.charCodeAt(0), 0) % SRC_COLORS.length];
export const LEVEL: Record<NewsItem["content_level"], string> = { full: "Full text", excerpt: "Excerpt", headline: "Headline only" };

type View = "today" | "unread" | "saved" | "all";
const AUTO_SYNC_MIN = 60;

export function News() {
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [topic, setTopic] = useState("");
  const [src, setSrc] = useState("");
  const [view, setView] = useState<View>("today");
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const rows = await listNews({
        topic: topic || undefined,
        source: src || undefined,
        status: view === "saved" ? "saved" : view === "unread" ? "unread" : undefined,
        day: view === "today" ? istDay() : undefined,
      });
      setItems(rows);
    } catch (e) {
      toast(errMsg(e), { bad: true });
      setItems([]);
    }
  }, [topic, src, view, toast]);

  const sync = useCallback(async (force: boolean) => {
    setSyncing(true);
    try {
      const r = await syncNews(force);
      if (r.synced_at) setSynced(r.synced_at);
      setSources(await listSources());
      await load();
      if (force && r.sources) {
        const n = Object.values(r.sources).reduce((a, s) => a + s.count, 0);
        toast(n ? `${n} new article${n === 1 ? "" : "s"}` : "No new articles since the last check");
      }
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setSyncing(false);
    }
  }, [load, toast]);

  useEffect(() => {
    setTitle("News");
    (async () => {
      const s = await lastSync().catch(() => null);
      setSynced(s?.last_news_sync ?? null);
      setSources(await listSources().catch(() => []));
      const stale = !s?.last_news_sync || Date.now() - Date.parse(s.last_news_sync) > AUTO_SYNC_MIN * 60_000;
      if (stale) sync(false);
    })();
  }, [sync]);

  useEffect(() => {
    setItems(null);
    load();
  }, [load]);

  const openLink = async (e: React.FormEvent) => {
    e.preventDefault();
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    setFetching(true);
    try {
      const r = await fetchArticle({ url: u });
      setUrl("");
      go(`read/${r.item.id}`);
    } catch (err) {
      toast(errMsg(err), { bad: true });
    } finally {
      setFetching(false);
    }
  };

  const setStatus = async (it: NewsItem, status: NewsItem["status"]) => {
    const prev = it.status;
    setItems((xs) => (status === "dismissed" ? xs?.filter((x) => x.id !== it.id) ?? null : xs?.map((x) => (x.id === it.id ? { ...x, status } : x)) ?? null));
    try {
      await setNewsStatus(it.id, status);
      if (status === "dismissed") toast("Hidden", { undo: async () => { await setNewsStatus(it.id, prev); load(); } });
      if (status === "saved") toast("Saved for later");
    } catch (e) {
      toast(errMsg(e), { bad: true });
      load();
    }
  };

  const failing = sources.filter((s) => s.enabled && s.last_error && !s.last_count);
  const topics = useMemo(() => ["", ...TOPICS, "Editorial"], []);

  return (
    <div className="page" style={{ ["--c1" as string]: "var(--news-2)" }}>
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="kicker">Current affairs</span>
          <h1>News</h1>
        </div>
        <button className="btn grad" style={{ ["--c1" as string]: "var(--news-1)", ["--c2" as string]: "var(--news-2)" }} onClick={() => sync(true)} disabled={syncing}>
          <RefreshCw size={17} className={syncing ? "spin" : ""} />
          {syncing ? "Checking…" : "Refresh"}
        </button>
      </div>

      <form className="linkbar" onSubmit={openLink}>
        <label className="searchbox">
          <Link2 size={18} />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste any article link to read and summarise it" aria-label="Article link" inputMode="url" />
        </label>
        <button className="btn primary" disabled={fetching || !url.trim()}>{fetching ? <Loader2 size={17} className="spin" /> : "Fetch"}</button>
      </form>

      <div className="sync">
        <span className={`dot ${failing.length ? "warn" : ""}`} />
        <span>Last checked {relTime(synced)}{sources.length ? ` · ${sources.filter((s) => s.enabled).length} sources` : ""}</span>
        {failing.length > 0 && (
          <a href="#/settings" className="tiny" style={{ color: "var(--warn)" }}>
            <AlertTriangle size={13} style={{ verticalAlign: -2 }} /> {failing.map((f) => f.name).join(", ")} not responding
          </a>
        )}
      </div>

      <div className="seg" role="tablist" style={{ maxWidth: 520 }}>
        {(["today", "unread", "saved", "all"] as View[]).map((v) => (
          <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)} role="tab" aria-selected={view === v}>
            {v === "today" ? "Today" : v === "unread" ? "Unread" : v === "saved" ? "Saved" : "All"}
          </button>
        ))}
      </div>

      <div className="chips" aria-label="Topics">
        {topics.map((t) => (
          <button key={t || "all"} className={`chip ${topic === t ? "on" : ""}`} onClick={() => setTopic(t)}>{t || "All topics"}</button>
        ))}
      </div>
      {sources.length > 0 && (
        <div className="chips" aria-label="Newspapers">
          <button className={`chip ${src === "" ? "on" : ""}`} onClick={() => setSrc("")}>All papers</button>
          {sources.filter((s) => s.enabled).map((s) => (
            <button key={s.key} className={`chip ${src === s.key ? "on" : ""}`} style={src === s.key ? { ["--c1" as string]: srcColor(s.key) } : undefined} onClick={() => setSrc(s.key)}>
              <i style={{ width: 8, height: 8, borderRadius: 4, background: srcColor(s.key) }} />{s.name}
            </button>
          ))}
        </div>
      )}

      {items === null ? (
        <div className="news-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="card"><Skeleton lines={3} /></div>)}</div>
      ) : items.length === 0 ? (
        <div className="card empty">
          <Newspaper size={34} />
          <b>{syncing ? "Fetching today's news…" : "Nothing here yet"}</b>
          <span className="tiny">{view === "today" ? "Tap Refresh to check the newspapers, or switch to All." : "Try another topic or paper."}</span>
        </div>
      ) : (
        <div className="news-grid">
          {items.map((it, i) => (
            <article key={it.id} className={`card ncard ${it.status !== "new" ? "read" : ""}`} style={{ ["--src" as string]: srcColor(it.source_key), animationDelay: `${Math.min(i, 12) * 30}ms`, cursor: "pointer" }}
              onClick={() => go(`read/${it.id}`)}>
              <div className="meta">
                <span className="src">{it.source_name}</span>
                <span>·</span>
                <span>{it.published_at ? `${fmtDate(it.published_at, { day: "numeric", month: "short" })}, ${fmtTime(it.published_at)}` : "Date not given"}</span>
                {it.topics.slice(0, 2).map((t) => <span key={t} className="tag">{t}</span>)}
                <span className={`tag ${it.content_level}`}>{LEVEL[it.content_level]}</span>
                {(it.summaries?.short || it.summaries?.detailed) && <span className="tag ai">Summarised</span>}
              </div>
              <h3>{it.title}</h3>
              {it.description && <p>{it.description}</p>}
              <div className="row" style={{ justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn sm" onClick={() => setStatus(it, it.status === "saved" ? "read" : "saved")} aria-label={it.status === "saved" ? "Unsave" : "Save for later"} title="Save for later">
                  {it.status === "saved" ? <BookmarkCheck size={18} color="var(--accent)" /> : <Bookmark size={18} />}
                </button>
                <button className="icon-btn sm" onClick={() => setStatus(it, "dismissed")} aria-label="Hide" title="Hide"><X size={18} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

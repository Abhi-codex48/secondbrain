import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, BookmarkCheck, Link2, Loader2, RefreshCw, X, Newspaper, AlertTriangle, ChevronDown } from "lucide-react";
import { addLink, listNews, loadNewsFile, newsHealth, setNewsStatus } from "../lib/api";
import type { NewsItem, Source } from "../lib/types";
import { istDay, relTime } from "../lib/date";
import { go } from "../lib/router";
import { TOPICS } from "../../shared/classify";
import { errMsg, Skeleton, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

const SRC_COLORS = ["#ff7a45", "#7c4dff", "#12b5a5", "#2f6bff", "#e0384f", "#d4a106", "#18a058", "#d63ca5", "#0aa5ff", "#8b5cf6", "#f97316"];
export const srcColor = (key: string) => SRC_COLORS[[...key].reduce((a, ch) => a + ch.charCodeAt(0), 0) % SRC_COLORS.length];
export const LEVEL: Record<NewsItem["content_level"], string> = { full: "Full text", excerpt: "Excerpt", headline: "Headline only" };

type View = "today" | "unread" | "saved" | "all";
const OTHER = "Other news";
const PER_GROUP = 4;

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  // Headlines are fetched every hour by a scheduled job; Refresh loads the latest file.
  const sync = useCallback(async (force: boolean) => {
    setSyncing(true);
    try {
      if (force) await loadNewsFile(true);
      const h = await newsHealth();
      setSynced(h.generatedAt);
      setSources(h.sources);
      await load();
      if (force) toast(`Updated ${relTime(h.generatedAt)}. New headlines arrive every hour.`);
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setSyncing(false);
    }
  }, [load, toast]);

  useEffect(() => {
    setTitle("News");
    sync(false);
  }, [sync]);

  // Keep the current list on screen while a filter applies, so nothing jumps.
  useEffect(() => {
    load();
    setExpanded(new Set());
  }, [load]);
  // Bring the chosen chip into view (it may be off-screen after "See all").
  useEffect(() => {
    document.querySelector(".chips .chip.on:not(:first-child)")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [topic, src]);

  const openLink = async (e: React.FormEvent) => {
    e.preventDefault();
    let u = url.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    setFetching(true);
    try {
      new URL(u);
      const id = await addLink(u, "");
      setUrl("");
      go(`read/${id}`);
    } catch (err) {
      toast(err instanceof TypeError ? "That doesn't look like a web link" : errMsg(err), { bad: true });
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

  const failing = sources.filter((s) => !s.ok);
  const topics = useMemo(() => ["", ...TOPICS, "Editorial"], []);
  // Grouped by topic so a day's 300+ headlines read like a newspaper's sections.
  const groups = useMemo(() => {
    if (!items) return [];
    if (topic) return [{ name: topic, items }];
    const m = new Map<string, NewsItem[]>();
    for (const it of items) {
      const k = it.topics[0] ?? OTHER;
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    const order = [...topics.slice(1), OTHER];
    return [...m.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([name, items]) => ({ name, items }));
  }, [items, topic, topics]);

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
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste any article link to save it and take notes" aria-label="Article link" inputMode="url" />
        </label>
        <button className="btn primary" disabled={fetching || !url.trim()}>{fetching ? <Loader2 size={17} className="spin" /> : "Fetch"}</button>
      </form>

      <div className="sync">
        <span className={`dot ${failing.length ? "warn" : ""}`} />
        <span>Last checked {relTime(synced)}{sources.length ? ` · ${sources.filter((s) => s.ok).length} sources` : ""}</span>
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
          {sources.map((s) => (
            <button key={s.key} className={`chip ${src === s.key ? "on" : ""}`} style={src === s.key ? { ["--c1" as string]: srcColor(s.key) } : undefined} onClick={() => setSrc(s.key)}>
              <i style={{ width: 8, height: 8, borderRadius: 4, background: srcColor(s.key) }} />{s.name}
            </button>
          ))}
        </div>
      )}

      {items === null ? (
        <div className="nsecs">{[0, 1].map((i) => <div key={i} className="card"><Skeleton lines={5} /></div>)}</div>
      ) : items.length === 0 ? (
        <div className="card empty">
          <Newspaper size={34} />
          <b>{syncing ? "Fetching today's news…" : "Nothing here yet"}</b>
          <span className="tiny">{view === "today" ? "Tap Refresh to check the newspapers, or switch to All." : "Try another topic or paper."}</span>
        </div>
      ) : (
        <div className="nsecs">
          {groups.map((g) => {
            const open = !!topic || expanded.has(g.name) || g.items.length <= PER_GROUP + 1;
            const shown = open ? g.items : g.items.slice(0, PER_GROUP);
            return (
              <section key={`${g.name}-${src}-${view}`} className="nsec">
                {!topic && (
                  <header>
                    <h2>{g.name}</h2>
                    <span className="count">{g.items.length}</span>
                    <span className="grow" />
                    {g.name !== OTHER && <button className="btn soft sm" onClick={() => setTopic(g.name)}>See all</button>}
                  </header>
                )}
                <ul>
                  {shown.map((it) => (
                    <li key={it.id} className={`nrow ${it.status !== "new" ? "read" : ""}`} style={{ ["--src" as string]: srcColor(it.source_key) }}>
                      <button className="nmain" onClick={() => go(`read/${it.id}`)}>
                        <span className="nmeta"><b>{it.source_name}</b><span>{it.published_at ? `${relTime(it.published_at)}` : ""}</span></span>
                        <span className="ntitle">{it.title}</span>
                        {it.description && <span className="ndesc">{it.description}</span>}
                      </button>
                      <div className="nacts">
                        <button className="icon-btn sm" onClick={() => setStatus(it, it.status === "saved" ? "read" : "saved")} aria-label={it.status === "saved" ? "Unsave" : "Save for later"} title="Save for later">
                          {it.status === "saved" ? <BookmarkCheck size={18} color="var(--accent)" /> : <Bookmark size={18} />}
                        </button>
                        <button className="icon-btn sm" onClick={() => setStatus(it, "dismissed")} aria-label="Hide" title="Hide"><X size={16} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
                {!open && (
                  <button className="nmore" onClick={() => setExpanded((x) => new Set(x).add(g.name))}>
                    Show {g.items.length - PER_GROUP} more <ChevronDown size={16} />
                  </button>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

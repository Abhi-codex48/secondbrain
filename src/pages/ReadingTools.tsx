import { useEffect, useMemo, useState } from "react";
import { Flame, Brain, Hash, BookmarkCheck, Highlighter, X, Plus, CloudOff, Trash2, ExternalLink, RotateCcw } from "lucide-react";
import { deleteHighlight, followMatches, getFollowing, listHighlights, listNews, readingDays, readingList, setFollowing, unsaveArticle, type Highlight } from "../lib/api";
import type { NewsItem } from "../lib/types";
import { addDays, fmtDate, istDay } from "../lib/date";
import { go } from "../lib/router";
import { buildQuiz, type Question } from "../lib/quiz";
import { errMsg, Skeleton, useToast } from "../components/ui";

/** More → Progress: streak, daily quiz and followed topics. */
export function ReadingTools() {
  return (
    <div className="rtools">
      <Streak />
      <Quiz />
      <Following />
    </div>
  );
}

export function Panel({ icon, title, color, extra, children }: { icon: React.ReactNode; title: string; color: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rpanel" style={{ ["--r" as string]: color }}>
      <header><span className="ric">{icon}</span><h2>{title}</h2>{extra && <span className="grow" />}{extra}</header>
      {children}
    </section>
  );
}

function Streak() {
  const [days, setDays] = useState<Set<string> | null>(null);
  useEffect(() => { readingDays().then(setDays).catch(() => setDays(new Set())); }, []);
  if (!days) return <Panel icon={<Flame size={18} />} title="Reading streak" color="var(--news-1)"><Skeleton lines={2} /></Panel>;
  const today = istDay();
  let streak = 0;
  for (let d = days.has(today) ? today : addDays(today, -1); days.has(d); d = addDays(d, -1)) streak++;
  const last = Array.from({ length: 35 }, (_, i) => addDays(today, i - 34));
  const month = last.filter((d) => days.has(d)).length;
  return (
    <Panel icon={<Flame size={18} />} title="Reading streak" color="var(--news-1)">
      <div className="streak-n"><b>{streak}</b><span>{streak === 1 ? "day in a row" : "days in a row"}</span><span className="tiny">· {month} active days in the last 5 weeks</span></div>
      <div className="streak-grid" aria-label="Last 5 weeks">
        {last.map((d) => <i key={d} className={days.has(d) ? "on" : d === today ? "today" : ""} title={fmtDate(d)} />)}
      </div>
      <p className="tiny">A day counts when you read an article, write or edit a note, or finish a task.</p>
    </Panel>
  );
}

function Quiz() {
  const day = istDay();
  const key = `sb-quiz-${day}`;
  const [qs, setQs] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState<number | null>(() => { try { const v = localStorage.getItem(key); return v ? Number(v) : null; } catch { return null; } });
  useEffect(() => {
    fetch("./knowledge.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((k) => {
      const lines = [...(k?.top ?? []).map((t: { text: string }) => ({ text: t.text, source: "Wikipedia, In the news" })), ...(k?.events ?? []).map((e: { text: string; sources: { name: string }[] }) => ({ text: e.text, source: e.sources[0]?.name ?? "Wikipedia, Current events" }))];
      setQs(buildQuiz(lines, day));
    }).catch(() => setQs([]));
  }, [day]);
  const restart = () => { setI(0); setPicked(null); setScore(0); setDone(null); };
  if (qs === null) return <Panel icon={<Brain size={18} />} title="Daily quiz" color="var(--notes-1)"><Skeleton lines={2} /></Panel>;
  if (qs.length < 3) return null;
  const q = qs[i];
  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    if (o === q.answer) setScore((s) => s + 1);
  };
  const next = () => {
    if (i + 1 >= qs.length) {
      const final = score;
      setDone(final);
      try { localStorage.setItem(key, String(final)); } catch { /* fine */ }
      return;
    }
    setI(i + 1);
    setPicked(null);
  };
  return (
    <Panel icon={<Brain size={18} />} title="Daily quiz" color="var(--notes-1)" extra={<span className="tiny">From today's world briefing</span>}>
      {done !== null ? (
        <div className="quiz-done">
          <b>{done} of {qs.length}</b><span>{done === qs.length ? "Perfect. Well read!" : done >= qs.length / 2 ? "Good going." : "Read the World briefing on Home and try again."}</span>
          <button className="btn soft sm" onClick={restart}><RotateCcw size={15} />Try again</button>
        </div>
      ) : (
        <div className="quiz">
          <span className="tiny">Question {i + 1} of {qs.length} · fill the blank</span>
          <p className="quiz-q">{q.sentence}</p>
          <div className="quiz-opts">
            {q.options.map((o) => (
              <button key={o} onClick={() => choose(o)} className={picked ? (o === q.answer ? "right" : o === picked ? "wrong" : "") : ""} disabled={!!picked}>{o}</button>
            ))}
          </div>
          {picked && (
            <div className="between">
              <span className="tiny">{picked === q.answer ? "Correct." : `Answer: ${q.answer}`} Source: {q.source}</span>
              <button className="btn primary sm" onClick={next}>{i + 1 >= qs.length ? "See score" : "Next"}</button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function Following() {
  const [keys, setKeys] = useState<string[] | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [add, setAdd] = useState("");
  const toast = useToast();
  useEffect(() => {
    getFollowing().then(setKeys).catch(() => setKeys([]));
    listNews({ day: istDay() }).then(setNews).catch(() => setNews([]));
  }, []);
  const save = async (next: string[]) => {
    try { setKeys(await setFollowing(next)); } catch (e) { toast(errMsg(e), { bad: true }); }
  };
  const counts = useMemo(() => new Map((keys ?? []).map((k) => [k, news.filter((n) => followMatches(n.title, k))])), [keys, news]);
  return (
    <Panel icon={<Hash size={18} />} title="Following" color="var(--more-1)">
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (add.trim()) { save([...(keys ?? []), add.trim()]); setAdd(""); } }}>
        <label className="searchbox grow" style={{ minHeight: 44 }}><Plus size={16} /><input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Follow a topic, person or place (e.g. RBI, Ukraine)" aria-label="Topic to follow" /></label>
        <button className="btn primary sm" disabled={!add.trim()}>Follow</button>
      </form>
      {keys === null ? <Skeleton lines={2} /> : keys.length === 0 ? <p className="tiny">Followed topics show their headlines here and as chips on the News page.</p> : (
        <div className="follow-list">
          {keys.map((k) => {
            const hits = counts.get(k) ?? [];
            return (
              <div key={k} className="follow-row">
                <div className="between">
                  <b>{k} <span className="chip-n">{hits.length} today</span></b>
                  <button className="icon-btn sm" onClick={() => save(keys.filter((x) => x !== k))} aria-label={`Stop following ${k}`}><X size={16} /></button>
                </div>
                {hits.slice(0, 3).map((n) => <a key={n.id} href={`#/read/${n.id}`} className="follow-hit">{n.title}<span className="tiny"> · {n.source_name}</span></a>)}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

export function ReadingList() {
  const [items, setItems] = useState<(NewsItem & { offline: boolean })[] | null>(null);
  const toast = useToast();
  useEffect(() => { readingList().then(setItems).catch(() => setItems([])); }, []);
  return (
    <Panel icon={<BookmarkCheck size={18} />} title="Reading list" color="var(--news-2)" extra={items && <span className="tiny">{items.length} saved</span>}>
      {items === null ? <Skeleton lines={3} /> : items.length === 0 ? <p className="tiny">Tap the bookmark on any headline to save it here. Articles you open are kept on this device so you can read them offline.</p> : (
        <ul className="rlist">
          {items.map((n) => (
            <li key={n.id} className="rrow">
              <a href={`#/read/${n.id}`}>
                <span className="t">{n.title}</span>
                <span className="tiny">{n.source_name}{n.published_at ? ` · ${fmtDate(n.published_at)}` : ""}{n.offline ? <span className="off"><CloudOff size={11} /> readable offline</span> : null}</span>
              </a>
              <button className="icon-btn sm" aria-label={`Remove "${n.title}" from your reading list`} title="Remove" onClick={async () => {
                setItems((xs) => xs?.filter((x) => x.id !== n.id) ?? null);
                await unsaveArticle(n.id).catch((e) => toast(errMsg(e), { bad: true }));
                toast("Removed from your reading list");
              }}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function Highlights() {
  const [items, setItems] = useState<Highlight[] | null>(null);
  const [q, setQ] = useState("");
  const toast = useToast();
  useEffect(() => { listHighlights().then(setItems).catch(() => setItems([])); }, []);
  const shown = (items ?? []).filter((h) => !q || `${h.text} ${h.title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel icon={<Highlighter size={18} />} title="Highlights" color="#d4a106" extra={items && <span className="tiny">{items.length}</span>}>
      {items === null ? <Skeleton lines={3} /> : items.length === 0 ? <p className="tiny">While reading an article, select a passage and tap Highlight. Everything you highlight is collected here.</p> : (
        <>
          {items.length > 4 && <label className="searchbox" style={{ minHeight: 42 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your highlights" aria-label="Search highlights" /></label>}
          <ul className="hlist">
            {shown.map((h) => (
              <li key={h.id}>
                <blockquote>{h.text}</blockquote>
                <div className="between">
                  <button className="tiny hsrc" onClick={() => go(`read/${h.news_id}`)}>{h.title} · {h.source}</button>
                  <span className="row" style={{ gap: 2 }}>
                    {h.url && <a className="icon-btn sm" href={h.url} target="_blank" rel="noopener noreferrer" aria-label="Open original"><ExternalLink size={15} /></a>}
                    <button className="icon-btn sm" aria-label="Delete highlight" onClick={async () => { await deleteHighlight(h.id).catch(() => {}); setItems((xs) => xs?.filter((x) => x.id !== h.id) ?? null); toast("Highlight removed"); }}><Trash2 size={15} /></button>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}


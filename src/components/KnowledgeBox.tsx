import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Check, ChevronDown, ExternalLink, Globe2 } from "lucide-react";
import { saveNote } from "../lib/api";
import { fmtLong } from "../lib/date";
import { errMsg, useToast } from "./ui";

interface Story { text: string; title: string; background: string; url: string; image: string | null }
interface Event { category: string; topic: string; text: string; sources: { name: string; url: string }[]; day: string }
interface Trend { title: string; text: string; url: string; image: string | null; views: number }
interface Briefing { day: string; top: Story[]; events: Event[]; trending: Trend[]; onthisday: { year: number; text: string; url: string | null }[] }

// Wikipedia's category names, shortened, each with its own colour.
const CATS: Record<string, [string, string]> = {
  "Armed conflicts and attacks": ["Wars & conflicts", "#e0384f"],
  "Business and economy": ["Economy & markets", "#18a058"],
  "Politics and elections": ["Politics", "#2f6bff"],
  "International relations": ["World affairs", "#7c4dff"],
  "Disasters and accidents": ["Disasters", "#ff7a45"],
  "Science and technology": ["Science & tech", "#5b5bd6"],
  "Health and environment": ["Health & environment", "#12a5a5"],
  "Law and crime": ["Law & crime", "#6b7280"],
  "Arts and culture": ["Arts & culture", "#d63ca5"],
  "Sports": ["Sports", "#d4a106"],
};
const cat = (c: string): [string, string] => CATS[c] ?? [c, "var(--accent)"];
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
type Tab = "top" | "events" | "trending";

/**
 * World briefing: the day's big stories, wars, economies, politics and science
 * from Wikipedia's editor-written "In the news" and "Current events" pages,
 * with each event linked to the news outlet it cites.
 */
export function KnowledgeBox() {
  const [b, setB] = useState<Briefing | null>(null);
  const [tab, setTab] = useState<Tab>("top");
  const [filter, setFilter] = useState("");
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const toast = useToast();

  useEffect(() => {
    fetch("./knowledge.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j: Briefing | null) => {
      if (!j || !j.top) return setB(null);
      setB(j);
      if (!j.top.length) setTab(j.events.length ? "events" : "trending");
    }).catch(() => setB(null));
  }, []);
  const cats = useMemo(() => [...new Set((b?.events ?? []).map((e) => e.category))], [b]);
  if (!b || !(b.top.length || b.events.length || b.trending.length)) return null;

  const save = (key: string, title: string, html: string, url: string) => {
    try {
      saveNote({ title, body_html: html, source_url: url || null, source_name: "Wikipedia" });
      setSaved((s) => new Set(s).add(key));
      toast("Saved to your notes");
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };
  const SaveBtn = ({ k, title, html, url }: { k: string; title: string; html: string; url: string }) => (
    <button className="icon-btn sm" onClick={() => save(k, title, html, url)} disabled={saved.has(k)} aria-label={`Save "${title}" to notes`} title="Save to notes">
      {saved.has(k) ? <Check size={18} color="var(--ok)" /> : <BookmarkPlus size={18} />}
    </button>
  );

  const events = b.events.filter((e) => !filter || e.category === filter);
  const LIMIT = 6;
  const tabs: [Tab, string, number][] = [["top", "Top stories", b.top.length], ["events", "World events", b.events.length], ["trending", "Trending", b.trending.length]];

  return (
    <section className="kbox" aria-labelledby="kbox-h">
      <header className="kbox-head">
        <span className="kbox-ic"><Globe2 size={20} /></span>
        <div>
          <h2 id="kbox-h">World briefing</h2>
          <span className="tiny">{fmtLong(b.day ? new Date(`${b.day}T12:00:00+05:30`) : undefined)} · from Wikipedia's current-events pages, with the news outlets they cite</span>
        </div>
      </header>

      <div className="ktabs" role="tablist">
        {tabs.filter(([, , n]) => n > 0).map(([t, label, n]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => { setTab(t); setMore(false); }}>
            {label}<span className="chip-n">{n}</span>
          </button>
        ))}
      </div>

      {tab === "top" && (
        <ul className="klist">
          {b.top.slice(0, more ? 99 : 4).map((s) => (
            <li key={s.text}>
              {s.image && <img src={s.image} alt="" loading="lazy" />}
              <div className="kmain">
                <b className="khead">{s.text}</b>
                {s.background && <p><span className="kbg">Background</span>{s.background}</p>}
                {s.url && <a className="ksrc" href={s.url} target="_blank" rel="noopener noreferrer">More about {s.title} <ExternalLink size={12} /></a>}
              </div>
              <SaveBtn k={s.text} title={s.text.slice(0, 120)} url={s.url} html={`<p><b>${esc(s.text)}</b></p>${s.background ? `<p>${esc(s.background)}</p>` : ""}<p>Source: <a href="${esc(s.url)}">Wikipedia, In the news</a></p>`} />
            </li>
          ))}
        </ul>
      )}

      {tab === "events" && (
        <>
          <div className="chips kcats">
            <button className={`chip ${filter === "" ? "on" : ""}`} onClick={() => setFilter("")}>All</button>
            {cats.map((c) => (
              <button key={c} className={`chip ${filter === c ? "on" : ""}`} style={filter === c ? { ["--c1" as string]: cat(c)[1] } : undefined} onClick={() => { setFilter(c); setMore(false); }}>
                <i style={{ width: 8, height: 8, borderRadius: 4, background: cat(c)[1] }} />{cat(c)[0]}
              </button>
            ))}
          </div>
          <ul className="klist">
            {events.slice(0, more ? 999 : LIMIT).map((e, i) => (
              <li key={`${e.day}${i}${e.text.slice(0, 30)}`} style={{ ["--k" as string]: cat(e.category)[1] }}>
                <div className="kmain">
                  <span className="kmeta"><span className="ksub">{cat(e.category)[0]}</span>{e.topic && <span className="ktopic">{e.topic}</span>}</span>
                  <p className="kevent">{e.text}</p>
                  {e.sources.length > 0 && (
                    <span className="ksrcs">Source: {e.sources.map((s, j) => <a key={j} href={s.url} target="_blank" rel="noopener noreferrer">{s.name}<ExternalLink size={11} /></a>)}</span>
                  )}
                </div>
                <SaveBtn k={e.text} title={(e.topic || cat(e.category)[0]).slice(0, 120)} url={e.sources[0]?.url ?? ""} html={`<p>${esc(e.text)}</p><p>Source: ${e.sources.map((s) => `<a href="${esc(s.url)}">${esc(s.name)}</a>`).join(", ") || "Wikipedia, Current events"}</p>`} />
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "trending" && (
        <ul className="klist">
          {b.trending.slice(0, more ? 99 : 5).map((t, i) => (
            <li key={t.title}>
              <span className="krank">{i + 1}</span>
              <div className="kmain">
                <b className="khead">{t.title}</b>
                <p>{t.text}</p>
                <span className="ksrcs">{t.views.toLocaleString("en-IN")} reads yesterday · <a href={t.url} target="_blank" rel="noopener noreferrer">Wikipedia<ExternalLink size={11} /></a></span>
              </div>
              <SaveBtn k={t.title} title={t.title} url={t.url} html={`<p>${esc(t.text)}</p><p>Source: <a href="${esc(t.url)}">Wikipedia</a></p>`} />
            </li>
          ))}
        </ul>
      )}

      {((tab === "top" && b.top.length > 4) || (tab === "events" && events.length > LIMIT) || (tab === "trending" && b.trending.length > 5)) && (
        <button className="nmore" onClick={() => setMore((v) => !v)} aria-expanded={more}>
          {more ? "Show less" : "Show more"} <ChevronDown size={16} style={{ transform: more ? "rotate(180deg)" : undefined }} />
        </button>
      )}
      {b.onthisday.length > 0 && (
        <div className="kotd">
          <h3>On this day</h3>
          <ul className="klist kday">
            {b.onthisday.map((e) => (
              <li key={`${e.year}${e.text.slice(0, 20)}`}>
                <span className="kyear">{e.year}</span>
                <div className="kmain"><p>{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.text}</a> : e.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

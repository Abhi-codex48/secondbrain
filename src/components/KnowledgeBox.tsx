import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Check, ChevronDown, ExternalLink, Globe2 } from "lucide-react";
import { addBookmark, loadNewsFile, onNewsUpdate } from "../lib/api";
import { fmtLong, fmtTime, relTime } from "../lib/date";
import { topStories, type TopStory } from "../../shared/topstories";
import { errMsg, useToast } from "./ui";

import { buildBriefing, type Briefing } from "../../shared/briefing";

const CACHE = "sb-briefing";
const STALE = 90 * 60_000;
const age = (b: Briefing | null) => (b?.generatedAt ? Date.now() - Date.parse(b.generatedAt) : Infinity);
const hasContent = (b: Briefing | null): b is Briefing => !!b && !!(b.top?.length || b.events?.length || b.trending?.length);
const readCache = (): Briefing | null => { try { return JSON.parse(localStorage.getItem(CACHE) ?? "null"); } catch { return null; } };

/** Wikipedia lets browsers read it directly, so a late hourly update never leaves the box stale. */
async function liveBriefing(): Promise<Briefing | null> {
  const get = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const b = await buildBriefing(get).catch(() => null);
  if (!hasContent(b)) return null;
  try { localStorage.setItem(CACHE, JSON.stringify(b)); } catch { /* storage full or blocked */ }
  return b;
}

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
type Tab = "top" | "events" | "trending";

/**
 * World briefing: the day's big stories, wars, economies, politics and science
 * from Wikipedia's editor-written "In the news" and "Current events" pages,
 * with each event linked to the news outlet it cites.
 */
export function KnowledgeBox() {
  const [b, setB] = useState<Briefing | null>(null);
  const [tab, setTab] = useState<Tab>("top");
  // Top stories right now: what most of the newspapers are reporting (from the hourly news file).
  const [fresh, setFresh] = useState<TopStory[]>([]);
  const [openStory, setOpenStory] = useState<string | null>(null);
  useEffect(() => {
    const run = () => loadNewsFile().then((f) => setFresh(topStories(f.items))).catch(() => {});
    run();
    return onNewsUpdate(run);
  }, []);
  const [filter, setFilter] = useState("");
  const [more, setMore] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const toast = useToast();

  useEffect(() => {
    let live = false;
    const show = (j: Briefing) => {
      setB(j);
    };
    (async () => {
      const file: Briefing | null = await fetch("./knowledge.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const cached = readCache();
      // Whichever is newest: the hourly file, or the copy built here earlier.
      const best = [file, cached].filter(hasContent).sort((x, y) => age(x) - age(y))[0] ?? null;
      if (best) show(best);
      if (age(best) > STALE && !live) {
        live = true;
        const fresh = await liveBriefing();
        if (fresh) show(fresh);
      }
    })();
  }, []);
  const cats = useMemo(() => [...new Set((b?.events ?? []).map((e) => e.category))], [b]);
  if (!b || !(fresh.length || b.top.length || b.events.length || b.trending.length)) return null;

  // Saved items go to Library → Bookmarks (your notes stay for your own writing).
  const save = async (key: string, bm: { title: string; url: string; text: string; source: string; kind: string }) => {
    try {
      await addBookmark(bm);
      setSaved((s) => new Set(s).add(key));
      toast("Saved to Library → Bookmarks");
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };
  const SaveBtn = ({ k, ...bm }: { k: string; title: string; url: string; text: string; source: string; kind: string }) => (
    <button className="icon-btn sm" onClick={() => save(k, bm)} disabled={saved.has(k)} aria-label={`Bookmark "${bm.title}"`} title="Bookmark">
      {saved.has(k) ? <Check size={18} color="var(--ok)" /> : <BookmarkPlus size={18} />}
    </button>
  );


  const events = b.events.filter((e) => !filter || e.category === filter).sort((x, y) => y.day.localeCompare(x.day)); // newest day first
  const LIMIT = 6;
  const tabs: [Tab, string, number][] = [["top", "Top stories", fresh.length + b.top.length], ["events", "World events", b.events.length], ["trending", "Trending", b.trending.length]];

  return (
    <section className="kbox" aria-labelledby="kbox-h">
      <header className="kbox-head">
        <span className="kbox-ic"><Globe2 size={20} /></span>
        <div>
          <h2 id="kbox-h">World briefing</h2>
          <span className="tiny">{fmtLong(b.day ? new Date(`${b.day}T12:00:00+05:30`) : undefined)}{b.generatedAt ? ` · updated ${relTime(b.generatedAt)}` : ""} · from Wikipedia's current-events pages, with the news outlets they cite</span>
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
        <>
        {fresh.length > 0 && (
          <>
            <p className="ksec">Right now · most covered by the papers</p>
            <ul className="klist">
              {fresh.slice(0, more ? 99 : 4).map((t) => (
                <li key={t.title} className="kfresh">
                  <span className="kcount" title={`${t.papers.length} newspapers`}><b>{t.papers.length}</b>papers</span>
                  <div className="kmain">
                    <a className="khead" href={`#/read/${t.items[0].id}`}>{t.title}</a>
                    <span className="tiny">{t.section} · latest {fmtTime(t.latest)} · {t.papers.slice(0, 3).join(", ")}{t.papers.length > 3 ? ` +${t.papers.length - 3}` : ""}</span>
                    <button className="ksrc" onClick={() => setOpenStory(openStory === t.title ? null : t.title)} aria-expanded={openStory === t.title}>
                      How each paper reports it <ChevronDown size={13} style={{ transform: openStory === t.title ? "rotate(180deg)" : undefined }} />
                    </button>
                    {openStory === t.title && (
                      <ul className="kpapers">
                        {t.items.map((i) => <li key={i.id}><a href={`#/read/${i.id}`}>{i.title}</a><span className="tiny"> · {i.sourceName}</span></li>)}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {b.top.length > 0 && <p className="ksec">This week's big world stories · Wikipedia</p>}
        <ul className="klist">
          {b.top.slice(0, more ? 99 : fresh.length ? 2 : 4).map((s) => (
            <li key={s.text}>
              {s.image && <img src={s.image} alt="" loading="lazy" />}
              <div className="kmain">
                <b className="khead">{s.text}</b>
                {s.background && <p><span className="kbg">Background</span>{s.background}</p>}
                {s.url && <a className="ksrc" href={s.url} target="_blank" rel="noopener noreferrer">More about {s.title} <ExternalLink size={12} /></a>}
              </div>
              <SaveBtn k={s.text} title={s.text} url={s.url} text={s.background} source="Wikipedia, In the news" kind="World briefing" />
            </li>
          ))}
        </ul>
        </>
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
                <SaveBtn k={e.text} title={e.text} url={e.sources[0]?.url ?? ""} text={e.topic} source={e.sources.map((x) => x.name).join(", ") || "Wikipedia, Current events"} kind={cat(e.category)[0]} />
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
              <SaveBtn k={t.title} title={t.title} url={t.url} text={t.text} source="Wikipedia" kind="Trending" />
            </li>
          ))}
        </ul>
      )}

      {((tab === "top" && (fresh.length > 4 || b.top.length > (fresh.length ? 2 : 4))) || (tab === "events" && events.length > LIMIT) || (tab === "trending" && b.trending.length > 5)) && (
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

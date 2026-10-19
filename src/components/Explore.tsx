import { useEffect, useState } from "react";
import {
  BookOpen, BookMarked, FlaskConical, TrendingUp, Landmark, Lightbulb, Leaf, Type, Building2, Scale, ScrollText, MapPinned, IndianRupee,
  Globe2, HeartPulse, Banknote, Handshake, Flag, ExternalLink, ChevronDown, type LucideIcon,
} from "lucide-react";
import { relTime } from "../lib/date";

interface ReadItem { title: string; url: string; source: string; text: string; date: string | null }
interface Box { key: string; title: string; note: string; items: ReadItem[] }
interface Group { key: string; title: string; boxes: Box[] }

const LOOK: Record<string, [LucideIcon, string]> = {
  longreads: [BookOpen, "#7c4dff"], books: [BookMarked, "#d63ca5"], science: [FlaskConical, "#2f6bff"], economy: [TrendingUp, "#18a058"],
  history: [Landmark, "#b5703a"], ideas: [Lightbulb, "#e3a008"], environment: [Leaf, "#3f9d3f"], words: [Type, "#0aa5a5"],
  govt: [Building2, "#ff7a45"], courts: [Scale, "#6b5bd6"], parliament: [ScrollText, "#e0384f"], states: [MapPinned, "#12a5a5"], rbi: [IndianRupee, "#18a058"],
  un: [Globe2, "#2f6bff"], health: [HeartPulse, "#e0384f"], globaleconomy: [Banknote, "#18a058"], diplomacy: [Handshake, "#7c4dff"], country: [Flag, "#ff7a45"],
};
const TABS: Record<string, string> = { reading: "Reading", india: "India", world: "World" };

/**
 * Explore: reading beyond the news, India and the world, each in its own small
 * box. Refreshed every hour from the publishers' feeds and Wikipedia.
 */
export function Explore() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("sb-explore") || "reading"; } catch { return "reading"; } });
  useEffect(() => {
    fetch("./reads.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((j) => setGroups(j?.groups ?? [])).catch(() => setGroups([]));
  }, []);
  const pick = (t: string) => { setTab(t); try { localStorage.setItem("sb-explore", t); } catch { /* fine */ } };

  // Never show a broken item (a feed that leaked page code instead of text).
  const ok = (i: ReadItem) => i.title && !/[{}]|mw-parser|<\/?\w/.test(`${i.title} ${i.text}`);
  const shown = (groups ?? []).map((g) => ({ ...g, boxes: g.boxes.map((b) => ({ ...b, items: b.items.filter(ok) })).filter((b) => b.items.length) })).filter((g) => g.boxes.length);
  if (!shown.length) return null;
  const g = shown.find((x) => x.key === tab) ?? shown[0];

  return (
    <section className="explore" aria-labelledby="explore-h">
      <div className="explore-head">
        <h2 id="explore-h">Explore</h2>
        <div className="seg" role="tablist" aria-label="Explore">
          {shown.map((x) => (
            <button key={x.key} role="tab" aria-selected={x.key === g.key} className={x.key === g.key ? "on" : ""} onClick={() => pick(x.key)}>{TABS[x.key] ?? x.title}</button>
          ))}
        </div>
      </div>
      <div className="xgrid" key={g.key}>
        {g.boxes.map((b, i) => <XBox key={b.key} b={b} i={i} />)}
      </div>
    </section>
  );
}

function XBox({ b, i }: { b: Box; i: number }) {
  const [open, setOpen] = useState(false);
  const [Icon, color] = LOOK[b.key] ?? [BookOpen, "var(--accent)"];
  const [first, ...rest] = b.items;
  const more = open ? rest : rest.slice(0, 2);
  return (
    <article className="xbox" style={{ ["--x" as string]: color, animationDelay: `${i * 40}ms` }}>
      <header>
        <span className="xic"><Icon size={18} /></span>
        <div className="xt"><h3>{b.title}</h3><span>{b.note}</span></div>
      </header>
      <a className="xlead" href={first.url} target="_blank" rel="noopener noreferrer">
        <b>{first.title}</b>
        {first.text && <p>{first.text}</p>}
        <span className="xsrc">{first.source}{first.date ? ` · ${relTime(first.date)}` : ""} <ExternalLink size={11} /></span>
      </a>
      {more.length > 0 && (
        <ul>
          {more.map((it) => (
            <li key={it.url + it.title}>
              <a href={it.url} target="_blank" rel="noopener noreferrer">
                <span className="xtitle">{it.title}</span>
                <span className="xsrc">{it.source}{it.date ? ` · ${relTime(it.date)}` : ""}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {rest.length > 2 && (
        <button className="xmore" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Show less" : `${rest.length - 2} more`} <ChevronDown size={15} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </button>
      )}
    </article>
  );
}

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronDown, Newspaper } from "lucide-react";
import { relTime } from "../lib/date";
import { Skeleton } from "../components/ui";
import { setTitle } from "../components/Layout";

interface Why { id: string; title: string; source: string }
interface Quote { key: string; name: string; price: number; change: number; changePct: number; currency: string; asOf: string; source: string; unit?: string; why: Why[] }
interface Data { generatedAt: string; groups: { key: string; title: string; items: Quote[] }[]; headlines: Why[] }

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: n >= 1000 ? 0 : n >= 10 ? 2 : 4 });
const fmtChange = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(n) >= 1 ? 2 : 4 });

/**
 * Markets: indices in India and the world, commodities, currencies and
 * Bitcoin, with the day's change and the headlines that explain it.
 */
export function Markets() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    setTitle("Markets");
    fetch("./markets.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true));
  }, []);

  return (
    <div className="page" style={{ ["--c1" as string]: "var(--ok)" }}>
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="kicker" style={{ color: "var(--ok)" }}>Prices and the news behind them</span>
          <h1>Markets</h1>
        </div>
        {d && <span className="tiny">Updated {relTime(d.generatedAt)}</span>}
      </div>

      {err ? (
        <div className="card empty"><TrendingUp size={32} /><b>Market prices aren't available yet</b><span className="tiny">They update every hour. Check back soon.</span></div>
      ) : !d ? (
        <div className="mk-grid">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton lines={4} /></div>)}</div>
      ) : (
        <>
          {d.groups.filter((g) => g.items.length).map((g) => (
            <section key={g.key} className="mk-sec">
              <h2>{g.title}</h2>
              <div className="mk-grid">{g.items.map((q) => <QuoteCard key={q.key} q={q} />)}</div>
            </section>
          ))}
          {d.headlines.length > 0 && (
            <section className="mk-sec">
              <h2>Market news today</h2>
              <ul className="mk-news card">
                {d.headlines.map((h) => (
                  <li key={h.id}><a href={`#/read/${h.id}`}><Newspaper size={15} /><span><b>{h.title}</b><span className="tiny"> · {h.source}</span></span></a></li>
                ))}
              </ul>
            </section>
          )}
          <p className="tiny">Prices are delayed and refreshed every hour (Yahoo Finance, Stooq). "Why it moved" lists today's headlines from the newspapers that mention each market. This is for reading, not investment advice.</p>
        </>
      )}
    </div>
  );
}

function QuoteCard({ q }: { q: Quote }) {
  const [open, setOpen] = useState(false);
  const dir = Math.abs(q.changePct) < 0.005 ? "flat" : q.change > 0 ? "up" : "down";
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  return (
    <article className={`mk-card ${dir}`}>
      <b className="mk-name">{q.name}</b>
      <div className="mk-row">
        <span className="mk-price">{q.unit === "₹" ? "₹" : ""}{fmt(q.price)}</span>
        <span className="mk-ch"><Icon size={14} />{q.change > 0 ? "+" : ""}{q.changePct.toFixed(2)}%</span>
      </div>
      <span className="tiny">{q.change > 0 ? "+" : ""}{fmtChange(q.change)}{q.unit && q.unit !== "₹" ? ` · ${q.unit}` : ""} · {relTime(q.asOf)}</span>
      {q.why.length > 0 ? (
        <>
          <button className="mk-why" onClick={() => setOpen((v) => !v)} aria-expanded={open}>Why it moved ({q.why.length}) <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} /></button>
          {open && <ul className="mk-whylist">{q.why.map((w) => <li key={w.id}><a href={`#/read/${w.id}`}>{w.title}</a><span className="tiny"> · {w.source}</span></li>)}</ul>}
        </>
      ) : <span className="tiny mk-none">No headline about it today</span>}
    </article>
  );
}

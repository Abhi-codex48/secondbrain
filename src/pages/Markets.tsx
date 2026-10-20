import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Newspaper, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { relTime } from "../lib/date";
import { replace, type Route } from "../lib/router";
import { Skeleton } from "../components/ui";
import { setTitle } from "../components/Layout";

interface Why { id: string; title: string; source: string }
interface Quote {
  key: string; name: string; sub?: string; price: number; change: number; changePct: number; currency: string; asOf: string; source: string; unit?: string;
  spark?: number[]; monthPct?: number; dayHigh?: number; dayLow?: number; yearHigh?: number; yearLow?: number; why: Why[];
}
interface Group { key: string; title: string; items: Quote[] }
interface Data { generatedAt: string; groups: Group[]; headlines: Why[] }

const TABS: { key: string; label: string }[] = [
  { key: "india", label: "India" },
  { key: "inshares", label: "Indian shares" },
  { key: "world", label: "World" },
  { key: "wshares", label: "Global shares" },
  { key: "commodities", label: "Commodities" },
  { key: "currencies", label: "Currencies" },
];
// The handful everyone checks first.
const GLANCE = ["nifty", "sensex", "goldinr", "brent", "usdinr", "btc"];
const SHORT: Record<string, string> = { goldinr: "Gold ₹/10g", usdinr: "US$ in ₹", brent: "Brent oil", btc: "Bitcoin" };

const fmt = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 10 ? 2 : 4 });
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const dirOf = (n: number) => (Math.abs(n) < 0.005 ? "flat" : n > 0 ? "up" : "down");
const money = (q: Quote, n: number) => `${q.unit?.startsWith("₹") ? "₹" : q.unit === "$" ? "$" : ""}${fmt(n)}${q.unit === "%" ? "%" : ""}`;

/**
 * Markets: Indian and world indices, top shares, commodities, currencies,
 * bonds and crypto. Each row has a one-month trend line, the day's change,
 * and today's headlines that explain the move.
 */
export function Markets({ route }: { route: Route }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const tab = TABS.some((t) => t.key === route.query.get("t")) ? route.query.get("t")! : "india";
  useEffect(() => {
    setTitle("Markets");
    fetch("./markets.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true));
  }, []);

  const byKey = useMemo(() => new Map((d?.groups ?? []).flatMap((g) => g.items).map((q) => [q.key, q])), [d]);
  const group = d?.groups.find((g) => g.key === tab);
  const glance = GLANCE.map((k) => byKey.get(k)).filter((q): q is Quote => !!q);

  return (
    <div className="page mk-page">
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
        <div className="stack">{[0, 1, 2].map((i) => <div key={i} className="card"><Skeleton lines={3} /></div>)}</div>
      ) : (
        <>
          {glance.length > 0 && (
            <div className="mk-glance">
              {glance.map((q) => (
                <div key={q.key} className={`mk-chip ${dirOf(q.changePct)}`}>
                  <span className="tiny">{SHORT[q.key] ?? q.name}</span>
                  <b>{money(q, q.price)}</b>
                  <span className="mk-pct">{pct(q.changePct)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="chips mk-tabs" role="tablist">
            {TABS.filter((t) => d.groups.some((g) => g.key === t.key && g.items.length)).map((t) => (
              <button key={t.key} role="tab" aria-selected={tab === t.key} className={`chip ${tab === t.key ? "on" : ""}`} onClick={() => replace(`markets?t=${t.key}`)}>{t.label}</button>
            ))}
          </div>

          {group && group.items.length > 0 ? <GroupView g={group} /> : <div className="card empty"><b>No prices in this section right now</b><span className="tiny">They update every hour.</span></div>}

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
          <p className="tiny">Prices are delayed (Yahoo Finance, Stooq) and refreshed every hour. Gold and silver in rupees are the world price converted at today's dollar rate, before import duty and GST. "Why it moved" lists today's headlines that name each item. For reading, not investment advice.</p>
        </>
      )}
    </div>
  );
}

function GroupView({ g }: { g: Group }) {
  const shares = g.key === "inshares" || g.key === "wshares";
  const sorted = [...g.items].sort((a, b) => b.changePct - a.changePct);
  // Commodities read best by kind: metals, energy, farm.
  const parts = g.key === "commodities"
    ? [...new Set(g.items.map((q) => q.sub?.startsWith("In India") ? "In India" : q.sub ?? ""))].map((s) => ({ title: s, items: g.items.filter((q) => (q.sub?.startsWith("In India") ? "In India" : q.sub ?? "") === s) }))
    : [{ title: "", items: g.items }];
  return (
    <section className="mk-sec">
      {shares && sorted.length > 2 && (
        <div className="mk-movers">
          <div className="mk-mover up"><ArrowUpRight size={18} /><span><span className="tiny">Top gainer</span><b>{sorted[0].name}</b></span><span className="mk-pct">{pct(sorted[0].changePct)}</span></div>
          <div className="mk-mover down"><ArrowDownRight size={18} /><span><span className="tiny">Top loser</span><b>{sorted[sorted.length - 1].name}</b></span><span className="mk-pct">{pct(sorted[sorted.length - 1].changePct)}</span></div>
        </div>
      )}
      {parts.map((p) => (
        <div key={p.title} className="mk-part">
          {p.title && <h3 className="mk-sub">{p.title}</h3>}
          <div className="mk-list card">{p.items.map((q) => <Row key={q.key} q={q} hideSub={!!p.title && !q.sub?.startsWith("In India")} />)}</div>
        </div>
      ))}
    </section>
  );
}

function Spark({ v, dir }: { v: number[]; dir: string }) {
  if (v.length < 2) return <span className="mk-spark" />;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * 100).toFixed(1)},${(28 - ((y - min) / span) * 26 - 1).toFixed(1)}`).join(" ");
  return (
    <svg className={`mk-spark ${dir}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,28 ${pts} 100,28`} className="fill" />
      <polyline points={pts} className="line" />
    </svg>
  );
}

function Row({ q, hideSub }: { q: Quote; hideSub: boolean }) {
  const [open, setOpen] = useState(false);
  const dir = dirOf(q.changePct);
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const range = q.yearHigh != null && q.yearLow != null && q.yearHigh > q.yearLow ? Math.min(100, Math.max(0, ((q.price - q.yearLow) / (q.yearHigh - q.yearLow)) * 100)) : null;
  return (
    <div className={`mk-row2 ${dir} ${open ? "open" : ""}`}>
      <button className="mk-main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="mk-id"><b>{q.name}</b>{!hideSub && q.sub && <span className="tiny">{q.sub}</span>}</span>
        <Spark v={q.spark ?? []} dir={dirOf(q.monthPct ?? q.changePct)} />
        <span className="mk-val"><b>{money(q, q.price)}</b><span className="mk-pct"><Icon size={12} />{pct(q.changePct)}</span></span>
      </button>
      {open && (
        <div className="mk-more">
          <div className="mk-facts">
            <span><span className="tiny">Today</span><b className={dir}>{q.change > 0 ? "+" : ""}{fmt(q.change)}</b></span>
            {q.monthPct != null && <span><span className="tiny">1 month</span><b className={dirOf(q.monthPct)}>{pct(q.monthPct)}</b></span>}
            {q.dayLow != null && q.dayHigh != null && <span><span className="tiny">Day range</span><b>{fmt(q.dayLow)} – {fmt(q.dayHigh)}</b></span>}
            {q.unit && <span><span className="tiny">Unit</span><b>{q.unit}</b></span>}
          </div>
          {range != null && (
            <div className="mk-range">
              <span className="tiny">52-week low {fmt(q.yearLow!)}</span>
              <div className="mk-bar"><i style={{ left: `${range}%` }} /></div>
              <span className="tiny">high {fmt(q.yearHigh!)}</span>
            </div>
          )}
          <span className="tiny">{q.source} · {relTime(q.asOf)}</span>
          {q.why.length > 0 ? (
            <ul className="mk-whylist">
              <li className="tiny"><b>Why it moved</b></li>
              {q.why.map((w) => <li key={w.id}><a href={`#/read/${w.id}`}>{w.title}</a><span className="tiny"> · {w.source}</span></li>)}
            </ul>
          ) : <span className="tiny">No headline about it today.</span>}
        </div>
      )}
    </div>
  );
}

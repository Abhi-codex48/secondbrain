import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Plus, X, Search, Crown, BookmarkPlus, Link2, Check, ExternalLink, Info } from "lucide-react";
import { CATEGORIES, INDICATORS, latest, type CountriesFile, type Indicator } from "../../shared/indicators";
import { addBookmark } from "../lib/api";
import { relTime } from "../lib/date";
import { replace, type Route } from "../lib/router";
import { errMsg, Skeleton, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

interface MapFile { w: number; h: number; paths: Record<string, string> }
type Country = CountriesFile["countries"][number];

const PICK = ["#ff6b35", "#3d7bff", "#12b886", "#c84bdb"];
const DEFAULT = ["IND", "CHN", "USA"];
const SUGGEST = ["IND", "CHN", "USA", "JPN", "DEU", "GBR", "FRA", "BRA", "RUS", "BGD", "PAK", "NPL", "LKA", "IDN", "NGA", "ZAF", "AUS", "CAN", "SAU", "ARE"];
const STEPS = [10, 22, 34, 46, 60, 74, 90]; // map shades: % of the accent colour

/** Plain-English numbers: $3.9 trillion, 1.45 billion, 72.1 years. */
export function fmtValue(v: number, ind: Indicator): string {
  const x = v * (ind.scale ?? 1);
  const big = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1e12) return `${(n / 1e12).toFixed(a >= 1e13 ? 1 : 2)} trillion`;
    if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 1 : 2)} billion`;
    if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 1 : 2)} million`;
    return Math.round(n).toLocaleString("en-IN");
  };
  if (ind.unit === "US$" || ind.unit === "international $") return `$${big(x)}`;
  if (ind.unit === "people") return big(x);
  const d = Math.abs(x) >= 100 ? 0 : 1;
  return `${x.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d })}${ind.unit.startsWith("%") ? "%" : ""}`;
}
const unitText = (ind: Indicator) => (ind.unit.startsWith("%") ? ind.unit.replace(/^%\s*/, "").replace(/^\(|\)$/g, "") : ind.unit === "US$" || ind.unit === "international $" || ind.unit === "people" ? "" : ind.unit);

/**
 * World in numbers: official figures (World Bank World Development Indicators)
 * for every country, on a world map, side by side for up to four countries,
 * and as 20-year trends.
 */
export function World({ route }: { route: Route }) {
  const [file, setFile] = useState<CountriesFile | null | undefined>(undefined);
  const [map, setMap] = useState<MapFile | null>(null);
  const toast = useToast();
  useEffect(() => {
    setTitle("World in numbers");
    fetch("./countries.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(setFile).catch(() => setFile(null));
    fetch("./world-map.json").then((r) => (r.ok ? r.json() : null)).then(setMap).catch(() => setMap(null));
  }, []);

  const picked = (route.query.get("c") ?? DEFAULT.join(",")).split(",").filter(Boolean).slice(0, 4);
  const code = INDICATORS.some((i) => i.code === route.query.get("i")) ? route.query.get("i")! : "SP.DYN.LE00.IN";
  const ind = INDICATORS.find((i) => i.code === code)!;
  const go = (c: string[], i = code) => replace(`world?c=${c.join(",")}&i=${encodeURIComponent(i)}`);

  const byId = useMemo(() => new Map((file?.countries ?? []).map((c) => [c.id, c])), [file]);
  const sel = picked.map((id) => byId.get(id)).filter((c): c is Country => !!c);
  const color = (id: string) => PICK[picked.indexOf(id)] ?? "var(--ink-3)";

  if (file === undefined) return <div className="page"><h1>World in numbers</h1><div className="card"><Skeleton lines={6} /></div></div>;
  if (!file) {
    return (
      <div className="page">
        <h1>World in numbers</h1>
        <div className="card empty"><Globe2 size={32} /><b>The figures aren't ready yet</b><span className="tiny">They're downloaded from the World Bank with the next update. Check back soon.</span></div>
      </div>
    );
  }

  const save = async () => {
    try {
      await addBookmark({ title: `${sel.map((c) => c.name).join(" vs ")} · World in numbers`, url: location.href, text: `${ind.name} and ${INDICATORS.length - 1} more figures, side by side.`, source: "World Bank", kind: "World in numbers" });
      toast("Saved to Library → Bookmarks");
    } catch (e) { toast(errMsg(e), { bad: true }); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch { toast("Couldn't copy the link", { bad: true }); } };

  return (
    <div className="page world">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="kicker" style={{ color: "var(--accent)" }}>Official figures for every country</span>
          <h1>World in numbers</h1>
        </div>
        <div className="row" style={{ gap: 4 }}>
          <button className="icon-btn" onClick={save} aria-label="Save this comparison" title="Save to Library"><BookmarkPlus size={20} /></button>
          <button className="icon-btn" onClick={copy} aria-label="Copy link" title="Copy link"><Link2 size={20} /></button>
        </div>
      </div>

      <Picker file={file} picked={picked} color={color} onChange={(c) => go(c)} />

      <Measures code={code} onPick={(c) => go(picked, c)} />

      <WorldMap file={file} map={map} ind={ind} picked={picked} color={color} onToggle={(id) => go(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= 4 ? [...picked.slice(1), id] : [...picked, id])} />

      {sel.length > 0 && <Trend file={file} ind={ind} sel={sel} color={color} />}
      {sel.length > 1 && <Facts file={file} sel={sel} color={color} />}
      {sel.length > 0 && <Compare file={file} sel={sel} color={color} current={code} onPick={(c) => go(picked, c)} />}

      <p className="tiny world-src"><Info size={13} /> Source: World Bank, World Development Indicators (each figure's compiler is shown with it). Latest year reported for each country; updated {relTime(file.generatedAt)}.{" "}
        <a href={`https://data.worldbank.org/indicator/${code}`} target="_blank" rel="noopener noreferrer">{ind.name} on data.worldbank.org <ExternalLink size={11} /></a>
      </p>
    </div>
  );
}

function Picker({ file, picked, color, onChange }: { file: CountriesFile; picked: string[]; color: (id: string) => string; onChange: (c: string[]) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", out, true);
    return () => document.removeEventListener("pointerdown", out, true);
  }, [open]);
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const matches = useMemo(() => {
    const n = norm(q.trim());
    const list = file.countries.filter((c) => !picked.includes(c.id));
    if (!n) return SUGGEST.map((id) => list.find((c) => c.id === id)).filter((c): c is Country => !!c).concat(list.filter((c) => !SUGGEST.includes(c.id))).slice(0, 60);
    return list.filter((c) => norm(c.name).includes(n) || c.id.toLowerCase() === n || norm(c.capital).startsWith(n)).sort((a, b) => Number(!norm(b.name).startsWith(n)) - Number(!norm(a.name).startsWith(n))).slice(0, 60);
  }, [q, file, picked]);
  const add = (id: string) => { onChange(picked.length >= 4 ? [...picked.slice(1), id] : [...picked, id]); setQ(""); setOpen(false); };
  const byId = new Map(file.countries.map((c) => [c.id, c]));
  return (
    <div className="wpick" ref={box}>
      <div className="wchips">
        {picked.map((id) => byId.get(id) && (
          <span key={id} className="wchip" style={{ ["--w" as string]: color(id) }}>
            <i />{byId.get(id)!.name}
            <button onClick={() => onChange(picked.filter((x) => x !== id))} aria-label={`Remove ${byId.get(id)!.name}`}><X size={14} /></button>
          </span>
        ))}
        {picked.length < 4 && <span className="tiny">{picked.length ? "Add up to 4" : "Pick countries to compare"}</span>}
      </div>
      <label className="searchbox wsearch">
        <Search size={18} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) add(matches[0].id); if (e.key === "Escape") setOpen(false); }}
          placeholder={picked.length >= 4 ? "Type a country to swap in" : "Type a country, or pick from the list"} aria-label="Country" />
        <Plus size={18} />
      </label>
      {open && (
        <ul className="wlist" role="listbox">
          {matches.length === 0 ? <li className="tiny" style={{ padding: 12 }}>No country matches “{q}”.</li> : matches.map((c) => (
            <li key={c.id}><button role="option" aria-selected={false} onClick={() => add(c.id)}><b>{c.name}</b><span className="tiny">{c.region}{c.capital ? ` · ${c.capital}` : ""}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Measures({ code, onPick }: { code: string; onPick: (c: string) => void }) {
  const cur = INDICATORS.find((i) => i.code === code)!;
  const [cat, setCat] = useState(cur.cat);
  return (
    <div className="wmeasure">
      <div className="wcats" role="tablist">
        {CATEGORIES.map((c) => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="chips">
        {INDICATORS.filter((i) => i.cat === cat).map((i) => (
          <button key={i.code} className={`chip ${i.code === code ? "on" : ""}`} onClick={() => onPick(i.code)}>{i.short}</button>
        ))}
      </div>
    </div>
  );
}

/** Latest value per country and world rank for one figure. */
function ranking(file: CountriesFile, ind: Indicator) {
  const vals = file.countries.map((c) => ({ id: c.id, l: latest(file.data[ind.code]?.[c.id], file.years) })).filter((x): x is { id: string; l: { v: number; year: number } } => !!x.l);
  const order = [...vals].sort((a, b) => (ind.better === "down" ? a.l.v - b.l.v : b.l.v - a.l.v));
  const rank = new Map(order.map((x, i) => [x.id, i + 1]));
  return { vals, rank, n: order.length, byId: new Map(vals.map((x) => [x.id, x.l])) };
}
const rankText = (ind: Indicator, r: number, n: number) => `#${r} ${ind.better === "down" ? "lowest" : "highest"} of ${n}`;

function WorldMap({ file, map, ind, picked, color, onToggle }: { file: CountriesFile; map: MapFile | null; ind: Indicator; picked: string[]; color: (id: string) => string; onToggle: (id: string) => void }) {
  const { byId, rank, n, vals } = useMemo(() => ranking(file, ind), [file, ind]);
  const [focus, setFocus] = useState<string | null>(null);
  // Seven shades by rank (quantiles), so a few giants don't wash out everyone else.
  const shade = useMemo(() => {
    const sorted = vals.map((x) => x.l.v).sort((a, b) => a - b);
    const cuts = STEPS.slice(1).map((_, i) => sorted[Math.floor(((i + 1) / STEPS.length) * sorted.length)]);
    return (v: number) => STEPS[cuts.filter((c) => v >= c).length];
  }, [vals]);
  const names = useMemo(() => new Map(file.countries.map((c) => [c.id, c.name])), [file]);
  const lo = Math.min(...vals.map((x) => x.l.v)), hi = Math.max(...vals.map((x) => x.l.v));
  const f = focus ? byId.get(focus) : null;
  return (
    <section className="card wmap">
      <div className="between" style={{ alignItems: "baseline" }}>
        <h2>{ind.name}</h2>
        <span className="tiny">{unitText(ind) || ind.unit} · tap a country</span>
      </div>
      {!map ? <Skeleton lines={5} /> : (
        <svg viewBox={`0 0 ${map.w} ${map.h}`} className="wsvg" role="img" aria-label={`World map of ${ind.name}`}>
          {Object.entries(map.paths).map(([id, d]) => {
            const v = byId.get(id);
            const on = picked.includes(id);
            return (
              <path key={id} d={d} className={`wland ${focus === id ? "focus" : ""}`}
                style={{ fill: v ? `color-mix(in srgb, var(--accent) ${shade(v.v)}%, var(--surface))` : "var(--surface-2)", stroke: on ? color(id) : undefined, strokeWidth: on ? 2.4 : undefined }}
                onClick={() => setFocus(focus === id ? null : id)}>
                <title>{names.get(id) ?? id}{v ? `: ${fmtValue(v.v, ind)} (${v.year})` : ": no figure"}</title>
              </path>
            );
          })}
        </svg>
      )}
      <div className="wlegend">
        <span className="tiny">{Number.isFinite(lo) ? fmtValue(lo, ind) : ""}</span>
        <i style={{ background: `linear-gradient(90deg, ${STEPS.map((s) => `color-mix(in srgb, var(--accent) ${s}%, var(--surface))`).join(", ")})` }} />
        <span className="tiny">{Number.isFinite(hi) ? fmtValue(hi, ind) : ""}</span>
      </div>
      {focus && (
        <div className="wfocus">
          <div className="grow">
            <b>{names.get(focus) ?? focus}</b>
            <span className="tiny">{f ? `${fmtValue(f.v, ind)} ${unitText(ind)} · ${f.year} · ${rankText(ind, rank.get(focus)!, n)}` : "No figure reported"}</span>
          </div>
          {names.has(focus) && (
            <button className={`btn sm ${picked.includes(focus) ? "line" : "primary"}`} onClick={() => { onToggle(focus); setFocus(null); }}>
              {picked.includes(focus) ? <><X size={15} />Remove</> : <><Plus size={15} />Compare</>}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Trend({ file, ind, sel, color }: { file: CountriesFile; ind: Indicator; sel: Country[]; color: (id: string) => string }) {
  // Drawn about as wide as a phone, so the labels stay readable when it scales.
  const W = 400, H = 220, L = 52, R = 10, T = 10, B = 24;
  const series = sel.map((c) => ({ id: c.id, name: c.name, s: file.data[ind.code]?.[c.id] ?? [] }));
  const world = file.world[ind.code] ?? [];
  const all = [...series.flatMap((x) => x.s), ...world].filter((v): v is number => v != null);
  if (!all.length) return null;
  const years = file.years;
  const min = Math.min(0, ...all), max = Math.max(...all) || 1;
  const x = (i: number) => L + (i / Math.max(1, years.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / (max - min || 1)) * (H - T - B);
  const line = (s: (number | null)[]) => s.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const ticks = [min, (min + max) / 2, max];
  const yearTicks = years.filter((yr, i) => i === 0 || i === years.length - 1 || (yr % 5 === 0 && i > 1 && i < years.length - 2));
  return (
    <section className="card wtrend">
      <h2>{ind.name} since {years[0]}</h2>
      <svg viewBox={`0 0 ${W} ${H}`} className="wchart" role="img" aria-label={`${ind.name} over time`}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="wgrid" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="waxis">{fmtValue(t, ind).replace(/ (trillion|billion|million)/, (m) => m[1].toUpperCase())}</text>
          </g>
        ))}
        {yearTicks.map((yr, k) => <text key={yr} x={x(years.indexOf(yr))} y={H - 6} textAnchor={k === 0 ? "start" : k === yearTicks.length - 1 ? "end" : "middle"} className="waxis">{yr}</text>)}
        {world.some((v) => v != null) && <polyline points={line(world)} className="wworld" />}
        {series.map((s) => <polyline key={s.id} points={line(s.s)} fill="none" stroke={color(s.id)} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round" />)}
      </svg>
      <div className="wkey">
        {series.map((s) => <span key={s.id}><i style={{ background: color(s.id) }} />{s.name}</span>)}
        {world.some((v) => v != null) && <span><i className="dash" />World average</span>}
      </div>
    </section>
  );
}

function Facts({ file, sel, color }: { file: CountriesFile; sel: Country[]; color: (id: string) => string }) {
  const facts = useMemo(() => {
    const out: { id: string; text: string }[] = [];
    for (const code of ["SP.DYN.LE00.IN", "NY.GDP.PCAP.CD", "SP.DYN.IMRT.IN", "SP.POP.BRTH.MF", "IT.NET.USER.ZS", "SE.ADT.LITR.ZS", "EN.GHG.CO2.PC.CE.AR5", "NY.GDP.MKTP.KD.ZG"]) {
      const ind = INDICATORS.find((i) => i.code === code)!;
      const vals = sel.map((c) => ({ c, l: latest(file.data[code]?.[c.id], file.years) })).filter((x): x is { c: Country; l: { v: number; year: number } } => !!x.l);
      if (vals.length < 2) continue;
      const top = [...vals].sort((a, b) => (ind.better === "down" ? a.l.v - b.l.v : b.l.v - a.l.v))[0];
      const verb: Record<string, string> = {
        "SP.DYN.LE00.IN": "People live longest in", "NY.GDP.PCAP.CD": "Richest per person:", "SP.DYN.IMRT.IN": "Fewest babies die in", "SP.POP.BRTH.MF": "Most boys born per 100 girls:",
        "IT.NET.USER.ZS": "Most people online:", "SE.ADT.LITR.ZS": "Most adults can read:", "EN.GHG.CO2.PC.CE.AR5": "Lowest emissions per person:", "NY.GDP.MKTP.KD.ZG": "Fastest-growing economy:",
      };
      out.push({ id: top.c.id, text: `${verb[code]} ${top.c.name} (${fmtValue(top.l.v, ind)}${unitText(ind) ? ` ${unitText(ind)}` : ""}, ${top.l.year})` });
    }
    return out.slice(0, 6);
  }, [file, sel]);
  if (!facts.length) return null;
  return (
    <section className="wfacts">
      {facts.map((f) => <div key={f.text} className="wfact" style={{ ["--w" as string]: color(f.id) }}><Crown size={16} /><span>{f.text}</span></div>)}
    </section>
  );
}

function Compare({ file, sel, color, current, onPick }: { file: CountriesFile; sel: Country[]; color: (id: string) => string; current: string; onPick: (c: string) => void }) {
  const ranks = useMemo(() => new Map(INDICATORS.map((ind) => [ind.code, ranking(file, ind)])), [file]);
  return (
    <section className="wcompare">
      <h2>Side by side</h2>
      {CATEGORIES.map((cat) => (
        <div key={cat} className="card wcat">
          <h3>{cat}</h3>
          {INDICATORS.filter((i) => i.cat === cat).map((ind) => {
            const r = ranks.get(ind.code)!;
            const rows = sel.map((c) => ({ c, l: r.byId.get(c.id) }));
            const have = rows.filter((x) => x.l);
            const max = Math.max(...have.map((x) => Math.abs(x.l!.v)), 0) || 1;
            const best = ind.better && have.length > 1 ? [...have].sort((a, b) => (ind.better === "down" ? a.l!.v - b.l!.v : b.l!.v - a.l!.v))[0].c.id : null;
            return (
              <button key={ind.code} className={`wrow ${current === ind.code ? "on" : ""}`} onClick={() => { onPick(ind.code); window.scrollTo({ top: 0, behavior: "smooth" }); }} title="Show on the map">
                <span className="wlabel"><b>{ind.short}</b><span className="tiny">{unitText(ind) || ind.unit}</span></span>
                <span className="wbars">
                  {rows.map(({ c, l }) => (
                    <span key={c.id} className="wbar" style={{ ["--w" as string]: color(c.id) }}>
                      <i style={{ width: l ? `${Math.max(2, (Math.abs(l.v) / max) * 100)}%` : 0 }} />
                      <span className="wval">{l ? fmtValue(l.v, ind) : "—"}{best === c.id && <Check size={13} />}</span>
                      <span className="wrank tiny">{l ? `${rankText(ind, r.rank.get(c.id)!, r.n)} · ${l.year}` : "not reported"}</span>
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}

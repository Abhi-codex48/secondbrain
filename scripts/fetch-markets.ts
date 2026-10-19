// Builds the Markets page: stock indices in India and the world, commodities,
// currencies and Bitcoin, each with its latest price and the day's change, plus
// the headlines from today's news that mention it (the reasons the papers give
// for the move). Prices come from Yahoo Finance's public chart data, with Stooq
// as a fallback; they are delayed and refreshed every hour.
//   node --experimental-strip-types scripts/fetch-markets.ts <out> <news.json> [previousUrl]
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [out = "markets.json", newsPath = "news.json", previousUrl] = process.argv.slice(2);
const UA = "Mozilla/5.0 (compatible; SecondBrainMarkets/1.0; https://github.com/Abhi-codex48/secondbrain)";

interface Asset { key: string; name: string; yahoo: string; stooq?: string; unit?: string; about: RegExp }
export interface Quote { key: string; name: string; price: number; change: number; changePct: number; currency: string; asOf: string; source: string; unit?: string }

const GROUPS: { key: string; title: string; assets: Asset[] }[] = [
  {
    key: "india", title: "India", assets: [
      { key: "nifty", name: "Nifty 50", yahoo: "^NSEI", about: /\b(Nifty|Sensex|Dalal Street|D-Street|stock market|equit(y|ies)|FPIs?|FIIs?)\b/i },
      { key: "sensex", name: "Sensex", yahoo: "^BSESN", about: /\b(Sensex|Nifty|Dalal Street|BSE)\b/i },
      { key: "banknifty", name: "Nifty Bank", yahoo: "^NSEBANK", about: /\b(bank(ing)? stocks?|Bank Nifty|Nifty Bank|PSU banks?)\b/i },
      { key: "usdinr", name: "US dollar in rupees", yahoo: "INR=X", stooq: "usdinr", unit: "₹", about: /\b(rupee|forex|dollar index|RBI intervention)\b/i },
    ],
  },
  {
    key: "world", title: "World markets", assets: [
      { key: "sp500", name: "S&P 500 (US)", yahoo: "^GSPC", stooq: "^spx", about: /\b(Wall Street|S&P 500|US stocks?|Dow|Nasdaq|Federal Reserve|Fed)\b/i },
      { key: "dow", name: "Dow Jones (US)", yahoo: "^DJI", stooq: "^dji", about: /\b(Dow Jones|Dow|Wall Street)\b/i },
      { key: "nasdaq", name: "Nasdaq (US tech)", yahoo: "^IXIC", stooq: "^ndq", about: /\b(Nasdaq|tech stocks?|Nvidia|Apple|Microsoft)\b/i },
      { key: "ftse", name: "FTSE 100 (UK)", yahoo: "^FTSE", stooq: "^ukx", about: /\b(FTSE|London stocks?|Bank of England)\b/i },
      { key: "dax", name: "DAX (Germany)", yahoo: "^GDAXI", stooq: "^dax", about: /\b(DAX|European (stocks?|markets?)|ECB)\b/i },
      { key: "nikkei", name: "Nikkei 225 (Japan)", yahoo: "^N225", stooq: "^nkx", about: /\b(Nikkei|Japan(ese)? (stocks?|markets?)|Bank of Japan|yen)\b/i },
      { key: "hangseng", name: "Hang Seng (Hong Kong)", yahoo: "^HSI", stooq: "^hsi", about: /\b(Hang Seng|Hong Kong stocks?)\b/i },
      { key: "shanghai", name: "Shanghai Composite (China)", yahoo: "000001.SS", stooq: "^shc", about: /\b(Shanghai|China'?s? (stocks?|markets?|economy)|yuan)\b/i },
    ],
  },
  {
    key: "commodities", title: "Commodities", assets: [
      { key: "gold", name: "Gold", yahoo: "GC=F", stooq: "xauusd", unit: "$ per ounce", about: /\bgold\b/i },
      { key: "silver", name: "Silver", yahoo: "SI=F", stooq: "xagusd", unit: "$ per ounce", about: /\bsilver\b/i },
      { key: "brent", name: "Brent crude oil", yahoo: "BZ=F", stooq: "cb.f", unit: "$ per barrel", about: /\b(crude|oil prices?|Brent|OPEC\+?|petrol|diesel)\b/i },
      { key: "wti", name: "WTI crude oil (US)", yahoo: "CL=F", stooq: "cl.f", unit: "$ per barrel", about: /\b(crude|WTI|oil prices?)\b/i },
      { key: "natgas", name: "Natural gas", yahoo: "NG=F", stooq: "ng.f", unit: "$ per mmBtu", about: /\b(natural gas|LNG|gas prices?)\b/i },
      { key: "copper", name: "Copper", yahoo: "HG=F", stooq: "hg.f", unit: "$ per pound", about: /\bcopper\b/i },
    ],
  },
  {
    key: "currencies", title: "Currencies & crypto", assets: [
      { key: "eurusd", name: "Euro in US dollars", yahoo: "EURUSD=X", stooq: "eurusd", about: /\b(euro|ECB)\b/i },
      { key: "usdjpy", name: "US dollar in yen", yahoo: "JPY=X", stooq: "usdjpy", about: /\b(yen|Bank of Japan)\b/i },
      { key: "gbpusd", name: "Pound in US dollars", yahoo: "GBPUSD=X", stooq: "gbpusd", about: /\b(pound|sterling|Bank of England)\b/i },
      { key: "btc", name: "Bitcoin", yahoo: "BTC-USD", stooq: "btcusd", about: /\b(bitcoin|crypto(currenc(y|ies))?)\b/i },
    ],
  },
];

async function get(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json,text/csv,*/*" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

async function fromYahoo(a: Asset): Promise<Quote> {
  // With a one-day range, chartPreviousClose is the previous session's close.
  const j = JSON.parse(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.yahoo)}?range=1d&interval=1d`));
  const m = j.chart?.result?.[0]?.meta;
  const price = m?.regularMarketPrice;
  const prev = m?.chartPreviousClose ?? m?.previousClose;
  if (typeof price !== "number" || typeof prev !== "number" || !prev) throw new Error("no price");
  return { key: a.key, name: a.name, price, change: price - prev, changePct: ((price - prev) / prev) * 100, currency: m.currency ?? "", asOf: new Date((m.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(), source: "Yahoo Finance", unit: a.unit };
}

async function fromStooq(a: Asset): Promise<Quote> {
  if (!a.stooq) throw new Error("no fallback");
  // Last 10 daily closes; the change is today's (or the latest) close against the one before.
  const csv = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(a.stooq)}&i=d&d1=${new Date(Date.now() - 15 * 86400_000).toISOString().slice(0, 10).replace(/-/g, "")}`);
  const rows = csv.trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r.length >= 5 && !Number.isNaN(Number(r[4])));
  if (rows.length < 2) throw new Error("no rows");
  const [prev, last] = [Number(rows[rows.length - 2][4]), Number(rows[rows.length - 1][4])];
  return { key: a.key, name: a.name, price: last, change: last - prev, changePct: ((last - prev) / prev) * 100, currency: "", asOf: new Date(`${rows[rows.length - 1][0]}T00:00:00Z`).toISOString(), source: "Stooq", unit: a.unit };
}

interface NewsItem { id: string; title: string; url: string; sourceName: string; publishedAt: string | null; topics: string[] }

async function main() {
  const news: NewsItem[] = existsSync(newsPath) ? JSON.parse(readFileSync(newsPath, "utf8")).items : [];
  const recent = news.filter((n) => !n.publishedAt || Date.now() - Date.parse(n.publishedAt) < 36 * 3600_000);
  const business = recent.filter((n) => n.topics[0] === "Business" || /\b(markets?|stocks?|shares?|Sensex|Nifty|crude|gold|rupee)\b/i.test(n.title));
  const report: string[] = [];
  const groups = await Promise.all(GROUPS.map(async (g) => ({
    key: g.key, title: g.title,
    items: (await Promise.all(g.assets.map(async (a) => {
      let q: Quote | null = null;
      try { q = await fromYahoo(a); } catch (e) {
        try { q = await fromStooq(a); report.push(`${a.name}: Yahoo ${(e as Error).message}, used Stooq`); } catch (e2) { report.push(`FAIL ${a.name}: Yahoo ${(e as Error).message}; Stooq ${(e2 as Error).message}`); }
      }
      if (!q) return null;
      // Why it moved: the day's headlines that name this market.
      const why = business.filter((n) => a.about.test(n.title)).slice(0, 4).map((n) => ({ id: n.id, title: n.title, source: n.sourceName }));
      return { ...q, why };
    }))).filter(Boolean),
  })));

  const total = groups.reduce((s, g) => s + g.items.length, 0);
  if (!total && previousUrl) {
    try {
      writeFileSync(out, await get(previousUrl));
      console.log("markets.json: no prices this hour, kept the previous file");
      return;
    } catch { /* nothing to keep */ }
  }
  const headlines = business.filter((n) => /\b(markets?|stocks?|shares?|Sensex|Nifty|Wall Street|crude|gold|rupee|bond|yields?|inflation|Fed|RBI|rate)\b/i.test(n.title)).slice(0, 12).map((n) => ({ id: n.id, title: n.title, source: n.sourceName }));
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), groups, headlines }));
  console.log(`markets.json: ${total} prices, ${headlines.length} market headlines`);
  for (const r of report) console.log(r);
}

if (process.argv[1]?.endsWith("fetch-markets.ts")) {
  main().catch((e) => {
    console.error(e);
    writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), groups: [], headlines: [] }));
  });
}

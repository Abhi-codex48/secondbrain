// Builds the Markets page: stock indices in India and the world, commodities,
// currencies and Bitcoin, each with its latest price and the day's change, plus
// the headlines from today's news that mention it (the reasons the papers give
// for the move). Prices come from Yahoo Finance's public chart data, with Stooq
// as a fallback; they are delayed and refreshed every hour.
//   node --experimental-strip-types scripts/fetch-markets.ts <out> <news.json> [previousUrl]
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [out = "markets.json", newsPath = "news.json", previousUrl] = process.argv.slice(2);
const UA = "Mozilla/5.0 (compatible; SecondBrainMarkets/1.0; https://github.com/Abhi-codex48/secondbrain)";

interface Asset { key: string; name: string; yahoo: string; stooq?: string; unit?: string; sub?: string; about?: RegExp }
export interface Quote {
  key: string; name: string; sub?: string; price: number; change: number; changePct: number; currency: string; asOf: string; source: string; unit?: string;
  /** Daily closes for about the last month, oldest first: the small trend line. */
  spark?: number[]; monthPct?: number; dayHigh?: number; dayLow?: number; yearHigh?: number; yearLow?: number;
}

// "why it moved" matches headlines naming the asset; by default its name.
const word = (s: string) => new RegExp(`\\b(${s})\\b`, "i");
const stock = (key: string, name: string, yahoo: string, sub: string, about = name): Asset => ({ key, name, yahoo, sub, about: word(about) });

const GROUPS: { key: string; title: string; assets: Asset[] }[] = [
  {
    key: "india", title: "India indices", assets: [
      { key: "nifty", name: "Nifty 50", yahoo: "^NSEI", sub: "NSE · top 50", about: /\b(Nifty|Sensex|Dalal Street|D-Street|stock market|equit(y|ies)|FPIs?|FIIs?)\b/i },
      { key: "sensex", name: "Sensex", yahoo: "^BSESN", sub: "BSE · top 30", about: /\b(Sensex|Nifty|Dalal Street|BSE)\b/i },
      { key: "banknifty", name: "Nifty Bank", yahoo: "^NSEBANK", sub: "Banks", about: /\b(bank(ing)? stocks?|Bank Nifty|Nifty Bank|PSU banks?)\b/i },
      { key: "niftyit", name: "Nifty IT", yahoo: "^CNXIT", sub: "IT companies", about: /\b(IT stocks?|Nifty IT|IT sector|IT services)\b/i },
      { key: "niftyauto", name: "Nifty Auto", yahoo: "^CNXAUTO", sub: "Carmakers", about: /\b(auto stocks?|Nifty Auto|automobile|car sales)\b/i },
      { key: "niftypharma", name: "Nifty Pharma", yahoo: "^CNXPHARMA", sub: "Medicines", about: /\b(pharma stocks?|Nifty Pharma|drugmakers?)\b/i },
      { key: "niftyfmcg", name: "Nifty FMCG", yahoo: "^CNXFMCG", sub: "Consumer goods", about: /\b(FMCG)\b/i },
      { key: "niftymetal", name: "Nifty Metal", yahoo: "^CNXMETAL", sub: "Steel & metals", about: /\b(metal stocks?|Nifty Metal|steel)\b/i },
      { key: "indiavix", name: "India VIX", yahoo: "^INDIAVIX", sub: "Fear gauge", about: /\b(VIX|volatility)\b/i },
    ],
  },
  {
    key: "inshares", title: "Indian shares", assets: [
      stock("reliance", "Reliance Industries", "RELIANCE.NS", "Energy, retail, Jio", "Reliance|RIL|Jio"),
      stock("hdfcbank", "HDFC Bank", "HDFCBANK.NS", "Bank", "HDFC Bank"),
      stock("icicibank", "ICICI Bank", "ICICIBANK.NS", "Bank", "ICICI Bank"),
      stock("sbi", "State Bank of India", "SBIN.NS", "Bank", "SBI|State Bank of India"),
      stock("tcs", "TCS", "TCS.NS", "IT services", "TCS|Tata Consultancy"),
      stock("infosys", "Infosys", "INFY.NS", "IT services", "Infosys"),
      stock("airtel", "Bharti Airtel", "BHARTIARTL.NS", "Telecom", "Airtel|Bharti"),
      stock("lt", "Larsen & Toubro", "LT.NS", "Engineering", "L&T|Larsen"),
      stock("itc", "ITC", "ITC.NS", "Consumer goods", "ITC"),
      stock("hul", "Hindustan Unilever", "HINDUNILVR.NS", "Consumer goods", "HUL|Hindustan Unilever"),
      stock("maruti", "Maruti Suzuki", "MARUTI.NS", "Cars", "Maruti"),
      stock("sunpharma", "Sun Pharma", "SUNPHARMA.NS", "Medicines", "Sun Pharma"),
      stock("adanient", "Adani Enterprises", "ADANIENT.NS", "Conglomerate", "Adani"),
      stock("tatasteel", "Tata Steel", "TATASTEEL.NS", "Steel", "Tata Steel"),
      stock("ongc", "ONGC", "ONGC.NS", "Oil & gas", "ONGC"),
      stock("bajfinance", "Bajaj Finance", "BAJFINANCE.NS", "Lending", "Bajaj Finance"),
    ],
  },
  {
    key: "world", title: "World indices", assets: [
      { key: "sp500", name: "S&P 500", yahoo: "^GSPC", stooq: "^spx", sub: "United States", about: /\b(Wall Street|S&P 500|US stocks?|Federal Reserve|Fed)\b/i },
      { key: "dow", name: "Dow Jones", yahoo: "^DJI", stooq: "^dji", sub: "United States", about: /\b(Dow Jones|Dow|Wall Street)\b/i },
      { key: "nasdaq", name: "Nasdaq", yahoo: "^IXIC", stooq: "^ndq", sub: "US tech", about: /\b(Nasdaq|tech stocks?)\b/i },
      { key: "ftse", name: "FTSE 100", yahoo: "^FTSE", stooq: "^ukx", sub: "United Kingdom", about: /\b(FTSE|London stocks?|Bank of England)\b/i },
      { key: "dax", name: "DAX", yahoo: "^GDAXI", stooq: "^dax", sub: "Germany", about: /\b(DAX|German stocks?)\b/i },
      { key: "stoxx50", name: "Euro Stoxx 50", yahoo: "^STOXX50E", sub: "Eurozone", about: /\b(European (stocks?|markets?)|ECB|Stoxx)\b/i },
      { key: "nikkei", name: "Nikkei 225", yahoo: "^N225", stooq: "^nkx", sub: "Japan", about: /\b(Nikkei|Japan(ese)? (stocks?|markets?)|Bank of Japan)\b/i },
      { key: "hangseng", name: "Hang Seng", yahoo: "^HSI", stooq: "^hsi", sub: "Hong Kong", about: /\b(Hang Seng|Hong Kong stocks?)\b/i },
      { key: "shanghai", name: "Shanghai Composite", yahoo: "000001.SS", stooq: "^shc", sub: "China", about: /\b(Shanghai|China'?s? (stocks?|markets?))\b/i },
      { key: "kospi", name: "Kospi", yahoo: "^KS11", sub: "South Korea", about: /\b(Kospi|Korean stocks?)\b/i },
      { key: "bovespa", name: "Bovespa", yahoo: "^BVSP", sub: "Brazil", about: /\b(Bovespa|Brazil(ian)? stocks?)\b/i },
    ],
  },
  {
    key: "wshares", title: "Global shares", assets: [
      stock("nvidia", "Nvidia", "NVDA", "Chips · US"),
      stock("apple", "Apple", "AAPL", "Phones & computers · US"),
      stock("microsoft", "Microsoft", "MSFT", "Software · US"),
      stock("alphabet", "Alphabet (Google)", "GOOGL", "Internet · US", "Alphabet|Google"),
      stock("amazon", "Amazon", "AMZN", "Shopping & cloud · US"),
      stock("meta", "Meta", "META", "Social media · US", "Meta|Facebook|Instagram"),
      stock("tesla", "Tesla", "TSLA", "Electric cars · US", "Tesla|Musk"),
      stock("tsmc", "TSMC", "TSM", "Chips · Taiwan", "TSMC|Taiwan Semiconductor"),
      stock("samsung", "Samsung Electronics", "005930.KS", "Electronics · Korea", "Samsung"),
      stock("aramco", "Saudi Aramco", "2222.SR", "Oil · Saudi Arabia", "Aramco"),
    ],
  },
  {
    key: "commodities", title: "Commodities", assets: [
      { key: "gold", name: "Gold", yahoo: "GC=F", stooq: "xauusd", unit: "$ per ounce", sub: "Metals", about: /\bgold\b/i },
      { key: "silver", name: "Silver", yahoo: "SI=F", stooq: "xagusd", unit: "$ per ounce", sub: "Metals", about: /\bsilver\b/i },
      { key: "platinum", name: "Platinum", yahoo: "PL=F", unit: "$ per ounce", sub: "Metals", about: /\bplatinum\b/i },
      { key: "copper", name: "Copper", yahoo: "HG=F", stooq: "hg.f", unit: "$ per pound", sub: "Metals", about: /\bcopper\b/i },
      { key: "aluminium", name: "Aluminium", yahoo: "ALI=F", unit: "$ per tonne", sub: "Metals", about: /\balumin(i)?um\b/i },
      { key: "brent", name: "Brent crude oil", yahoo: "BZ=F", stooq: "cb.f", unit: "$ per barrel", sub: "Energy", about: /\b(crude|oil prices?|Brent|OPEC\+?)\b/i },
      { key: "wti", name: "WTI crude oil", yahoo: "CL=F", stooq: "cl.f", unit: "$ per barrel", sub: "Energy", about: /\b(crude|WTI|oil prices?)\b/i },
      { key: "natgas", name: "Natural gas", yahoo: "NG=F", stooq: "ng.f", unit: "$ per mmBtu", sub: "Energy", about: /\b(natural gas|LNG|gas prices?)\b/i },
      { key: "gasoline", name: "Petrol (US gasoline)", yahoo: "RB=F", unit: "$ per gallon", sub: "Energy", about: /\b(petrol|gasoline|fuel prices?)\b/i },
      { key: "wheat", name: "Wheat", yahoo: "ZW=F", unit: "US cents per bushel", sub: "Farm", about: /\bwheat\b/i },
      { key: "corn", name: "Corn (maize)", yahoo: "ZC=F", unit: "US cents per bushel", sub: "Farm", about: /\b(corn|maize)\b/i },
      { key: "soybean", name: "Soybeans", yahoo: "ZS=F", unit: "US cents per bushel", sub: "Farm", about: /\bsoy(a|bean)s?\b/i },
      { key: "sugar", name: "Sugar", yahoo: "SB=F", unit: "US cents per pound", sub: "Farm", about: /\bsugar\b/i },
      { key: "coffee", name: "Coffee", yahoo: "KC=F", unit: "US cents per pound", sub: "Farm", about: /\bcoffee\b/i },
      { key: "cotton", name: "Cotton", yahoo: "CT=F", unit: "US cents per pound", sub: "Farm", about: /\bcotton\b/i },
      { key: "cocoa", name: "Cocoa", yahoo: "CC=F", unit: "$ per tonne", sub: "Farm", about: /\b(cocoa|chocolate)\b/i },
    ],
  },
  {
    key: "currencies", title: "Currencies, bonds & crypto", assets: [
      { key: "usdinr", name: "US dollar", yahoo: "INR=X", stooq: "usdinr", unit: "₹", sub: "in rupees", about: /\b(rupee|forex|RBI intervention)\b/i },
      { key: "eurinr", name: "Euro", yahoo: "EURINR=X", unit: "₹", sub: "in rupees", about: /\b(euro)\b/i },
      { key: "gbpinr", name: "British pound", yahoo: "GBPINR=X", unit: "₹", sub: "in rupees", about: /\b(pound|sterling)\b/i },
      { key: "aedinr", name: "UAE dirham", yahoo: "AEDINR=X", unit: "₹", sub: "in rupees", about: /\b(dirham|UAE)\b/i },
      { key: "dxy", name: "Dollar index", yahoo: "DX-Y.NYB", sub: "Dollar vs 6 currencies", about: /\b(dollar index|greenback)\b/i },
      { key: "eurusd", name: "Euro in US dollars", yahoo: "EURUSD=X", stooq: "eurusd", sub: "Currency", about: /\b(euro|ECB)\b/i },
      { key: "usdjpy", name: "US dollar in yen", yahoo: "JPY=X", stooq: "usdjpy", sub: "Currency", about: /\b(yen|Bank of Japan)\b/i },
      { key: "usdcny", name: "US dollar in yuan", yahoo: "CNY=X", sub: "Currency", about: /\b(yuan|renminbi)\b/i },
      { key: "us10y", name: "US 10-year bond yield", yahoo: "^TNX", unit: "%", sub: "Interest rates", about: /\b(Treasury yields?|bond yields?|US yields?)\b/i },
      { key: "btc", name: "Bitcoin", yahoo: "BTC-USD", stooq: "btcusd", unit: "$", sub: "Crypto", about: /\b(bitcoin|crypto(currenc(y|ies))?)\b/i },
      { key: "eth", name: "Ethereum", yahoo: "ETH-USD", unit: "$", sub: "Crypto", about: /\b(ethereum|ether)\b/i },
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
  // About a month of daily closes: the trend line, the month's change, and yesterday's close.
  const j = JSON.parse(await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.yahoo)}?range=1mo&interval=1d`));
  const r = j.chart?.result?.[0];
  const m = r?.meta;
  const price = m?.regularMarketPrice;
  const times: number[] = r?.timestamp ?? [];
  const raw: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
  const pts = times.map((t, i) => ({ t, c: raw[i] })).filter((p): p is { t: number; c: number } => typeof p.c === "number");
  if (typeof price !== "number" || pts.length < 2) throw new Error("no price");
  // The last bar is today's session when it shares the market's latest trading day.
  const day = (t: number) => new Date((t + (m.gmtoffset ?? 0)) * 1000).toISOString().slice(0, 10);
  const today = day(m.regularMarketTime ?? pts[pts.length - 1].t);
  const prev = day(pts[pts.length - 1].t) === today ? pts[pts.length - 2].c : pts[pts.length - 1].c;
  const spark = pts.map((p) => p.c);
  if (day(pts[pts.length - 1].t) === today) spark[spark.length - 1] = price; else spark.push(price);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return {
    key: a.key, name: a.name, sub: a.sub, price, change: price - prev, changePct: ((price - prev) / prev) * 100,
    currency: m.currency ?? "", asOf: new Date((m.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(), source: "Yahoo Finance", unit: a.unit,
    spark: spark.map((v) => Number(v.toPrecision(6))), monthPct: ((price - spark[0]) / spark[0]) * 100,
    dayHigh: num(m.regularMarketDayHigh), dayLow: num(m.regularMarketDayLow), yearHigh: num(m.fiftyTwoWeekHigh), yearLow: num(m.fiftyTwoWeekLow),
  };
}

async function fromStooq(a: Asset): Promise<Quote> {
  if (!a.stooq) throw new Error("no fallback");
  // Last 10 daily closes; the change is today's (or the latest) close against the one before.
  const csv = await get(`https://stooq.com/q/d/l/?s=${encodeURIComponent(a.stooq)}&i=d&d1=${new Date(Date.now() - 15 * 86400_000).toISOString().slice(0, 10).replace(/-/g, "")}`);
  const rows = csv.trim().split("\n").slice(1).map((l) => l.split(",")).filter((r) => r.length >= 5 && !Number.isNaN(Number(r[4])));
  if (rows.length < 2) throw new Error("no rows");
  const [prev, last] = [Number(rows[rows.length - 2][4]), Number(rows[rows.length - 1][4])];
  return { key: a.key, name: a.name, sub: a.sub, price: last, change: last - prev, changePct: ((last - prev) / prev) * 100, currency: "", asOf: new Date(`${rows[rows.length - 1][0]}T00:00:00Z`).toISOString(), source: "Stooq", unit: a.unit, spark: rows.map((r) => Number(r[4])) };
}

interface NewsItem { id: string; title: string; url: string; sourceName: string; publishedAt: string | null; topics: string[] }

async function main() {
  const news: NewsItem[] = existsSync(newsPath) ? JSON.parse(readFileSync(newsPath, "utf8")).items : [];
  const recent = news.filter((n) => !n.publishedAt || Date.now() - Date.parse(n.publishedAt) < 36 * 3600_000);
  const business = recent.filter((n) => n.topics[0] === "Business" || /\b(markets?|stocks?|shares?|Sensex|Nifty|crude|gold|rupee)\b/i.test(n.title));
  const report: string[] = [];
  // A few requests at a time, so Yahoo isn't asked for ~70 prices at once.
  let slots = 4;
  const waiting: (() => void)[] = [];
  const limit = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (slots === 0) await new Promise<void>((r) => waiting.push(r)); else slots--;
    try { return await fn(); } finally { const next = waiting.shift(); if (next) next(); else slots++; }
  };
  const groups = await Promise.all(GROUPS.map(async (g) => ({
    key: g.key, title: g.title,
    items: (await Promise.all(g.assets.map((a) => limit(async () => {
      let q: Quote | null = null;
      try { q = await fromYahoo(a); } catch (e) {
        try { q = await fromStooq(a); report.push(`${a.name}: Yahoo ${(e as Error).message}, used Stooq`); } catch (e2) { report.push(`FAIL ${a.name}: Yahoo ${(e as Error).message}; Stooq ${(e2 as Error).message}`); }
      }
      if (!q) return null;
      // Why it moved: the day's headlines that name this market.
      const about = a.about ?? word(a.name);
      const why = business.concat(recent.filter((n) => !business.includes(n) && about.test(n.title)))
        .filter((n) => about.test(n.title)).slice(0, 4).map((n) => ({ id: n.id, title: n.title, source: n.sourceName }));
      return { ...q, why };
    })))).filter((q): q is NonNullable<typeof q> => !!q),
  })));

  // Gold and silver in rupees: the world price converted at today's dollar rate. Shops add
  // import duty and GST, so local prices are higher; labelled as an estimate.
  const all = groups.flatMap((g) => g.items);
  const find = (k: string) => all.find((q) => q.key === k);
  const usd = find("usdinr"), gold = find("gold"), silver = find("silver");
  const OZ = 31.1035; // grams in a troy ounce
  const inRupees = (q: typeof gold, key: string, name: string, grams: number, unit: string) => {
    if (!q || !usd) return null;
    const price = (q.price / OZ) * grams * usd.price;
    const before = ((q.price - q.change) / OZ) * grams * (usd.price - usd.change);
    const n = Math.min(q.spark?.length ?? 0, usd.spark?.length ?? 0);
    const spark = n > 1 ? q.spark!.slice(-n).map((p, i) => Number(((p / OZ) * grams * usd.spark!.slice(-n)[i]).toPrecision(6))) : undefined;
    return { ...q, key, name, sub: "In India, before duty & GST (estimate)", unit, price, change: price - before, changePct: ((price - before) / before) * 100, spark, monthPct: spark ? ((price - spark[0]) / spark[0]) * 100 : undefined, dayHigh: undefined, dayLow: undefined, yearHigh: undefined, yearLow: undefined };
  };
  const com = groups.find((g) => g.key === "commodities");
  if (com) com.items.unshift(...[inRupees(gold, "goldinr", "Gold in rupees", 10, "₹ per 10 g"), inRupees(silver, "silverinr", "Silver in rupees", 1000, "₹ per kg")].filter((q): q is NonNullable<typeof q> => !!q));

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

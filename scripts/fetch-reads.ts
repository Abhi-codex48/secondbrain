// Builds the "Explore" boxes on the Home screen: reading fields beyond the
// news, India (government, courts, Parliament, states, economy data) and the
// world (UN, health, global economy, diplomacy, a country to know). Runs every
// hour in GitHub Actions after the news and briefing:
//   node --experimental-strip-types scripts/fetch-reads.ts <out> <news.json> <knowledge.json> [previousUrl]
// Only titles, links, dates and the publishers' own short descriptions are kept.
// When a source fails, that box keeps its items from the previous run.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseFeed, canonicalUrl, type FeedItem } from "../shared/rss.ts";
import { googleNewsFeed } from "../shared/sources.ts";

const [out = "reads.json", newsPath = "news.json", knowledgePath = "knowledge.json", previousUrl] = process.argv.slice(2);
const UA = "Mozilla/5.0 (compatible; SecondBrainReads/1.0; https://github.com/Abhi-codex48/secondbrain)";
const PER_BOX = 8;

export interface ReadItem { title: string; url: string; source: string; text: string; date: string | null }
export interface Box { key: string; title: string; note: string; items: ReadItem[] }
export interface Group { key: string; title: string; boxes: Box[] }

async function get(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/rss+xml,application/atom+xml,application/xml,application/json,*/*" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

const short = (s: string, max = 220) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(". ") + 1, cut.lastIndexOf(" ")))}…`;
};
const fromFeed = (it: FeedItem, source: string, google = false): ReadItem => ({
  title: google ? it.title.replace(/\s+-\s+[^-]+$/, "") : it.title,
  url: google ? it.url : canonicalUrl(it.url),
  source: google ? (it.sourceName || source) : source,
  text: google ? "" : short(it.description),
  date: it.publishedAt,
});

const report: string[] = [];
/** Items from the first feeds that answer; a Google News search for the site if none do. */
async function feeds(name: string, list: { url: string; source: string }[], opts: { filter?: RegExp; google?: string } = {}): Promise<ReadItem[]> {
  const items: ReadItem[] = [];
  const failed: string[] = [];
  for (const f of list) {
    try {
      const got = parseFeed(await get(f.url)).map((i) => fromFeed(i, f.source));
      if (!got.length) throw new Error("empty");
      items.push(...got);
    } catch (e) {
      failed.push(`${f.source}: ${(e as Error).message}`);
    }
  }
  let picked = items.filter((i) => !opts.filter || opts.filter.test(`${i.title} ${i.text}`));
  if (!picked.length && opts.google) {
    try {
      picked = parseFeed(await get(googleNewsFeed(opts.google))).map((i) => fromFeed(i, opts.google!, true));
      failed.push("used Google News");
    } catch (e) {
      failed.push(`Google News: ${(e as Error).message}`);
    }
  }
  const seen = new Set<string>();
  const res = picked
    .filter((i) => i.title && !seen.has(i.title) && seen.add(i.title))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, PER_BOX);
  report.push(`${res.length ? "OK  " : "FAIL"} ${name}: ${res.length}${failed.length ? ` (${failed.join("; ")})` : ""}`);
  return res;
}

async function wiki(path: string) {
  return JSON.parse(await get(`https://en.wikipedia.org/api/rest_v1/${path}`));
}
const ymd = (d: Date) => [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")];

/** Wikipedia's featured article of the last five days: one well-written story a day. */
async function featuredArticles(): Promise<ReadItem[]> {
  const out: ReadItem[] = [];
  for (let k = 0; k < 5; k++) {
    try {
      const [y, m, d] = ymd(new Date(Date.now() - k * 86400_000));
      const t = (await wiki(`feed/featured/${y}/${m}/${d}`)).tfa;
      if (t?.extract) out.push({ title: (t.normalizedtitle ?? t.title).replace(/_/g, " "), url: t.content_urls?.desktop?.page ?? "", source: "Wikipedia, featured article", text: short(t.extract, 260), date: `${y}-${m}-${d}` });
    } catch { /* skip that day */ }
  }
  report.push(`${out.length ? "OK  " : "FAIL"} History & stories: ${out.length}`);
  return out;
}

/** Wiktionary's word of the day for the last week. */
async function wordsOfTheDay(): Promise<ReadItem[]> {
  try {
    const xml = await get("https://en.wiktionary.org/w/api.php?action=featuredfeed&feed=wotd&feedformat=rss");
    const items = parseFeed(xml).reverse().slice(0, 7).map((i) => {
      // The description starts with the word and its part of speech, then the meanings.
      const word = i.description.split(/\s+/)[0] || i.title;
      return { title: word, url: i.url, source: "Wiktionary, word of the day", text: short(i.description.replace(/^\S+\s*/, ""), 200), date: i.publishedAt };
    });
    report.push(`OK   Words: ${items.length}`);
    return items;
  } catch (e) {
    report.push(`FAIL Words: ${(e as Error).message}`);
    return [];
  }
}

// Countries to get to know, one a day, chosen for how often they come up in the news.
const COUNTRIES = ["Japan", "Brazil", "Indonesia", "Nigeria", "Germany", "Saudi Arabia", "Bangladesh", "Australia", "Egypt", "Vietnam", "Iran", "Canada", "South Africa", "Mexico", "Turkey", "Sri Lanka", "France", "Kenya", "Argentina", "Nepal", "South Korea", "Ukraine", "Israel", "Pakistan", "China", "United Kingdom", "Russia", "United States", "Afghanistan", "Myanmar", "Bhutan", "Maldives", "Singapore", "United Arab Emirates", "Ethiopia", "Italy", "Philippines", "Qatar", "Chile", "Poland", "Norway", "Kazakhstan", "Mongolia", "Greece", "New Zealand", "Malaysia", "Thailand", "Oman", "Iraq", "Spain"];
async function countryOfTheDay(): Promise<ReadItem[]> {
  const n = Math.floor(Date.now() / 86400_000);
  const out: ReadItem[] = [];
  for (let k = 0; k < 3; k++) {
    const name = COUNTRIES[(n - k + COUNTRIES.length * 10) % COUNTRIES.length];
    try {
      const path = encodeURIComponent(name.replace(/ /g, "_"));
      let j: { extract?: string; content_urls?: { desktop?: { page?: string } } } | null = null;
      try { j = JSON.parse(await get(`https://simple.wikipedia.org/api/rest_v1/page/summary/${path}`)); } catch { j = await wiki(`page/summary/${path}`); }
      if (j?.extract) out.push({ title: k === 0 ? `${name} (today)` : name, url: j.content_urls?.desktop?.page ?? "", source: "Wikipedia", text: short(j.extract, 260), date: null });
    } catch { /* skip */ }
  }
  report.push(`${out.length ? "OK  " : "FAIL"} Country to know: ${out.length}`);
  return out;
}

interface NewsFile { items: { url: string; title: string; description: string; sourceName: string; publishedAt: string | null; topics: string[] }[] }
const newsItems = (): NewsFile["items"] => (existsSync(newsPath) ? (JSON.parse(readFileSync(newsPath, "utf8")) as NewsFile).items : []);
const fromNews = (filter: (i: NewsFile["items"][number]) => boolean, name: string): ReadItem[] => {
  const seen = new Set<string>();
  const res = newsItems().filter(filter).filter((i) => !seen.has(i.title) && seen.add(i.title)).slice(0, PER_BOX)
    .map((i) => ({ title: i.title, url: i.url, source: i.sourceName, text: short(i.description, 200), date: i.publishedAt }));
  report.push(`${res.length ? "OK  " : "FAIL"} ${name}: ${res.length} (from today's news)`);
  return res;
};

async function main() {
  let previous: { groups?: Group[] } = {};
  if (previousUrl) previous = await get(previousUrl).then((t) => JSON.parse(t)).catch(() => ({}));
  const keep = (key: string, items: ReadItem[]) => {
    if (items.length) return items;
    for (const g of previous.groups ?? []) for (const b of g.boxes) if (b.key === key) return b.items;
    return [];
  };
  const box = async (key: string, title: string, note: string, p: Promise<ReadItem[]> | ReadItem[]): Promise<Box> => ({ key, title, note, items: keep(key, await p) });

  const knowledge = existsSync(knowledgePath) ? JSON.parse(readFileSync(knowledgePath, "utf8")) : { events: [] };
  const diplomacy: ReadItem[] = (knowledge.events ?? [])
    .filter((e: { category: string }) => e.category === "International relations")
    .slice(0, PER_BOX)
    .map((e: { text: string; topic: string; sources: { name: string; url: string }[]; day: string }) => ({ title: e.topic || "International relations", url: e.sources[0]?.url ?? "", source: e.sources.map((s) => s.name).join(", ") || "Wikipedia, Current events", text: e.text, date: e.day }));
  report.push(`${diplomacy.length ? "OK  " : "FAIL"} Diplomacy: ${diplomacy.length}`);

  const groups: Group[] = [
    {
      key: "reading", title: "Reading", boxes: await Promise.all([
        box("longreads", "Long reads", "Essays and in-depth stories", feeds("Long reads", [
          { url: "https://www.theguardian.com/news/series/the-long-read/rss", source: "The Guardian, The Long Read" },
          { url: "https://theconversation.com/global/articles.atom", source: "The Conversation" },
        ])),
        box("books", "Books", "New books and reviews", feeds("Books", [
          { url: "https://www.thehindu.com/books/feeder/default.rss", source: "The Hindu, Books" },
          { url: "https://www.theguardian.com/books/rss", source: "The Guardian, Books" },
        ])),
        box("science", "Science", "Discoveries explained", feeds("Science", [
          { url: "https://www.sciencedaily.com/rss/top/science.xml", source: "ScienceDaily" },
          { url: "https://www.thehindu.com/sci-tech/science/feeder/default.rss", source: "The Hindu, Science" },
        ])),
        box("economy", "Economy explained", "Money, rates and markets", feeds("Economy explained", [
          { url: "https://www.thehindu.com/business/Economy/feeder/default.rss", source: "The Hindu, Economy" },
          { url: "https://www.livemint.com/rss/economy", source: "Mint, Economy" },
        ])),
        box("history", "History & stories", "Wikipedia's article of the day", featuredArticles()),
        box("ideas", "Ideas", "Philosophy, psychology and culture", feeds("Ideas", [
          { url: "https://aeon.co/feed.rss", source: "Aeon" },
        ], { google: "aeon.co" })),
        box("environment", "Environment", "Climate, wildlife and nature", feeds("Environment", [
          { url: "https://india.mongabay.com/feed/", source: "Mongabay India" },
          { url: "https://www.thehindu.com/sci-tech/energy-and-environment/feeder/default.rss", source: "The Hindu, Environment" },
        ])),
        box("words", "Word of the day", "Meanings and origins", wordsOfTheDay()),
      ]),
    },
    {
      key: "india", title: "India", boxes: await Promise.all([
        // PIB refuses a second request in the same run, so use the PIB releases already collected for News.
        box("govt", "Government decisions", "Cabinet, schemes and ministries (PIB)", fromNews((i) => i.sourceName.startsWith("PIB"), "Government decisions")),
        box("courts", "Courts", "Supreme Court and High Courts", feeds("Courts", [
          { url: "https://www.livelaw.in/category/top-stories/google_feeds.xml", source: "LiveLaw" },
          { url: "https://www.barandbench.com/feed", source: "Bar & Bench" },
        ], { google: "livelaw.in" })),
        box("parliament", "Parliament & laws", "Bills, debates and new laws", fromNews((i) => /\b(Parliament|Lok Sabha|Rajya Sabha|Bill|Act|ordinance|Speaker)\b/.test(i.title), "Parliament & laws")),
        box("states", "States & cities", "Across India", fromNews((i) => i.topics[0] === "Cities", "States & cities")),
        box("rbi", "RBI & economy data", "Reserve Bank announcements", feeds("RBI", [
          { url: "https://www.rbi.org.in/pressreleases_rss.xml", source: "Reserve Bank of India" },
        ], { google: "rbi.org.in" })),
      ]),
    },
    {
      key: "world", title: "World", boxes: await Promise.all([
        box("un", "United Nations", "Peace, rights and development", feeds("UN", [
          { url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml", source: "UN News" },
        ])),
        box("health", "Global health", "World Health Organization", feeds("WHO", [
          { url: "https://www.who.int/rss-feeds/news-english.xml", source: "WHO" },
        ], { google: "who.int" })),
        box("globaleconomy", "Global economy", "IMF and World Bank", feeds("Global economy", [
          { url: "https://www.imf.org/en/News/rss?language=eng", source: "IMF" },
        ], { google: "imf.org" })),
        box("diplomacy", "Diplomacy & summits", "Talks, treaties and visits", diplomacy),
        box("country", "Country to know", "A new country every day", countryOfTheDay()),
      ]),
    },
  ];

  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), groups }));
  console.log(`reads.json: ${groups.map((g) => `${g.title} ${g.boxes.filter((b) => b.items.length).length}/${g.boxes.length}`).join(", ")}`);
  for (const r of report) console.log(r);
}

main().catch((e) => {
  // Never block the deploy over these boxes.
  console.error(e);
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), groups: [] }));
});

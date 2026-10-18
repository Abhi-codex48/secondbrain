// Fetches today's headlines from the newspapers' public RSS feeds, keeps the
// UPSC-relevant ones and writes news.json for the website. Runs every hour in
// GitHub Actions: node --experimental-strip-types scripts/fetch-news.ts <out> [previousUrl]
// Only headlines, links, dates and the feeds' own short descriptions are
// published; article text is never copied.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DEFAULT_SOURCES, googleNewsFeed } from "../shared/sources.ts";
import { canonicalUrl, parseFeed, type FeedItem } from "../shared/rss.ts";
import { classify } from "../shared/classify.ts";

const [out = "news.json", previousUrl] = process.argv.slice(2);
const MAX_AGE_MS = 48 * 3600_000; // ignore feed items older than two days
const KEEP_MS = 4 * 86400_000; // keep four days in the file
const PER_SOURCE = 40;
const UA = "Mozilla/5.0 (compatible; SecondBrainNews/1.0; personal study reader)";

export interface NewsItem {
  id: string;
  url: string;
  title: string;
  description: string;
  source: string;
  sourceName: string;
  publishedAt: string | null;
  fetchedAt: string;
  topics: string[];
  level: "headline" | "excerpt";
}

async function get(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const idOf = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 16);
const alwaysKeep = (feed: string, key: string) => key === "pib" || /editorial|opinion|explained|\/lead\//i.test(feed);

async function main() {
  const now = Date.now();
  const fetchedAt = new Date(now).toISOString();
  let previous: NewsItem[] = [];
  if (previousUrl) {
    try {
      previous = JSON.parse(await get(previousUrl)).items ?? [];
    } catch {
      console.log("No previous news.json found; starting fresh.");
    }
  }

  const report: { key: string; name: string; ok: boolean; count: number; fallback: boolean; error?: string }[] = [];
  const fresh: NewsItem[] = [];

  await Promise.all(DEFAULT_SOURCES.map(async (src) => {
    const rows: NewsItem[] = [];
    const errors: string[] = [];
    const collect = (items: FeedItem[], feed: string, viaGoogle: boolean) => {
      for (const it of items) {
        if (it.publishedAt && now - Date.parse(it.publishedAt) > MAX_AGE_MS) continue;
        const title = viaGoogle ? it.title.replace(/\s+-\s+[^-]+$/, "") : it.title;
        const c = classify(title, it.description, { alwaysKeep: alwaysKeep(feed, src.key) });
        if (!c.keep) continue;
        const url = viaGoogle ? it.url : canonicalUrl(it.url);
        const description = viaGoogle ? "" : it.description.slice(0, 400);
        rows.push({
          id: idOf(url), url, title, description, source: src.key, sourceName: src.name,
          publishedAt: it.publishedAt, fetchedAt, topics: c.topics.length ? c.topics : ["Editorial"],
          level: description.length > 200 ? "excerpt" : "headline",
        });
      }
    };
    const results = await Promise.allSettled(src.feeds.map(get));
    let ownOk = false;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        const items = parseFeed(r.value);
        if (items.length) ownOk = true;
        collect(items, src.feeds[i], false);
      } else errors.push(`${src.feeds[i]}: ${(r.reason as Error).message}`);
    });
    let fallback = false;
    if (!ownOk) {
      fallback = true;
      try {
        const g = googleNewsFeed(src.site);
        collect(parseFeed(await get(g)), g, true);
      } catch (e) {
        errors.push(`Google News fallback: ${(e as Error).message}`);
      }
    }
    const unique = [...new Map(rows.map((r) => [r.id, r])).values()]
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, PER_SOURCE);
    fresh.push(...unique);
    report.push({ key: src.key, name: src.name, ok: unique.length > 0, count: unique.length, fallback, error: errors.join(" · ").slice(0, 300) || undefined });
  }));

  // Keep the first time we saw each article, so "Today" stays stable across runs.
  const seen = new Map(previous.filter((p) => now - Date.parse(p.fetchedAt) < KEEP_MS).map((p) => [p.id, p]));
  for (const f of fresh) if (!seen.has(f.id)) seen.set(f.id, f);
  const items = [...seen.values()].sort((a, b) => (b.publishedAt ?? b.fetchedAt).localeCompare(a.publishedAt ?? a.fetchedAt)).slice(0, 1200);

  // Never publish an empty list: failing here stops the deploy, so the live site keeps its last news.
  if (items.length === 0) throw new Error("No headlines from any source and no previous list; keeping the live site as it is.");
  writeFileSync(out, JSON.stringify({ generatedAt: fetchedAt, sources: report.sort((a, b) => a.name.localeCompare(b.name)), items }));
  console.log(`news.json: ${items.length} items (${fresh.length} fetched now)`);
  for (const r of report) console.log(`${r.ok ? "OK  " : "FAIL"} ${r.name}: ${r.count}${r.fallback ? " (Google News)" : ""}${r.error ? ` — ${r.error}` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

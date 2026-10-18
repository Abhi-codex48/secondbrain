// Fetches today's headlines from every section feed of the newspapers, files
// each under the paper's own section, and writes news.json for the website. Runs every hour in
// GitHub Actions: node --experimental-strip-types scripts/fetch-news.ts <out> [previousUrl]
// Only headlines, links, dates and the feeds' own short descriptions are
// published; article text is never copied.
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DEFAULT_SOURCES, googleNewsFeed } from "../shared/sources.ts";
import { canonicalUrl, parseFeed, type FeedItem } from "../shared/rss.ts";
import { SECTIONS, TOP_STORIES, sectionFromUrl } from "../shared/sections.ts";

const [out = "news.json", previousUrl] = process.argv.slice(2);
const MAX_AGE_MS = 48 * 3600_000; // ignore feed items older than two days
const KEEP_MS = 2 * 86400_000; // two days in the main file; older days are in the archive
const PER_SECTION = 25; // per paper and section, so no section crowds out the rest
const PER_FALLBACK = 60; // papers read through Google News, and single-feed sources like PIB
const PER_SOURCE = 160;
// Advertising dressed as news (shopping deals, coupons) is left out; everything else is kept.
const ADS = /\b(deals?|discounts?|coupons?|offers? on|price drop|lowest price|buy now|sale on)\b/i;
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
    const cap = src.feeds.length <= 1 ? PER_FALLBACK : PER_SECTION;
    const collect = (items: FeedItem[], section: string | null, viaGoogle: boolean) => {
      const perSection = new Map<string, number>();
      const limit = viaGoogle ? PER_FALLBACK : cap;
      for (const it of items) {
        if (it.publishedAt && now - Date.parse(it.publishedAt) > MAX_AGE_MS) continue;
        const title = viaGoogle ? it.title.replace(/\s+-\s+[^-]+$/, "") : it.title;
        if (!title || ADS.test(title)) continue;
        const url = viaGoogle ? it.url : canonicalUrl(it.url);
        // The paper's own section: from the article's address, else from the feed.
        const sec = (viaGoogle ? null : sectionFromUrl(url)) ?? section ?? TOP_STORIES;
        const n = perSection.get(sec) ?? 0;
        if (n >= limit) continue;
        perSection.set(sec, n + 1);
        const description = viaGoogle ? "" : it.description.slice(0, 240);
        rows.push({
          id: idOf(url), url, title, description, source: src.key, sourceName: src.name,
          publishedAt: it.publishedAt, fetchedAt, topics: [sec],
          level: description.length > 200 ? "excerpt" : "headline",
        });
      }
    };
    const results = await Promise.allSettled(src.feeds.map((fd) => get(fd.url)));
    let ownOk = false;
    const failed: string[] = [];
    results.forEach((r, i) => {
      const fd = src.feeds[i];
      if (r.status === "fulfilled") {
        const items = parseFeed(r.value);
        if (items.length) ownOk = true;
        else failed.push(`${fd.section}: empty`);
        collect(items, fd.section, false);
      } else failed.push(`${fd.section}: ${(r.reason as Error).message}`);
    });
    if (failed.length) errors.push(`Feeds not working: ${failed.join(", ")}`);
    let fallback = false;
    if (!ownOk) {
      fallback = true;
      try {
        const g = googleNewsFeed(src.site);
        collect(parseFeed(await get(g)), null, true);
      } catch (e) {
        errors.push(`Google News fallback: ${(e as Error).message}`);
      }
    }
    const unique = [...new Map(rows.map((r) => [r.id, r])).values()]
      .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
      .slice(0, PER_SOURCE);
    fresh.push(...unique);
    report.push({ key: src.key, name: src.name, ok: unique.length > 0, count: unique.length, fallback, error: errors.join(" · ").slice(0, 400) || undefined });
  }));

  // Keep the first time we saw each article, so "Today" stays stable across runs.
  // Older files used guessed topics; file those items under the paper's section too.
  const known = new Set<string>([...SECTIONS, TOP_STORIES]);
  const prev = previous
    .filter((p) => now - Date.parse(p.fetchedAt) < KEEP_MS)
    .map((p) => ({ ...p, topics: [sectionFromUrl(p.url) ?? (known.has(p.topics?.[0]) ? p.topics[0] : TOP_STORIES)] }));
  const seen = new Map(prev.map((p) => [p.id, p]));
  for (const f of fresh) if (!seen.has(f.id)) seen.set(f.id, f);
  // Keep the file small so it opens fast on phones: descriptions only for the last day.
  const items = [...seen.values()]
    .sort((a, b) => (b.publishedAt ?? b.fetchedAt).localeCompare(a.publishedAt ?? a.fetchedAt))
    .slice(0, 2500)
    .map((i) => (now - Date.parse(i.fetchedAt) > 86400_000 && i.description ? { ...i, description: "", level: "headline" as const } : i));

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

// Adds the latest headlines to the day-by-day news archive, so the website can
// show the news of any earlier date. Runs after fetch-news in GitHub Actions:
// node --experimental-strip-types scripts/archive-news.ts <news.json> <archiveDir>
// The archive lives on the repository's "news-archive" branch and is copied
// into the site at archive/. Only headlines, links and dates are stored.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [newsFile = "news.json", dir = "archive"] = process.argv.slice(2);
const KEEP_DAYS = 90; // about three months, so each deploy stays small and fast

interface Item { id: string; fetchedAt: string; publishedAt: string | null; [k: string]: unknown }

// Day in India (IST), matching the "Today" view on the website.
const istDay = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

const news = JSON.parse(readFileSync(newsFile, "utf8")) as { items: Item[] };
const days = join(dir, "days");
mkdirSync(days, { recursive: true });

const byDay = new Map<string, Item[]>();
for (const it of news.items) {
  const d = istDay(it.fetchedAt);
  byDay.set(d, [...(byDay.get(d) ?? []), it]);
}

for (const [day, items] of byDay) {
  const file = join(days, `${day}.json`);
  const old: Item[] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).items ?? [] : [];
  const merged = new Map(old.map((i) => [i.id, i]));
  // Headline, link, paper, section and dates only (no descriptions) to keep files small.
  for (const i of items) if (!merged.has(i.id)) merged.set(i.id, { id: i.id, url: i.url, title: i.title, description: "", source: i.source, sourceName: i.sourceName, publishedAt: i.publishedAt, fetchedAt: i.fetchedAt, topics: i.topics, level: "headline" });
  const list = [...merged.values()].sort((a, b) => (b.publishedAt ?? b.fetchedAt).localeCompare(a.publishedAt ?? a.fetchedAt));
  writeFileSync(file, JSON.stringify({ day, items: list }));
}

// Drop days older than the limit and write the list of available days.
const all = readdirSync(days).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
for (const f of all.slice(KEEP_DAYS)) rmSync(join(days, f));
const index = all.slice(0, KEEP_DAYS).map((f) => {
  const day = f.slice(0, 10);
  const n = (JSON.parse(readFileSync(join(days, f), "utf8")).items ?? []).length;
  return { day, count: n };
});
writeFileSync(join(days, "index.json"), JSON.stringify({ days: index }));
console.log(`archive: ${index.length} days, latest ${index[0]?.day} (${index[0]?.count} headlines)`);

// Builds the "World briefing" box on the Home screen from Wikipedia's
// editor-written current-affairs pages:
//  - In the news: the day's biggest world stories, with plain background on each
//  - Current events: what happened yesterday and today, by category (wars and
//    conflicts, business and economy, politics, science, disasters...), each
//    event linked to the news outlet it cites (Reuters, AP, BBC and others)
//  - Trending: the articles most read worldwide yesterday
//  - On this day
// Runs in GitHub Actions: node --experimental-strip-types scripts/fetch-knowledge.ts <out> [previousUrl]
import { writeFileSync } from "node:fs";

const [out = "knowledge.json", previousUrl] = process.argv.slice(2);
const UA = "SecondBrainBriefing/1.0 (https://github.com/Abhi-codex48/secondbrain; daily news briefing)";

export interface Story { text: string; title: string; background: string; url: string; image: string | null }
export interface Event { category: string; topic: string; text: string; sources: { name: string; url: string }[]; day: string }
export interface Trend { title: string; text: string; url: string; image: string | null; views: number }
export interface Briefing { day: string; top: Story[]; events: Event[]; trending: Trend[]; onthisday: { year: number; text: string; url: string | null }[] }

async function get(url: string, as: "json" | "text" = "json") {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return as === "json" ? await r.json() : await r.text();
  } finally {
    clearTimeout(t);
  }
}

const stripTags = (h: string) => h.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();

/** The first sentences of a text, up to about `max` characters. */
export function short(text: string, max = 300): string {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let s = "";
  for (const p of parts) {
    if ((s + p).length > max && s) break;
    s += p;
  }
  return s.trim();
}

/** Plain text and cited sources from one line of Wikipedia markup. */
export function wikiLine(line: string): { text: string; sources: { name: string; url: string }[] } {
  const sources: { name: string; url: string }[] = [];
  let t = line
    .replace(/<ref[\s\S]*?(\/>|<\/ref>)/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\(\s*\[(https?:\/\/\S+)\s+([^\]]+)\]\s*\)/g, (_m, url, name) => { sources.push({ url, name: name.replace(/'''?/g, "").trim() }); return ""; })
    .replace(/\[(https?:\/\/\S+)\s+([^\]]+)\]/g, (_m, url, name) => { sources.push({ url, name: name.replace(/'''?/g, "").trim() }); return ""; })
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/^[*#:;]+\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
  t = t.replace(/\(\s*\)$/, "").trim();
  return { text: t, sources };
}

/** Events from one day's "Portal:Current events" page (raw wikitext). */
export function parseCurrentEvents(wikitext: string, day: string): Event[] {
  const events: Event[] = [];
  let category = "";
  const topics: string[] = [];
  for (const raw of wikitext.split("\n")) {
    const line = raw.trim();
    const head = line.match(/^(?:'''(.+?)'''|;\s*(.+)|==+\s*(.+?)\s*==+)$/);
    if (head) {
      category = (head[1] ?? head[2] ?? head[3]).replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, "$1").trim();
      topics.length = 0;
      continue;
    }
    const bullet = line.match(/^(\*+)\s*(.*)$/);
    if (!bullet || !category) continue;
    const depth = bullet[1].length;
    const { text, sources } = wikiLine(bullet[2]);
    if (!text) continue;
    // A line that is only a link names a topic ("Russian invasion of Ukraine"); a sentence is an event.
    const isEvent = sources.length > 0 || (/[.!?]$/.test(text) && text.split(" ").length > 6);
    if (!isEvent) {
      topics[depth - 1] = text;
      topics.length = depth;
      continue;
    }
    events.push({ category, topic: topics.filter(Boolean).slice(0, 2).join(" · "), text, sources: sources.slice(0, 3), day });
  }
  return events;
}

async function simpleSummary(title: string): Promise<{ text: string; url: string } | null> {
  try {
    const j = await get(`https://simple.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    if (j.type === "disambiguation" || !j.extract) return null;
    return { text: short(j.extract, 280), url: j.content_urls?.desktop?.page };
  } catch {
    return null;
  }
}

const NOT_ARTICLES = /^(Main Page|Special:|Wikipedia:|Portal:|File:|Help:|Talk:|Template:|Category:|Deaths in )/;

async function main() {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.toISOString().slice(0, 10);
  const ymd = (d: Date) => [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")];
  const [y, m, d] = ymd(now);
  const yest = new Date(now.getTime() - 86400_000);
  const portal = (dt: Date) => `Portal:Current_events/${dt.getUTCFullYear()}_${dt.toLocaleString("en-US", { month: "long", timeZone: "UTC" })}_${dt.getUTCDate()}`;

  const brief: Briefing = { day, top: [], events: [], trending: [], onthisday: [] };

  // In the news, Trending and On this day all come in Wikipedia's daily feed.
  try {
    const f = await get(`https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`);
    for (const n of (f.news ?? []).slice(0, 6)) {
      const text = stripTags(n.story ?? "");
      const main = (n.links ?? []).find((l: { extract?: string }) => l.extract) ?? n.links?.[0];
      if (!text || !main) continue;
      const easy = await simpleSummary(main.title ?? "");
      brief.top.push({
        text,
        title: (main.normalizedtitle ?? main.title ?? "").replace(/_/g, " "),
        background: easy?.text ?? short(main.extract ?? "", 280),
        url: easy?.url ?? main.content_urls?.desktop?.page ?? "",
        image: main.thumbnail?.source ?? null,
      });
    }
    // The most-read list is published a day late, so fall back to yesterday's feed.
    let mostread = f.mostread?.articles;
    if (!mostread?.length) {
      const [yy, ym, yd] = ymd(yest);
      mostread = (await get(`https://en.wikipedia.org/api/rest_v1/feed/featured/${yy}/${ym}/${yd}`).catch(() => null))?.mostread?.articles ?? [];
    }
    brief.trending = (mostread ?? [])
      .filter((a: { title: string; extract?: string; description?: string }) => a.extract && !NOT_ARTICLES.test(a.title.replace(/_/g, " ")) && !/^(Topics referred to|Wikimedia)/.test(a.description ?? ""))
      .slice(0, 8)
      .map((a: { normalizedtitle?: string; title: string; extract: string; content_urls?: { desktop?: { page?: string } }; thumbnail?: { source?: string }; views: number }) => ({
        title: (a.normalizedtitle ?? a.title).replace(/_/g, " "), text: short(a.extract, 220), url: a.content_urls?.desktop?.page ?? "", image: a.thumbnail?.source ?? null, views: a.views,
      }));
    brief.onthisday = (f.onthisday ?? []).slice(0, 5).map((e: { year: number; text: string; pages?: { content_urls?: { desktop?: { page?: string } } }[] }) => ({ year: e.year, text: short(e.text, 220), url: e.pages?.[0]?.content_urls?.desktop?.page ?? null }));
  } catch (e) {
    console.log(`Daily feed: ${(e as Error).message}`);
  }

  // Current events: today's page (it fills up during the day) and yesterday's.
  for (const dt of [now, yest]) {
    try {
      const text = await get(`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(portal(dt))}&action=raw`, "text");
      brief.events.push(...parseCurrentEvents(text, ymd(dt).join("-")));
    } catch (e) {
      console.log(`${portal(dt)}: ${(e as Error).message}`);
    }
  }

  const total = brief.top.length + brief.events.length + brief.trending.length;
  if (!total && previousUrl) {
    try {
      writeFileSync(out, JSON.stringify(await get(previousUrl)));
      console.log("knowledge.json: Wikipedia unreachable, kept the previous briefing");
      return;
    } catch { /* nothing to keep */ }
  }
  writeFileSync(out, JSON.stringify(brief));
  const cats = [...new Set(brief.events.map((e) => e.category))].join(", ");
  console.log(`knowledge.json: ${brief.top.length} top stories, ${brief.events.length} events (${cats}), ${brief.trending.length} trending, ${brief.onthisday.length} on this day`);
}

if (process.argv[1]?.endsWith("fetch-knowledge.ts")) {
  main().catch((e) => {
    // Never block the deploy over this box.
    console.error(e);
    writeFileSync(out, JSON.stringify({ day: "", top: [], events: [], trending: [], onthisday: [] }));
  });
}

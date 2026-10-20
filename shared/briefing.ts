// The World briefing, built from Wikipedia's editor-written current-affairs pages:
//  - In the news: the day's biggest world stories, with plain background on each
//  - Current events: what happened yesterday and today, by category (wars and
//    conflicts, business and economy, politics, science, disasters...), each
//    event linked to the news outlet it cites (Reuters, AP, BBC and others)
//  - Trending: the articles most read worldwide yesterday
//  - On this day

/** Fetches a URL and returns parsed JSON. */
export type Get = (url: string) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Story { text: string; title: string; background: string; url: string; image: string | null }
export interface Event { category: string; topic: string; text: string; sources: { name: string; url: string }[]; day: string }
export interface Trend { title: string; text: string; url: string; image: string | null; views: number }
export interface Briefing { day: string; generatedAt?: string; top: Story[]; events: Event[]; trending: Trend[]; onthisday: { year: number; text: string; url: string | null }[] }

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

async function simpleSummary(get: Get, title: string): Promise<{ text: string; url: string } | null> {
  try {
    const j = await get(`https://simple.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
    if (j.type === "disambiguation" || !j.extract) return null;
    return { text: short(j.extract, 280), url: j.content_urls?.desktop?.page };
  } catch {
    return null;
  }
}

const NOT_ARTICLES = /^(Main Page|Special:|Wikipedia:|Portal:|File:|Help:|Talk:|Template:|Category:|Deaths in )/;

/**
 * Builds the briefing from Wikipedia. Runs in the hourly job and, when that is
 * late, straight in the browser (Wikipedia allows that).
 */
export async function buildBriefing(get: Get, log: (s: string) => void = () => {}): Promise<Briefing> {
  const now = new Date();
  const ist = new Date(now.getTime() + 330 * 60_000);
  const day = ist.toISOString().slice(0, 10);
  const ymd = (d: Date) => [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0")];
  const [y, m, d] = ymd(now);
  const yest = new Date(now.getTime() - 86400_000);
  const portal = (dt: Date) => `Portal:Current_events/${dt.getUTCFullYear()}_${dt.toLocaleString("en-US", { month: "long", timeZone: "UTC" })}_${dt.getUTCDate()}`;

  const brief: Briefing = { day, generatedAt: now.toISOString(), top: [], events: [], trending: [], onthisday: [] };

  // In the news, Trending and On this day all come in Wikipedia's daily feed.
  try {
    const f = await get(`https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`);
    for (const n of (f.news ?? []).slice(0, 6)) {
      const text = stripTags(n.story ?? "");
      const main = (n.links ?? []).find((l: { extract?: string }) => l.extract) ?? n.links?.[0];
      if (!text || !main) continue;
      const easy = await simpleSummary(get, main.title ?? "");
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
    log(`Daily feed: ${(e as Error).message}`);
  }

  // Current events: today's page (it fills up during the day) and yesterday's.
  for (const dt of [now, yest]) {
    try {
      // The Action API (with origin=*) can be read from a browser as well as from the job.
      const j = await get(`https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&origin=*&titles=${encodeURIComponent(portal(dt))}`);
      const text: string = j?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? "";
      if (!text) throw new Error("no page yet");
      brief.events.push(...parseCurrentEvents(text, ymd(dt).join("-")));
    } catch (e) {
      log(`${portal(dt)}: ${(e as Error).message}`);
    }
  }
  return brief;
}

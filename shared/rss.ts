import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  title: string;
  url: string;
  description: string;
  publishedAt: string | null; // ISO, or null when the feed gives no date
  sourceName?: string; // e.g. publisher named by Google News
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: true });

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"]);
  return "";
}

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(d: string): string | null {
  if (!d) return null;
  const t = Date.parse(d.trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Parses RSS 2.0 or Atom. Unknown dates stay null; they are never replaced by the fetch time. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml);
  const out: FeedItem[] = [];
  if (doc?.rss?.channel) {
    for (const it of arr(doc.rss.channel.item)) {
      const url = text(it.link).trim() || text(it.guid).trim();
      const title = stripHtml(text(it.title));
      if (!url || !title) continue;
      out.push({
        title,
        url,
        description: stripHtml(text(it.description)).slice(0, 600),
        publishedAt: toIso(text(it.pubDate) || text(it["dc:date"])),
        sourceName: text(it.source) || undefined,
      });
    }
  } else if (doc?.feed) {
    for (const e of arr(doc.feed.entry)) {
      const links = arr(e.link) as Array<Record<string, string>>;
      const link = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      const url = link?.["@_href"] ?? "";
      const title = stripHtml(text(e.title));
      if (!url || !title) continue;
      out.push({
        title,
        url,
        description: stripHtml(text(e.summary) || text(e.content)).slice(0, 600),
        publishedAt: toIso(text(e.published) || text(e.updated)),
      });
    }
  }
  return out;
}

/** Normalises a URL for duplicate detection (drops tracking params and fragments). */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|from$|ved$|usg$)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    let s = u.toString();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return raw.trim();
  }
}

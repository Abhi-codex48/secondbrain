import { XMLParser } from "fast-xml-parser";

export interface FeedItem {
  title: string;
  url: string;
  description: string;
  publishedAt: string | null; // ISO, or null when the feed gives no date
  sourceName?: string; // e.g. publisher named by Google News
}

// Entities are decoded by us (below): the parser's own decoding stops at 1000
// entities per feed, which long feeds such as The Conversation or WHO exceed.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: false });

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", rsquo2: "’" };
export function decodeEntities(s: string): string {
  // Twice, because some feeds escape their HTML ("&amp;amp;", "&lt;p&gt;").
  for (let k = 0; k < 2; k++) {
    s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d?);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
      }
      return NAMED[e.toLowerCase()] ?? m;
    });
  }
  return s;
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return decodeEntities(String(v)).replace(/^<!\[CDATA\[|\]\]>$/g, "");
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return decodeEntities(String((v as Record<string, unknown>)["#text"]));
  return "";
}

export function stripHtml(s: string): string {
  return decodeEntities(s)
    // Embedded styles and scripts (Wiktionary's feed has CSS inside) are not text.
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, " ")
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
      const url = decodeEntities(link?.["@_href"] ?? "");
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

/**
 * Loads an article's full text in the reader's browser through free
 * reader-mode services. Paywalled articles only return what the site shows to
 * everyone, and some newspapers block these services altogether.
 */
const READER = "https://r.jina.ai/";

const JUNK = /^(advertisement|also read|read more|subscribe|sign in|log in|share|follow us|download the app|click here|story continues below|trending|recommended|related)/i;

export function markdownToText(md: string): string {
  const start = md.indexOf("Markdown Content:");
  const body = start >= 0 ? md.slice(start + "Markdown Content:".length) : md;
  const out: string[] = [];
  for (let line of body.split("\n")) {
    line = line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
      .replace(/<[^>]+>/g, "")
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/, "")
      .replace(/(\*\*|__|\*|_|`)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line || /^[=\-|: ]+$/.test(line) || JUNK.test(line)) continue;
    // Menus, bylines and buttons are short; article paragraphs are sentences.
    const words = line.split(" ").length;
    if (words < 8 && !/[.?!:"”]$/.test(line)) continue;
    out.push(line);
  }
  return [...new Set(out)].join("\n\n");
}

/** Picks the article out of a whole web page (menus, ads and footers removed). */
async function readable(html: string, url: string): Promise<string> {
  const { Readability } = await import("@mozilla/readability");
  const d = new DOMParser().parseFromString(html, "text/html");
  const base = d.createElement("base");
  base.href = url;
  d.head.appendChild(base);
  const art = new Readability(d).parse();
  const body = new DOMParser().parseFromString(art?.content ?? "", "text/html");
  const text = [...body.querySelectorAll("p, li, h2, h3, blockquote")].map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()).filter((l) => l.split(" ").length >= 8 && !JUNK.test(l));
  return [...new Set(text)].join("\n\n");
}

async function get(u: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(u, { signal });
  if (res.status === 429) throw new Error("busy");
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

// Three free routes are tried at the same time and the first good answer wins,
// so one slow or blocked service doesn't hold the article up.
const ROUTES: ((url: string, s: AbortSignal) => Promise<string>)[] = [
  async (url, s) => markdownToText(await get(READER + url, s)),
  async (url, s) => readable(await get(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, s), url),
  async (url, s) => readable(await get(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`, s), url),
];

export async function fetchFullText(url: string): Promise<string> {
  if (/news\.google\.com\//.test(url)) throw new Error("This paper only shares its headlines through Google News, so the text can't be loaded here.");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const text = await Promise.any(ROUTES.map(async (r) => {
      const t = await r(url, ctl.signal);
      if (t.length < 400) throw new Error("short");
      return t;
    }));
    return text;
  } catch {
    if (!navigator.onLine) throw new Error("You're offline. Connect to the internet and try again.");
    throw new Error("The newspaper didn't let us load this article (it may be for subscribers only, or the site blocks readers).");
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
}

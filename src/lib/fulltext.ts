/**
 * Loads an article's full text in the reader's browser through Jina Reader
 * (r.jina.ai), a free reader-mode service: about 20 requests a minute per
 * device without a key. Paywalled articles only return what the site shows
 * to everyone.
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

export async function fetchFullText(url: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(READER + url, { signal: ctl.signal });
    if (res.status === 429) throw new Error("Too many articles loaded in the last minute. Wait a minute and try again.");
    if (!res.ok) throw new Error(`The reader service couldn't load this page (error ${res.status}).`);
    const text = markdownToText(await res.text());
    if (text.length < 400) throw new Error("Only a few lines could be loaded. The article may be for subscribers only.");
    return text;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("The article took too long to load.");
    if (e instanceof TypeError) throw new Error("Couldn't reach the reader service. Check your connection.");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

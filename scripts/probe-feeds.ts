// Checks which feed addresses answer from GitHub's servers. Run by hand:
// the "Check news feeds" workflow. Prints status and item count for each.
import { parseFeed } from "../shared/rss.ts";

const UA = "Mozilla/5.0 (compatible; SecondBrainNews/1.0; personal study reader)";
const bing = (site: string) => `https://www.bing.com/news/search?q=${encodeURIComponent(`site:${site}`)}&format=rss&mkt=en-IN`;
const CANDIDATES: Record<string, string[]> = {
  "Deccan Herald": ["https://www.deccanherald.com/stories.rss", "https://www.deccanherald.com/feed", "https://www.deccanherald.com/rss-feed", "https://www.deccanherald.com/news_sitemap.xml", bing("deccanherald.com")],
  "New Indian Express": ["https://www.newindianexpress.com/stories.rss", "https://www.newindianexpress.com/feed", "https://www.newindianexpress.com/news_sitemap.xml", bing("newindianexpress.com")],
  "Tribune": ["https://www.tribuneindia.com/rss/feed?catId=42", "https://www.tribuneindia.com/feed", "https://www.tribuneindia.com/stories.rss", "https://www.tribuneindia.com/news-sitemap.xml", bing("tribuneindia.com")],
  "Telegraph": ["https://www.telegraphindia.com/feeds/rss.jsp?id=3", "https://www.telegraphindia.com/rss", "https://www.telegraphindia.com/india/rss", "https://www.telegraphindia.com/feed", bing("telegraphindia.com")],
  "Statesman": ["https://www.thestatesman.com/feed", "https://www.thestatesman.com/india/feed", "https://www.thestatesman.com/sitemap-news.xml", bing("thestatesman.com")],
  "Financial Express": ["https://www.financialexpress.com/feed/", "https://www.financialexpress.com/india-news/feed/", "https://www.financialexpress.com/news-sitemap.xml", bing("financialexpress.com")],
  "Indian Express": ["https://indianexpress.com/feed/", "https://indianexpress.com/section/india/feed/", bing("indianexpress.com")],
  "Google News": ["https://news.google.com/rss/search?q=site%3Athehindu.com&hl=en-IN&gl=IN&ceid=IN:en"],
};

for (const [name, urls] of Object.entries(CANDIDATES)) {
  for (const url of urls) {
    let line: string;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" } });
      clearTimeout(t);
      const body = await res.text();
      let items = 0;
      try { items = parseFeed(body).length; } catch { /* not a feed */ }
      const urls = (body.match(/<loc>/g) ?? []).length;
      line = `${res.status} items=${items} locs=${urls} ${body.slice(0, 80).replace(/\s+/g, " ")}`;
    } catch (e) {
      line = `ERR ${(e as Error).message}`;
    }
    console.log(`${name.padEnd(18)} ${url}\n    ${line}`);
  }
}

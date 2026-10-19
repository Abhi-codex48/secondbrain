import { describe, expect, it } from "vitest";
import { classify } from "../shared/classify";
import { canonicalUrl, parseFeed } from "../shared/rss";
import { DEFAULT_SOURCES, googleNewsFeed, unwrapBing } from "../shared/sources";

describe("classify", () => {
  it("keeps UPSC topics and tags them", () => {
    const c = classify("Supreme Court strikes down provision of the Bill on governor powers");
    expect(c.keep).toBe(true);
    expect(c.topics).toContain("Polity");
  });
  it("drops sport and entertainment", () => {
    expect(classify("India win the T20 match against Australia").keep).toBe(false);
    expect(classify("Box office: new film crosses 100 crore").keep).toBe(false);
  });
  it("drops headlines with no UPSC topic unless the feed is editorial", () => {
    expect(classify("Ten things to do this weekend").keep).toBe(false);
    expect(classify("Ten things to do this weekend", "", { alwaysKeep: true }).keep).toBe(true);
  });
  it("matches short acronyms only as whole words", () => {
    expect(classify("RBI keeps repo rate unchanged").topics).toContain("Economy");
    expect(classify("Copper prices climb").topics).not.toContain("Environment");
  });
});

describe("feeds", () => {
  it("parses RSS and keeps unknown dates unknown", () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title><![CDATA[Parliament passes <b>Bill</b>]]></title><link>https://example.com/a?utm_source=x</link><description>Short &amp; clear</description><pubDate>Fri, 16 Oct 2026 06:00:00 +0530</pubDate></item>
      <item><title>No date item</title><link>https://example.com/b</link></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Parliament passes Bill");
    expect(items[0].description).toBe("Short & clear");
    expect(items[0].publishedAt).toBe("2026-10-16T00:30:00.000Z");
    expect(items[1].publishedAt).toBeNull();
  });
  it("parses Atom", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom entry</title><link rel="alternate" href="https://example.com/c"/><updated>2026-10-16T01:00:00Z</updated><summary>Sum</summary></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ title: "Atom entry", url: "https://example.com/c" });
  });
  it("canonicalises URLs for duplicate detection", () => {
    expect(canonicalUrl("https://www.Example.com/a/?utm_source=rss&id=2#top")).toBe("https://example.com/a/?id=2");
    expect(canonicalUrl("https://example.com/a/")).toBe("https://example.com/a");
  });
  it("has every paper plus PIB, each with a fallback site and unique key", () => {
    expect(DEFAULT_SOURCES.filter((s) => s.key !== "pib").length).toBeGreaterThanOrEqual(10);
    expect(new Set(DEFAULT_SOURCES.map((s) => s.key)).size).toBe(DEFAULT_SOURCES.length);
    for (const s of DEFAULT_SOURCES) expect(googleNewsFeed(s.site)).toContain(encodeURIComponent(`site:${s.site}`));
  });
});

import { sectionFromUrl } from "../shared/sections";
describe("sectionFromUrl", () => {
  it("reads the paper's own section from the address", () => {
    expect(sectionFromUrl("https://www.thehindu.com/sport/cricket/india-win/article1.ece")).toBe("Sports");
    expect(sectionFromUrl("https://indianexpress.com/article/explained/why-x-9000/")).toBe("Explained");
    expect(sectionFromUrl("https://www.hindustantimes.com/india-news/x-101.html")).toBe("India");
    expect(sectionFromUrl("https://timesofindia.indiatimes.com/city/delhi/x/articleshow/1.cms")).toBe("Cities");
    expect(sectionFromUrl("https://economictimes.indiatimes.com/news/economy/policy/x/articleshow/1.cms")).toBe("Business");
    expect(sectionFromUrl("https://www.thehindu.com/opinion/editorial/x/article1.ece")).toBe("Opinion");
    expect(sectionFromUrl("https://pib.gov.in/PressReleasePage.aspx?PRID=1")).toBeNull();
  });
});

describe("feeds with many entities", () => {
  it("parses past 1000 entities and decodes them", () => {
    const items = Array.from({ length: 300 }, (_, i) => `<item><title>Rock &amp; roll &#8220;${i}&#8221; &lt;b&gt;</title><link>https://x.org/a?b=1&amp;c=${i}</link><description>&lt;p&gt;Caf&#233; &amp; more&lt;/p&gt;</description></item>`).join("");
    const got = parseFeed(`<?xml version="1.0"?><rss><channel>${items}</channel></rss>`);
    expect(got).toHaveLength(300);
    expect(got[5].title).toBe("Rock & roll “5”");
    expect(got[5].url).toBe("https://x.org/a?b=1&c=5");
    expect(got[5].description).toBe("Café & more");
  });
});

describe("news sitemaps and Bing links", () => {
  it("reads headlines from a Google News sitemap", () => {
    const xml = `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
      <url><loc>https://www.newindianexpress.com/nation/2026/Oct/19/cabinet-clears-plan</loc>
        <news:news><news:publication><news:name>TNIE</news:name></news:publication><news:publication_date>2026-10-19T10:00:00+05:30</news:publication_date><news:title>Cabinet clears plan &amp; more</news:title></news:news></url>
      <url><loc>https://www.newindianexpress.com/no-title</loc></url></urlset>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Cabinet clears plan & more");
    expect(items[0].publishedAt).toBe("2026-10-19T04:30:00.000Z");
    expect(sectionFromUrl(items[0].url)).toBe("India");
  });
  it("unwraps Bing's click-tracking links", () => {
    expect(unwrapBing("http://www.bing.com/news/apiclick.aspx?ref=FexRss&url=https%3a%2f%2fwww.telegraphindia.com%2findia%2fstory%2f1&c=2")).toBe("https://www.telegraphindia.com/india/story/1");
    expect(unwrapBing("https://www.thehindu.com/x")).toBe("https://www.thehindu.com/x");
  });
});

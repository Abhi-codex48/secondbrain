import { describe, expect, it } from "vitest";
import { classify } from "../shared/classify";
import { canonicalUrl, parseFeed } from "../shared/rss";
import { DEFAULT_SOURCES, googleNewsFeed } from "../shared/sources";

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
  it("has ten newspapers plus PIB, each with a fallback site", () => {
    expect(DEFAULT_SOURCES.filter((s) => s.key !== "pib")).toHaveLength(10);
    for (const s of DEFAULT_SOURCES) expect(googleNewsFeed(s.site)).toContain(encodeURIComponent(`site:${s.site}`));
  });
});

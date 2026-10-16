import { describe, expect, it } from "vitest";
import { classify } from "../supabase/functions/_shared/classify";
import { checkUrlShape, isPrivateIPv4, isPrivateIPv6 } from "../supabase/functions/_shared/ssrf";
import { canonicalUrl, parseFeed } from "../supabase/functions/_shared/rss";
import { buildPrompt, parseSummary } from "../supabase/functions/_shared/ai";
import { DEFAULT_SOURCES, googleNewsFeed } from "../supabase/functions/_shared/sources";

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

describe("ssrf guards", () => {
  it("blocks private and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1"]) {
      expect(isPrivateIPv4(ip)).toBe(true);
    }
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv6("::1")).toBe(true);
    expect(isPrivateIPv6("fd00::1")).toBe(true);
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("2606:4700::1111")).toBe(false);
  });
  it("rejects bad URL shapes", () => {
    expect(checkUrlShape("file:///etc/passwd").ok).toBe(false);
    expect(checkUrlShape("http://localhost/x").ok).toBe(false);
    expect(checkUrlShape("http://169.254.169.254/latest").ok).toBe(false);
    expect(checkUrlShape("http://user:pw@example.com").ok).toBe(false);
    expect(checkUrlShape("http://example.com:8080").ok).toBe(false);
    expect(checkUrlShape("http://intranet/").ok).toBe(false);
    expect(checkUrlShape("https://www.thehindu.com/news/national/x.ece").ok).toBe(true);
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

describe("ai helpers", () => {
  it("marks supplied text as untrusted and truncates it", () => {
    const { system, user } = buildPrompt("x".repeat(20000), { length: "short", basedOn: "full" });
    expect(system).toMatch(/untrusted data/);
    expect(user.length).toBeLessThan(15500);
  });
  it("parses a fenced JSON reply", () => {
    const s = parseSummary('```json\n{"in_short":"A","what_happened":["b"],"key_facts":"c"}\n```', "full");
    expect(s.in_short).toBe("A");
    expect(s.key_facts).toEqual(["c"]);
    expect(s.mains_angle).toEqual([]);
  });
  it("rejects empty replies", () => {
    expect(() => parseSummary("{}", "full")).toThrow();
    expect(() => parseSummary("no json", "full")).toThrow();
  });
});

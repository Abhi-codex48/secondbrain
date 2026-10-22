import { describe, expect, it } from "vitest";
import { keyWords, sameStory, topStories, type Headline } from "../shared/topstories";

const now = Date.parse("2026-10-22T10:00:00Z");
let n = 0;
const h = (title: string, sourceName: string, hoursAgo = 1, section = "India"): Headline => ({
  id: `id${n++}`, title, source: sourceName.toLowerCase().replace(/\s+/g, "-"), sourceName,
  publishedAt: new Date(now - hoursAgo * 3600_000).toISOString(), fetchedAt: new Date(now).toISOString(), topics: [section],
});

describe("top stories", () => {
  it("matches headlines about the same event", () => {
    expect(sameStory(keyWords("RBI keeps repo rate unchanged at 5.5%"), keyWords("Repo rate unchanged: RBI holds at 5.5 per cent"))).toBe(true);
    expect(sameStory(keyWords("RBI keeps repo rate unchanged"), keyWords("Monsoon floods hit Kerala districts"))).toBe(false);
  });

  it("ranks stories by how many papers cover them", () => {
    const items = [
      h("RBI keeps repo rate unchanged at 5.5%", "The Hindu", 2, "Business"),
      h("RBI holds repo rate at 5.5%, retains neutral stance", "Mint", 3, "Business"),
      h("Repo rate unchanged as RBI waits on inflation", "Hindustan Times", 1, "Business"),
      h("RBI policy: repo rate unchanged at 5.5 per cent", "The Times of India", 4, "Business"),
      h("Cyclone Montha makes landfall near Kakinada", "The Hindu", 1),
      h("Cyclone Montha landfall: Kakinada coast lashed by rain", "Deccan Herald", 2),
      h("Cyclone Montha hits Andhra coast near Kakinada", "The Tribune", 2),
      h("Local football club wins cup", "Mint", 1, "Sports"),
      h("Same paper twice: RBI repo rate unchanged 5.5", "Mint", 1, "Business"),
    ];
    const top = topStories(items, now);
    expect(top).toHaveLength(2);
    expect(top[0].papers).toHaveLength(4);
    expect(top[0].section).toBe("Business");
    expect(top[0].items.map((i) => i.sourceName)).toEqual(expect.arrayContaining(["The Hindu", "Mint", "Hindustan Times", "The Times of India"]));
    expect(top[0].items).toHaveLength(4); // one headline per paper
    expect(top[1].title).toMatch(/Cyclone Montha/);
  });

  it("only looks at recent headlines and needs three papers", () => {
    const items = [h("Old story about budget session", "The Hindu", 30), h("Old story about budget session again", "Mint", 30), h("Budget session story old", "HT", 30)];
    expect(topStories(items, now)).toEqual([]);
  });
});

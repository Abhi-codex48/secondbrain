import { describe, expect, it } from "vitest";
import { keyPoints, splitSentences } from "../src/lib/keypoints";

// A made-up article used only to test the algorithm.
const article = `The Union Cabinet on Wednesday approved the National Urban Flood Management Mission to help cities cope with intense rainfall.
The Mission will be run by the Ministry of Housing and Urban Affairs with support from the National Disaster Management Authority.
Officials said the scheme will cover 120 cities in its first phase with an outlay of ₹12,000 crore over five years.
Urban flooding has become more frequent because drains in many cities were designed for lower rainfall intensity.
Construction on flood plains and encroachment of lakes have reduced the ground's natural capacity to absorb water.
Under Article 243W of the Constitution, municipalities are responsible for urban planning and drainage.
Experts said city drainage plans should be updated every ten years using new rainfall data.
"We cannot keep building on lakes and expect the water to disappear," said one urban planner.
The Mission also asks States to map flood-prone wards and publish early warnings.
Mr. Sharma of the NDMA said 40 per cent of the funds will go to restoring wetlands and natural drains.
The NDMA will review progress every year and report to the Cabinet.`;

describe("key points (no AI)", () => {
  it("splits sentences without breaking at abbreviations", () => {
    const s = splitSentences("Mr. Sharma of the NDMA said 40 per cent of funds will go to wetlands. The NDMA will review the progress of the mission every year.");
    expect(s).toHaveLength(2);
    expect(s[0]).toMatch(/^Mr\. Sharma/);
  });

  it("returns only sentences that exist in the text", () => {
    const k = keyPoints(article, { title: "Cabinet approves urban flood mission" })!;
    for (const s of [k.lead, ...k.points, ...k.facts]) expect(article.replace(/\s+/g, " ")).toContain(s);
    expect(k.points.length).toBe(3);
    const d = keyPoints(article, { title: "Cabinet approves urban flood mission", detailed: true })!;
    // Detailed gives clearly more than Short.
    expect(d.points.length + d.facts.length + (d.summary?.length ?? 0)).toBeGreaterThan(k.points.length + k.facts.length + 2);
    expect(new Set([k.lead, ...k.points, ...k.facts]).size).toBe(1 + k.points.length + k.facts.length);
  });

  it("finds facts with numbers, institutions and articles", () => {
    const k = keyPoints(article, { title: "Cabinet approves urban flood mission", detailed: true })!;
    expect(k.facts.join(" ")).toMatch(/₹12,000 crore|40 per cent/);
    expect(k.mentions.some((m) => /Ministry of Housing and Urban Affairs/.test(m))).toBe(true);
    expect(k.mentions).toContain("Article 243W");
    expect(k.terms).toContain("NDMA");
    expect(k.topics.length).toBeGreaterThan(0);
  });

  it("returns null for text that is too short", () => {
    expect(keyPoints("Just one sentence here that is long enough to count.")).toBeNull();
  });
});

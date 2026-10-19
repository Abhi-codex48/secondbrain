import { describe, expect, it } from "vitest";
import { buildQuiz } from "../src/lib/quiz";

const s = [
  "The European Central Bank cuts its key interest rate to 1.75% as inflation in the euro area falls.",
  "Russian drones strike an energy facility in Kharkiv, cutting power to 40,000 homes.",
  "Voters in Japan go to the polls for a snap general election called by Prime Minister Ishiba.",
  "The Reserve Bank of India keeps the repo rate unchanged at 5.5% for the third time.",
  "A magnitude 6.1 earthquake strikes off the coast of Indonesia, according to the USGS.",
  "Brazil and Argentina sign a trade agreement on lithium mining in Buenos Aires.",
].map((text) => ({ text, source: "Wikipedia" }));

describe("daily quiz", () => {
  it("blanks a real word or number and offers four distinct options", () => {
    const q = buildQuiz(s, "2026-10-19");
    expect(q.length).toBeGreaterThanOrEqual(3);
    for (const x of q) {
      expect(x.sentence).toContain("_____");
      expect(x.options).toContain(x.answer);
      expect(new Set(x.options).size).toBe(4);
      expect(s.some((o) => o.text === x.sentence.replace("_____", x.answer))).toBe(true);
    }
  });
  it("gives the same quiz all day", () => {
    expect(buildQuiz(s, "2026-10-19")).toEqual(buildQuiz(s, "2026-10-19"));
  });
});

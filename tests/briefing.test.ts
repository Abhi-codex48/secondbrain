import { describe, expect, it } from "vitest";
import { parseCurrentEvents, wikiLine } from "../scripts/fetch-knowledge";

const sample = `{{Current events|year=2025|month=10|day=17|content=
<!-- All news items below this line -->
'''Armed conflicts and attacks'''
*[[Russian invasion of Ukraine]]
**[[Attacks on civilians in the Russian invasion of Ukraine|Attacks on civilians]]
***Russian drones strike an energy facility in [[Kharkiv]], cutting power to thousands of homes. ([https://www.reuters.com/x Reuters]) ([https://apnews.com/y AP])
'''Business and economy'''
*The [[Reserve Bank of India]] keeps its repo rate unchanged at 5.5%. ([https://www.bbc.com/z BBC News])
'''Science and technology'''
*[[SpaceX]]
**SpaceX launches a new batch of satellites from Florida after two delays. ([https://example.org/a ''Space.com''])
<!-- All news items above this line -->|}}`;

describe("current events", () => {
  it("reads categories, topics, events and their cited sources", () => {
    const ev = parseCurrentEvents(sample, "2025-10-17");
    expect(ev).toHaveLength(3);
    expect(ev[0]).toMatchObject({ category: "Armed conflicts and attacks", topic: "Russian invasion of Ukraine · Attacks on civilians" });
    expect(ev[0].text).toBe("Russian drones strike an energy facility in Kharkiv, cutting power to thousands of homes.");
    expect(ev[0].sources.map((s) => s.name)).toEqual(["Reuters", "AP"]);
    expect(ev[1]).toMatchObject({ category: "Business and economy", topic: "", text: "The Reserve Bank of India keeps its repo rate unchanged at 5.5%." });
    expect(ev[2].sources[0].name).toBe("Space.com");
  });
  it("turns links into plain words", () => {
    expect(wikiLine("[[A|B]] and [[C]] ''x''").text).toBe("B and C x");
  });
});

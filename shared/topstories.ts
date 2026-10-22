// Top stories right now: the events most newspapers are reporting. Headlines
// from the last few hours are grouped when they share enough key words, and a
// group counts once per paper. No guessing at meaning, only matching words.

export interface Headline { id: string; title: string; source: string; sourceName: string; publishedAt: string | null; fetchedAt: string; topics: string[] }
export interface TopStory { title: string; section: string; papers: string[]; latest: string; items: { id: string; title: string; sourceName: string }[] }

const STOP = new Set(("a an the and or but of to in on at for from by with as is are was were be been being it its this that these those after before over under into about "
  + "amid against during up down out off new news latest live update updates says said say will would could can may might has have had not no "
  + "than more most what why how who when where which all any some just also first last one two three day today week year years "
  + "india indian govt government minister ministers state states says report reports amid big top day's watch video photos").split(" "));

/** The words that identify a story: lower case, no common words, simple plural folding. */
export function keyWords(title: string): Set<string> {
  const words = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']s\b/g, "").split(/[^a-z0-9]+/);
  return new Set(words.filter((w) => (w.length > 2 || /^\d+$/.test(w)) && !STOP.has(w)).map((w) => (w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)));
}

const shared = (a: Set<string>, b: Set<string>) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n; };

/**
 * Two headlines report the same event when they share at least three key words making up a
 * fair part of the shorter one, or two words when both are short.
 */
export function sameStory(a: Set<string>, b: Set<string>): boolean {
  const n = shared(a, b);
  return (n >= 3 && n / Math.min(a.size, b.size) >= 0.34) || (n >= 2 && Math.max(a.size, b.size) <= 5);
}

export function topStories(items: Headline[], now = Date.now(), hours = 12, max = 6): TopStory[] {
  const recent = items
    .filter((i) => i.source !== "pib")
    .map((i) => ({ ...i, t: Date.parse(i.publishedAt ?? i.fetchedAt) }))
    .filter((i) => Number.isFinite(i.t) && now - i.t < hours * 3600_000 && i.t <= now + 600_000)
    .sort((x, y) => y.t - x.t);
  const groups: { core: Set<string>; members: (typeof recent[number] & { kw: Set<string> })[] }[] = [];
  for (const it of recent) {
    const kw = keyWords(it.title);
    if (kw.size < 2) continue;
    const g = groups.find((x) => sameStory(x.core, kw));
    if (g) {
      g.members.push({ ...it, kw });
      // Once a few papers agree, words most of them use become part of what the story is.
      if (g.members.length >= 3) for (const w of kw) if (g.members.filter((m) => m.kw.has(w)).length * 2 > g.members.length) g.core.add(w);
    } else groups.push({ core: new Set(kw), members: [{ ...it, kw }] });
  }
  return groups
    .map((g) => {
      const papers = [...new Set(g.members.map((m) => m.sourceName))];
      // The headline that shares the most words with the others says it best (long ones lose a little).
      const fit = (x: { kw: Set<string>; title: string }) => g.members.reduce((s, m) => s + shared(x.kw, m.kw), 0) - Math.max(0, x.title.length - 90) / 15;
      const best = [...g.members].sort((x, y) => fit(y) - fit(x) || x.title.length - y.title.length)[0];
      const sections = g.members.map((m) => m.topics[0]).filter((s) => s && s !== "Top stories");
      const section = sections.sort((a, b) => sections.filter((s) => s === b).length - sections.filter((s) => s === a).length)[0] ?? "Top stories";
      const seen = new Set<string>();
      const one = g.members.filter((m) => !seen.has(m.sourceName) && seen.add(m.sourceName));
      return { title: best.title, section, papers, latest: new Date(g.members[0].t).toISOString(), items: one.map((m) => ({ id: m.id, title: m.title, sourceName: m.sourceName })), score: papers.length };
    })
    .filter((g) => g.score >= 3)
    .sort((a, b) => b.score - a.score || b.latest.localeCompare(a.latest))
    .slice(0, max)
    .map(({ score: _score, ...s }) => s);
}

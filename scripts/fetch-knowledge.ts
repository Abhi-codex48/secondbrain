// Writes knowledge.json for the "World briefing" box (see shared/briefing.ts).
// Runs in GitHub Actions: node --experimental-strip-types scripts/fetch-knowledge.ts <out> [previousUrl]
import { writeFileSync } from "node:fs";
import { buildBriefing, type Get } from "../shared/briefing.ts";

export { parseCurrentEvents, wikiLine } from "../shared/briefing.ts";

const [out = "knowledge.json", previousUrl] = process.argv.slice(2);
const UA = "SecondBrainBriefing/1.0 (https://github.com/Abhi-codex48/secondbrain; daily news briefing)";

const get: Get = async (url) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
};

async function main() {
  const brief = await buildBriefing(get, console.log);
  const total = brief.top.length + brief.events.length + brief.trending.length;
  if (!total && previousUrl) {
    try {
      writeFileSync(out, JSON.stringify(await get(previousUrl)));
      console.log("knowledge.json: Wikipedia unreachable, kept the previous briefing");
      return;
    } catch { /* nothing to keep */ }
  }
  writeFileSync(out, JSON.stringify(brief));
  const cats = [...new Set(brief.events.map((e) => e.category))].join(", ");
  console.log(`knowledge.json: ${brief.top.length} top stories, ${brief.events.length} events (${cats}), ${brief.trending.length} trending, ${brief.onthisday.length} on this day`);
}

if (process.argv[1]?.endsWith("fetch-knowledge.ts")) {
  main().catch((e) => {
    // Never block the deploy over this box.
    console.error(e);
    writeFileSync(out, JSON.stringify({ day: "", top: [], events: [], trending: [], onthisday: [] }));
  });
}

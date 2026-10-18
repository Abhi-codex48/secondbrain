// Builds today's "Know more" box: one short explainer per subject, taken from
// Simple English Wikipedia (plain, easy English) or, if a page is missing
// there, from English Wikipedia; plus a few "On this day" events. Every card
// links to its Wikipedia page. The choice of pages changes every day.
// Runs in GitHub Actions: node --experimental-strip-types scripts/fetch-knowledge.ts <out> [previousUrl]
import { writeFileSync } from "node:fs";

const [out = "knowledge.json", previousUrl] = process.argv.slice(2);
const UA = "SecondBrainKnowledge/1.0 (https://github.com/Abhi-codex48/secondbrain; daily study box)";

// Well-known Wikipedia articles per subject. One per subject is shown each day.
const SUBJECTS: Record<string, string[]> = {
  "AI": ["Artificial intelligence", "Machine learning", "Artificial neural network", "Large language model", "Computer vision", "Natural language processing", "Turing test", "Deep learning", "Robotics", "Chatbot", "Generative artificial intelligence", "Alan Turing"],
  "Technology": ["Semiconductor", "Internet", "5G", "Blockchain", "Cloud computing", "Quantum computing", "Global Positioning System", "Optical fiber", "Lithium-ion battery", "Transistor", "Unified Payments Interface", "Electric vehicle"],
  "Money & Economy": ["Inflation", "Gross domestic product", "Reserve Bank of India", "Stock market", "Mutual fund", "Interest rate", "Goods and Services Tax (India)", "Cryptocurrency", "Fiscal policy", "Monetary policy", "World Bank", "International Monetary Fund"],
  "Geography": ["Himalayas", "Western Ghats", "Ganges", "Monsoon", "Tropic of Cancer", "Plate tectonics", "Thar Desert", "Deccan Plateau", "Sundarbans", "El Niño–Southern Oscillation", "Brahmaputra River", "Andaman and Nicobar Islands"],
  "World": ["Southeast Asia", "Middle East", "Sahel", "Arctic", "Balkans", "Central Asia", "Indian Ocean", "South China Sea", "Horn of Africa", "European Union", "United Nations", "BRICS"],
  "India": ["Constitution of India", "Parliament of India", "Election Commission of India", "Supreme Court of India", "Panchayati raj", "Indian Space Research Organisation", "NITI Aayog", "Fundamental rights in India", "Directive Principles", "Finance Commission (India)", "President of India", "Comptroller and Auditor General of India"],
  "Science & Space": ["Black hole", "Photosynthesis", "DNA", "Chandrayaan-3", "James Webb Space Telescope", "Vaccine", "Greenhouse effect", "Ozone layer", "Periodic table", "Gravity", "Mars", "Aditya-L1"],
  "Environment": ["Climate change", "Biodiversity", "Ramsar Convention", "Paris Agreement", "Coral reef", "Mangrove", "Renewable energy", "Carbon footprint", "Wetland", "Desertification", "Project Tiger", "Air pollution"],
  "History & Culture": ["Indus Valley Civilisation", "Maurya Empire", "Mughal Empire", "Indian independence movement", "Ashoka", "Silk Road", "Renaissance", "Industrial Revolution", "World Heritage Site", "Vijayanagara Empire", "Chola dynasty", "Gupta Empire"],
};

interface Card { subject: string; title: string; text: string; url: string; image: string | null; simple: boolean }
interface Event { year: number; text: string; url: string | null }

async function json(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, "Api-User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/** The first two or three sentences: short enough to read at a glance. */
function short(text: string, max = 340): string {
  const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let s = "";
  for (const p of parts) {
    if ((s + p).length > max && s) break;
    s += p;
  }
  return s.trim();
}

async function summary(title: string): Promise<Omit<Card, "subject"> | null> {
  const path = encodeURIComponent(title.replace(/ /g, "_"));
  for (const [host, simple] of [["simple.wikipedia.org", true], ["en.wikipedia.org", false]] as const) {
    try {
      const j = await json(`https://${host}/api/rest_v1/page/summary/${path}`);
      if (j.type === "disambiguation" || !j.extract) continue;
      return { title: j.title, text: short(j.extract), url: j.content_urls?.desktop?.page ?? `https://${host}/wiki/${path}`, image: j.thumbnail?.source ?? null, simple };
    } catch {
      /* try the next wiki */
    }
  }
  return null;
}

async function main() {
  const now = new Date(Date.now() + 330 * 60_000); // India time
  const day = now.toISOString().slice(0, 10);
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400_000);

  const cards = (await Promise.all(Object.entries(SUBJECTS).map(async ([subject, titles], i) => {
    // Different subjects move at different steps, so the mix changes daily.
    for (let k = 0; k < 3; k++) {
      const c = await summary(titles[(n + i * 5 + k) % titles.length]);
      if (c) return { subject, ...c };
    }
    return null;
  }))).filter((c): c is Card => !!c);

  let events: Event[] = [];
  try {
    const [mm, dd] = [day.slice(5, 7), day.slice(8, 10)];
    const j = await json(`https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`);
    events = (j.selected ?? [])
      .filter((e: { year?: number; text?: string }) => e.year && e.text)
      .slice(0, 5)
      .map((e: { year: number; text: string; pages?: { content_urls?: { desktop?: { page?: string } } }[] }) => ({ year: e.year, text: short(e.text, 220), url: e.pages?.[0]?.content_urls?.desktop?.page ?? null }));
  } catch (e) {
    console.log(`On this day: ${(e as Error).message}`);
  }

  if (!cards.length) {
    // Wikipedia unreachable: keep yesterday's box rather than an empty one.
    if (previousUrl) {
      try {
        const prev = await json(previousUrl);
        writeFileSync(out, JSON.stringify(prev));
        console.log("knowledge.json: Wikipedia unreachable, kept the previous box");
        return;
      } catch { /* nothing to keep */ }
    }
    writeFileSync(out, JSON.stringify({ day, cards: [], events: [] }));
    console.log("knowledge.json: no cards");
    return;
  }
  writeFileSync(out, JSON.stringify({ day, cards, events }));
  console.log(`knowledge.json: ${cards.length} cards, ${events.length} events for ${day}`);
}

main().catch((e) => {
  // Never block the deploy over this box.
  console.error(e);
  writeFileSync(out, JSON.stringify({ day: "", cards: [], events: [] }));
});

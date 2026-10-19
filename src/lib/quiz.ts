// A daily quiz built from the day's world briefing: one word or number is
// blanked out of a real news sentence, with three wrong options taken from
// other stories of the same day. No AI; every question is a quoted sentence.

export interface Question { sentence: string; answer: string; options: string[]; source: string }

const NUMBER = /\b\d[\d,.]*(?:\s?(?:%|per cent|percent|million|billion|crore|lakh))?/g;
// Names: capitalised words (2+ letters), allowing "of", "and", "the" inside.
const NAME = /\b[A-Z][a-zA-Z'’-]+(?:\s+(?:of|and|the|de|al)?\s*[A-Z][a-zA-Z'’-]+)*/g;
const SKIP = new Set(["The", "A", "An", "In", "On", "At", "After", "Before", "During", "This", "That", "It", "He", "She", "They", "We", "His", "Her", "Their", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]);

function rand(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const names = (s: string) => [...s.matchAll(NAME)].map((m) => m[0].trim()).filter((n, i) => !SKIP.has(n) && !(i === 0 && s.startsWith(n) && n.split(" ").length === 1));
const numbers = (s: string) => [...s.matchAll(NUMBER)].map((m) => m[0].trim());

export function buildQuiz(sentences: { text: string; source: string }[], day: string, count = 5): Question[] {
  const r = rand(day);
  const pool = sentences.filter((s) => s.text.length > 40 && s.text.length < 320);
  const allNames = [...new Set(pool.flatMap((s) => names(s.text)))];
  const allNumbers = [...new Set(pool.flatMap((s) => numbers(s.text)))];
  const order = [...pool].sort(() => r() - 0.5);
  const out: Question[] = [];
  for (const s of order) {
    if (out.length >= count) break;
    const nm = names(s.text), nb = numbers(s.text);
    const useNumber = nb.length > 0 && (nm.length === 0 || r() < 0.4);
    const answer = useNumber ? nb[Math.floor(r() * nb.length)] : nm[Math.floor(r() * nm.length)];
    if (!answer) continue;
    const family = (useNumber ? allNumbers : allNames).filter((x) => x !== answer && !s.text.includes(x));
    if (family.length < 3) continue;
    const wrong = [...family].sort(() => r() - 0.5).slice(0, 3);
    const options = [...wrong, answer].sort(() => r() - 0.5);
    const sentence = s.text.replace(answer, "_____");
    if (sentence === s.text) continue;
    out.push({ sentence, answer, options, source: s.source });
  }
  return out;
}

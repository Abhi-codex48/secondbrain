// Key points without AI: picks the most informative sentences from the text
// itself (frequency-based extractive summary), plus facts with numbers, key
// terms and the laws, bodies and schemes it mentions. Nothing is rewritten,
// so nothing can be invented. Runs in the browser; no server, no quota.
import { classify } from "../../shared/classify";

export interface KeyPoints {
  lead: string;
  points: string[];
  /** Detailed only: the article's most important passages, in reading order. */
  summary?: string[];
  facts: string[];
  terms: string[];
  mentions: string[];
  topics: string[];
  based_on: "full" | "excerpt" | "pasted" | "note";
  created_at: string;
}

const STOP = new Set(
  ("a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your said says say also however according one two new year years per cent percent mr ms dr like including among within without across around may might must shall many much made make makes since still even well first last told added")
    .split(" "),
);
// Abbreviations that end with a full stop but don't end a sentence.
const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|No|Nos|Rs|Govt|Dept|Art|Sec|Vol|Fig|Ltd|Co|Inc|vs|etc|i\.e|e\.g|U\.S|U\.K|U\.N|a\.m|p\.m|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/i;

export function splitSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  const out: string[] = [];
  let buf = "";
  const parts = clean.split(/(?<=[.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z0-9₹])/);
  for (const p of parts) {
    buf = buf ? `${buf} ${p}` : p;
    const lastWord = buf.split(" ").pop() ?? "";
    if (ABBR.test(lastWord) || /\b[A-Z]\.$/.test(buf)) continue; // "S. Jaishankar", "Rs."
    out.push(buf.trim());
    buf = "";
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s.length >= 40 && s.length <= 420 && /[a-z]/.test(s));
}

const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z'-]+|\d+(?:\.\d+)?/g) ?? []).filter((w) => !STOP.has(w) && w.length > 2);
const NUMERIC = /(\d|₹|\bRs\.?\s|\bper ?cent\b|%|\bcrore\b|\blakh\b|\bmillion\b|\bbillion\b|\btrillion\b)/i;

function jaccard(a: Set<string>, b: Set<string>) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n || 1);
}

function rank(sentences: string[], title: string) {
  const freq = new Map<string, number>();
  const sw = sentences.map((s) => words(s));
  for (const ws of sw) for (const w of new Set(ws)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const max = Math.max(1, ...freq.values());
  const titleWords = new Set(words(title));
  return sentences.map((s, i) => {
    const ws = sw[i];
    const content = ws.reduce((a, w) => a + (freq.get(w) ?? 0) / max, 0) / Math.pow(Math.max(ws.length, 1), 0.55);
    const titleHit = ws.filter((w) => titleWords.has(w)).length * 0.25;
    const position = i === 0 ? 0.6 : i < 3 ? 0.3 : i < 6 ? 0.1 : 0;
    const quote = /^["“]|["”]$/.test(s) ? -0.2 : 0; // long quotes are rarely the gist
    return { s, i, score: content + titleHit + position + quote, set: new Set(ws) };
  });
}

function pick(ranked: ReturnType<typeof rank>, n: number, exclude = new Set<number>()) {
  const chosen: typeof ranked = [];
  for (const r of [...ranked].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= n) break;
    if (exclude.has(r.i)) continue;
    if (chosen.some((c) => jaccard(c.set, r.set) > 0.5)) continue; // skip near-duplicates
    chosen.push(r);
  }
  return chosen.sort((a, b) => a.i - b.i);
}

const INSTITUTION = /\b(?:the\s)?((?:[A-Z][\w&'’.-]*\s(?:of\s|for\s|and\s|on\s)?){0,6}(?:Act|Bill|Amendment|Commission|Ministry|Department|Scheme|Yojana|Mission|Abhiyan|Court|Tribunal|Authority|Board|Council|Policy|Programme|Program|Index|Report|Survey|Agreement|Treaty|Convention|Organisation|Organization|Bank|Fund|Corporation|Committee|Aayog|Agency|Institute|Forum|Summit|Code|Rules))\b/g;
// Names that start with the keyword, e.g. "Ministry of Housing and Urban Affairs".
const INSTITUTION_OF = /\b((?:Ministry|Department|Commission|Court|Board|Council|Bank|Authority|Institute|Office|Bureau|Committee)\s(?:of|for|on)\s(?:the\s)?(?:[A-Z][\w&'’-]*(?:\s(?:and|&)\s|\s)?){1,6})/g;
const ARTICLE = /\b(?:Article|Section|Schedule|Clause)\s\d+[A-Z]?(?:\(\d+\))?/g;
const ACRONYM = /\b[A-Z][A-Z0-9&]{1,7}\b/g;
const PHRASE = /\b(?:[A-Z][a-z]+(?:\s(?:of|and|for|the)\s|\s)){1,4}[A-Z][a-z]+\b/g;
const NOT_TERM = new Set(["The", "This", "That", "These", "There", "However", "India", "Indian", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "PTI", "ANI", "IANS", "AM", "PM", "IST"]);

function topBy<T extends string>(items: T[], n: number, minCount = 1) {
  const c = new Map<string, number>();
  for (const x of items) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].filter(([, k]) => k >= minCount).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([k]) => k);
}

export function keyPoints(text: string, opts: { title?: string; detailed?: boolean; basedOn?: KeyPoints["based_on"] } = {}): KeyPoints | null {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return null;
  const title = opts.title ?? "";
  const ranked = rank(sentences, title);
  // Short: the gist in 3 points and 2 figures. Detailed: up to 10 points, every
  // figure worth keeping, and a condensed read-through of about a third of the article.
  const n = opts.detailed ? Math.min(10, Math.max(6, Math.round(sentences.length / 5))) : 3;
  const lead = sentences.find((s) => s.length >= 60) ?? sentences[0];
  const leadIdx = sentences.indexOf(lead);
  const points = pick(ranked, n, new Set([leadIdx]));
  const used = new Set([leadIdx, ...points.map((p) => p.i)]);
  const facts = pick(ranked.filter((r) => NUMERIC.test(r.s)), opts.detailed ? 8 : 2, used);
  const summary = opts.detailed && sentences.length > 8
    ? pick(ranked, Math.min(16, Math.ceil(sentences.length * 0.35)), new Set([leadIdx])).map((p) => p.s)
    : undefined;

  const mentions = topBy(
    [...text.matchAll(INSTITUTION)].map((m) => m[1].trim().replace(/^(?:of|for|and|on)\s/, "")).filter((m) => m.split(" ").length >= 2 && m.length <= 90)
      .concat([...text.matchAll(INSTITUTION_OF)].map((m) => m[1].trim().replace(/\s(?:and|&)$/, "")))
      .concat([...text.matchAll(ARTICLE)].map((m) => m[0])),
    opts.detailed ? 10 : 4,
  ).filter((m) => !/^(?:The|This|That|A|An)\s/.test(m));
  const mentionText = mentions.join(" ");
  const terms = topBy(
    [...text.matchAll(PHRASE)].map((m) => m[0]).filter((p) => !NOT_TERM.has(p.split(" ")[0]) || p.split(" ").length > 2)
      .concat([...text.matchAll(ACRONYM)].map((m) => m[0]).filter((a) => !NOT_TERM.has(a) && !/^\d+$/.test(a)))
      .filter((t) => !mentionText.includes(t)),
    opts.detailed ? 12 : 5,
    2,
  );
  return {
    lead,
    points: points.map((p) => p.s),
    ...(summary ? { summary } : {}),
    facts: facts.map((f) => f.s),
    terms,
    mentions,
    topics: classify(title, text.slice(0, 4000), { alwaysKeep: true }).topics,
    based_on: opts.basedOn ?? "full",
    created_at: new Date().toISOString(),
  };
}

export function keyPointsToHtml(k: KeyPoints): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = (h: string, xs: string[]) => (xs.length ? `<p><strong>${h}</strong></p><ul>${xs.map((x) => `<li><p>${esc(x)}</p></li>`).join("")}</ul>` : "");
  return `<p><strong>Gist:</strong> ${esc(k.lead)}</p>${list("Key points", k.points)}${list("Facts and figures", k.facts)}${k.summary ? `<p><strong>Condensed article</strong></p>${k.summary.map((x) => `<p>${esc(x)}</p>`).join("")}` : ""}${k.mentions.length ? `<p><strong>Mentioned:</strong> ${esc(k.mentions.join(", "))}</p>` : ""}`;
}

/** Plain text for copying to the clipboard or another app. */
export function keyPointsToText(k: KeyPoints, title = ""): string {
  const list = (h: string, xs: string[]) => (xs.length ? `\n${h}\n${xs.map((x) => `• ${x}`).join("\n")}\n` : "");
  return [title, `Gist: ${k.lead}`, list("Key points", k.points), list("Facts and figures", k.facts), k.summary ? `\nCondensed article\n${k.summary.join("\n\n")}\n` : "", k.mentions.length ? `\nMentioned: ${k.mentions.join(", ")}` : ""].filter(Boolean).join("\n").trim();
}

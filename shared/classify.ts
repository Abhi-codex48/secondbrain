// Keyword-based UPSC topic tagging. Runs without AI. A headline is kept only
// if it matches at least one UPSC topic and none of the excluded categories.

export const TOPICS = [
  "Polity",
  "Economy",
  "Environment",
  "Science & Tech",
  "International",
  "Society",
  "Security",
  "Geography",
  "History & Culture",
  "Agriculture",
  "Health",
] as const;
export type Topic = (typeof TOPICS)[number];

const KEYWORDS: Record<Topic, string[]> = {
  Polity: [
    "constitution", "constitutional", "supreme court", "high court", "parliament", "lok sabha",
    "rajya sabha", "bill", "ordinance", "governor", "president", "election commission", "election",
    "panchayat", "federalism", "fundamental right", "judiciary", "judgment", "verdict", "cabinet",
    "ministry", "governance", "legislature", "assembly", "speaker", "article 3", "tribunal",
    "cag", "upsc", "rti", "lokpal", "centre-state", "delimitation", "census", "policy",
  ],
  Economy: [
    "gdp", "inflation", "rbi", "reserve bank", "repo rate", "monetary", "fiscal", "budget", "gst",
    "tax", "deficit", "economy", "economic", "trade", "export", "import", "rupee", "banking",
    "bank", "msme", "industry", "manufacturing", "investment", "fdi", "sebi", "disinvestment",
    "employment", "unemployment", "subsidy", "niti aayog", "finance commission", "growth",
  ],
  Environment: [
    "climate", "environment", "pollution", "emission", "carbon", "forest", "wildlife", "biodiversity",
    "tiger", "wetland", "ramsar", "cop", "unfccc", "renewable", "solar", "net zero", "heatwave",
    "air quality", "aqi", "species", "conservation", "plastic", "mangrove", "ecology", "glacier",
  ],
  "Science & Tech": [
    "isro", "space", "satellite", "mission", "launch", "artificial intelligence", " ai ",
    "semiconductor", "quantum", "nuclear", "drdo", "vaccine", "genome", "biotech", "research",
    "technology", "cyber", "digital", "5g", "chandrayaan", "gaganyaan", "rocket", "scientist",
  ],
  International: [
    "china", "pakistan", "us ", "united states", "russia", "ukraine", "bilateral", "summit", "g20",
    "brics", "sco", "quad", "asean", "un ", "united nations", "foreign minister", "diplomat",
    "treaty", "agreement", "visa", "border", "nepal", "bangladesh", "sri lanka", "israel", "iran",
    "external affairs", "wto", "imf", "world bank", "geopolitic",
  ],
  Society: [
    "education", "school", "women", "gender", "child", "caste", "tribal", "poverty", "welfare",
    "scheme", "minority", "disability", "migrant", "labour", "social", "nutrition", "literacy",
    "reservation", "urban", "rural", "housing",
  ],
  Security: [
    "army", "navy", "air force", "defence", "defense", "terror", "militant", "insurgency", "naxal",
    "maoist", "security", "missile", "border security", "coast guard", "intelligence", "armed forces",
  ],
  Geography: [
    "monsoon", "rainfall", "flood", "cyclone", "earthquake", "landslide", "drought", "river", "imd",
    "disaster", "tsunami", "himalaya", "ocean", "coastal", "weather",
  ],
  "History & Culture": [
    "heritage", "unesco", "archaeolog", "temple", "festival", "culture", "cultural", "history",
    "historical", "freedom fighter", "monument", "art form", "classical", "language",
  ],
  Agriculture: [
    "farmer", "agricultur", "crop", "msp", "kharif", "rabi", "irrigation", "fertiliser", "fertilizer",
    "food security", "procurement", "fci", "fisheries", "dairy",
  ],
  Health: [
    "health", "hospital", "disease", "who ", "pandemic", "outbreak", "medical", "tuberculosis",
    "malaria", "ayushman", "mental health", "drug", "doctor", "nutrition",
  ],
};

const EXCLUDE = [
  "cricket", "ipl", "football", "fifa", "tennis", "match", "t20", "odi", "bollywood", "box office",
  "trailer", "web series", "ott", "celebrity", "actor", "actress", "horoscope", "astrology",
  "recipe", "fashion", "lifestyle", "stocks to buy", "share price", "stock market today",
  "sensex today", "nifty today", "gold rate", "petrol price today", "wedding", "dating", "bigg boss",
  "smartphone launch", "price in india", "deal", "discount", "sale",
];

/** Words that count only as whole words (short acronyms). */
const WHOLE_WORD = new Set(["bill", "cop", "rbi", "gst", "fdi", "cag", "rti", "imd", "msp", "fci", "sco", "wto", "imf", "ott", "odi", "deal", "sale", "match"]);

function has(text: string, kw: string): boolean {
  const k = kw.trim();
  if (WHOLE_WORD.has(k)) return new RegExp(`\\b${k}\\b`, "i").test(text);
  return text.includes(kw);
}

export interface Classification {
  topics: Topic[];
  keep: boolean;
}

export function classify(title: string, description = "", opts: { alwaysKeep?: boolean } = {}): Classification {
  const text = ` ${`${title} ${description}`.toLowerCase().replace(/\s+/g, " ")} `;
  const titleLow = ` ${title.toLowerCase()} `;
  const excluded = EXCLUDE.some((k) => has(titleLow, k));
  const scored = TOPICS.map((t) => ({ t, n: KEYWORDS[t].filter((k) => has(text, k)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((x) => x.t);
  const keep = !excluded && (scored.length > 0 || !!opts.alwaysKeep);
  return { topics: scored, keep };
}

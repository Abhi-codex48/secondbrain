// News sections. A headline's section comes from the newspaper itself, never
// from guessing at its words: first from the section in the article's web
// address (thehindu.com/sport/..., timesofindia.../business/...), otherwise
// from the section feed it was published in.

export const SECTIONS = [
  "India",
  "World",
  "Business",
  "Opinion",
  "Explained",
  "Science & Tech",
  "Environment",
  "Health",
  "Education",
  "Sports",
  "Entertainment",
  "Cities",
  "Lifestyle",
  "Government",
] as const;
export type Section = (typeof SECTIONS)[number];
/** Headlines whose section the paper didn't say (Google News fallback). */
export const TOP_STORIES = "Top stories";

// Address segments used by Indian newspapers, mapped to a section.
const PATHS: [RegExp, Section][] = [
  [/^(explained|explainers?)$/, "Explained"],
  [/^(opinion|opinions|editorials?|columns?|columnists?|lead|op-?ed|comment|blogs?|interview|letters?)$/, "Opinion"],
  [/^(sports?|cricket|football|tennis|hockey|badminton|chess|olympics|ipl)$/, "Sports"],
  [/^(entertainment|movies?|bollywood|hollywood|tv|television|music|web-series|ott|celebrities|cinema|reviews?)$/, "Entertainment"],
  [/^(sci-tech|science|technology|tech|gadgets|technology-news|mobile-phones|internet)$/, "Science & Tech"],
  [/^(environment|climate|climate-change|energy-and-environment|wildlife|pollution)$/, "Environment"],
  [/^(health|health-wellness|healthcare|fitness|wellness)$/, "Health"],
  [/^(education|careers?|exams?|jobs|campus)$/, "Education"],
  [/^(world|international|world-news|global|world-affairs)$/, "World"],
  [/^(business|economy|markets?|money|industry|companies|company|finance|banking|personal-finance|economy-policy|startups?|budget|commodities)$/, "Business"],
  [/^(cities|city|delhi|mumbai|bengaluru|bangalore|chennai|kolkata|hyderabad|pune|ahmedabad|lucknow|chandigarh|jaipur|patna|bhopal|kochi|thiruvananthapuram|[a-z]+-news-city)$/, "Cities"],
  [/^(lifestyle|life-and-style|life-style|life|travel|food|fashion|books|art|culture|relationships|trends)$/, "Lifestyle"],
  [/^(india|national|nation|india-news|politics|politics-and-nation|states|elections?)$/, "India"],
];

export function sectionFromUrl(url: string): Section | null {
  let parts: string[];
  try {
    parts = new URL(url).pathname.toLowerCase().split("/").filter(Boolean);
  } catch {
    return null;
  }
  // Only the first few segments name the section; the rest is the story's slug.
  for (const seg of parts.slice(0, 3)) {
    if (/^(news|article|articles|section|amp|story|stories)$/.test(seg)) continue;
    const hit = PATHS.find(([re]) => re.test(seg));
    if (hit) return hit[1];
    if (/-news$/.test(seg)) {
      const base = seg.replace(/-news$/, "");
      const again = PATHS.find(([re]) => re.test(base));
      if (again) return again[1];
    }
  }
  return null;
}

// News sources: 13 established national newspapers and the government's Press
// Information Bureau (PIB).
// Each paper lists its section feeds. Feed addresses follow each publisher's
// own RSS pattern; any that stop working show up as failures in Settings, and
// when all of a paper's feeds fail its headlines come from a Google News search
// for that site instead (headlines only, filed under "Top stories").
import type { Section } from "./sections.ts";

export interface Feed { url: string; section: Section }
export interface SourceDef {
  key: string;
  name: string;
  feeds: Feed[];
  /** Site used for the Google News fallback query. */
  site: string;
}

const f = (section: Section, url: string): Feed => ({ url, section });
const hindu = (section: Section, path: string) => f(section, `https://www.thehindu.com/${path}/feeder/default.rss`);
const ie = (section: Section, path: string) => f(section, `https://indianexpress.com/section/${path}/feed/`);
const ht = (section: Section, path: string) => f(section, `https://www.hindustantimes.com/feeds/rss/${path}/rssfeed.xml`);
const toi = (section: Section, id: string) => f(section, `https://timesofindia.indiatimes.com/rssfeeds/${id}.cms`);
const et = (section: Section, id: string) => f(section, `https://economictimes.indiatimes.com/rssfeeds/${id}.cms`);
const mint = (section: Section, path: string) => f(section, `https://www.livemint.com/rss/${path}`);
const bs = (section: Section, path: string) => f(section, `https://www.business-standard.com/rss/${path}.rss`);

export const DEFAULT_SOURCES: SourceDef[] = [
  {
    key: "the-hindu", name: "The Hindu", site: "thehindu.com",
    feeds: [
      hindu("India", "news/national"), hindu("World", "news/international"), hindu("Business", "business"),
      hindu("Opinion", "opinion"), hindu("Science & Tech", "sci-tech"), hindu("Environment", "sci-tech/energy-and-environment"),
      hindu("Health", "sci-tech/health"), hindu("Education", "education"), hindu("Sports", "sport"),
      hindu("Entertainment", "entertainment"), hindu("Cities", "news/cities"), hindu("Lifestyle", "life-and-style"),
    ],
  },
  {
    key: "indian-express", name: "The Indian Express", site: "indianexpress.com",
    feeds: [
      ie("India", "india"), ie("World", "world"), ie("Business", "business"), ie("Opinion", "opinion"),
      ie("Explained", "explained"), ie("Science & Tech", "technology"), ie("Education", "education"),
      ie("Sports", "sports"), ie("Entertainment", "entertainment"), ie("Cities", "cities"), ie("Lifestyle", "lifestyle"),
    ],
  },
  {
    key: "hindustan-times", name: "Hindustan Times", site: "hindustantimes.com",
    feeds: [
      ht("India", "india-news"), ht("World", "world-news"), ht("Business", "business"),
      ht("Opinion", "editorials"), ht("Education", "education"), ht("Sports", "sports"), ht("Entertainment", "entertainment"),
      ht("Cities", "cities"), ht("Lifestyle", "lifestyle"),
    ],
  },
  {
    key: "times-of-india", name: "The Times of India", site: "timesofindia.indiatimes.com",
    feeds: [
      toi("India", "-2128936835"), toi("World", "296589292"), toi("Business", "1898055"),
      toi("Science & Tech", "66949542"), toi("Science & Tech", "-2128672765"), toi("Environment", "2647163"),
      toi("Education", "913168846"), toi("Sports", "4719148"), toi("Entertainment", "1081479906"),
      toi("Lifestyle", "2886704"),
    ],
  },
  {
    key: "economic-times", name: "The Economic Times", site: "economictimes.indiatimes.com",
    feeds: [
      et("Business", "1373380680"), et("Business", "1977021501"), et("India", "1052732854"),
      et("Science & Tech", "13357270"), et("Opinion", "897228639"), et("Business", "1286551815"),
    ],
  },
  {
    key: "mint", name: "Mint", site: "livemint.com",
    feeds: [
      mint("Business", "economy"), mint("Business", "markets"), mint("Business", "companies"), mint("Opinion", "opinion"),
      mint("India", "politics"), mint("Science & Tech", "technology"), mint("Science & Tech", "science"),
      mint("Education", "education"), mint("Sports", "sports"),
    ],
  },
  {
    key: "business-standard", name: "Business Standard", site: "business-standard.com",
    feeds: [bs("India", "india-news-216"), bs("Business", "economy-102"), bs("Business", "markets-106"), bs("Business", "companies-101"), bs("Opinion", "opinion-105"), bs("Science & Tech", "technology-108")],
  },
  // Financial Express blocks automated feed readers (HTTP 403), so it comes through Google News.
  { key: "financial-express", name: "Financial Express", site: "financialexpress.com", feeds: [] },
  { key: "deccan-herald", name: "Deccan Herald", site: "deccanherald.com", feeds: [] },
  { key: "tribune", name: "The Tribune", site: "tribuneindia.com", feeds: [] },
  { key: "new-indian-express", name: "The New Indian Express", site: "newindianexpress.com", feeds: [] },
  { key: "telegraph", name: "The Telegraph", site: "telegraphindia.com", feeds: [] },
  { key: "statesman", name: "The Statesman", site: "thestatesman.com", feeds: [] },
  {
    key: "pib", name: "PIB (Govt. of India)", site: "pib.gov.in",
    feeds: [f("Government", "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3")],
  },
];

export function googleNewsFeed(site: string): string {
  const q = encodeURIComponent(`site:${site} when:1d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}

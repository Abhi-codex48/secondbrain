// Default news sources. Feed URLs come from public directories and the
// publishers' RSS pages; some could not be confirmed at build time, so every
// source also has a Google News fallback (headlines only) that is used when
// all of its own feeds fail. Users can edit feeds in Settings.

export interface SourceDef {
  key: string;
  name: string;
  feeds: string[];
  /** Site used for the Google News fallback query. */
  site: string;
}

export const DEFAULT_SOURCES: SourceDef[] = [
  {
    key: "the-hindu",
    name: "The Hindu",
    site: "thehindu.com",
    feeds: [
      "https://www.thehindu.com/news/national/feeder/default.rss",
      "https://www.thehindu.com/opinion/editorial/feeder/default.rss",
      "https://www.thehindu.com/opinion/lead/feeder/default.rss",
      "https://www.thehindu.com/business/Economy/feeder/default.rss",
      "https://www.thehindu.com/sci-tech/feeder/default.rss",
      "https://www.thehindu.com/news/international/feeder/default.rss",
    ],
  },
  {
    key: "indian-express",
    name: "The Indian Express",
    site: "indianexpress.com",
    feeds: [
      "https://indianexpress.com/section/india/feed/",
      "https://indianexpress.com/section/explained/feed/",
      "https://indianexpress.com/section/opinion/editorials/feed/",
      "https://indianexpress.com/section/business/economy/feed/",
    ],
  },
  {
    key: "hindustan-times",
    name: "Hindustan Times",
    site: "hindustantimes.com",
    feeds: [
      "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
      "https://www.hindustantimes.com/feeds/rss/editorials/rssfeed.xml",
    ],
  },
  {
    key: "times-of-india",
    name: "The Times of India",
    site: "timesofindia.indiatimes.com",
    feeds: [
      "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms",
      "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
    ],
  },
  {
    key: "economic-times",
    name: "The Economic Times",
    site: "economictimes.indiatimes.com",
    feeds: [
      "https://economictimes.indiatimes.com/rssfeeds/1373380680.cms",
      "https://economictimes.indiatimes.com/rssfeeds/1286551815.cms",
    ],
  },
  {
    key: "mint",
    name: "Mint",
    site: "livemint.com",
    feeds: ["https://www.livemint.com/rss/economy", "https://www.livemint.com/rss/opinion"],
  },
  {
    key: "business-standard",
    name: "Business Standard",
    site: "business-standard.com",
    feeds: [
      "https://www.business-standard.com/rss/india-news-216.rss",
      "https://www.business-standard.com/rss/latest.rss",
    ],
  },
  { key: "deccan-herald", name: "Deccan Herald", site: "deccanherald.com", feeds: [] },
  { key: "tribune", name: "The Tribune", site: "tribuneindia.com", feeds: [] },
  { key: "new-indian-express", name: "The New Indian Express", site: "newindianexpress.com", feeds: [] },
  {
    key: "pib",
    name: "PIB (Govt. of India)",
    site: "pib.gov.in",
    feeds: ["https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3"],
  },
];

export function googleNewsFeed(site: string): string {
  const q = encodeURIComponent(`site:${site} when:1d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}

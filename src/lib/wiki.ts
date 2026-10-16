export interface WikiHit {
  title: string;
  snippet: string;
  url: string;
}

/** Searches English Wikipedia directly from the browser (CORS allowed with origin=*). */
export async function searchWikipedia(q: string, signal?: AbortSignal): Promise<WikiHit[]> {
  const u = new URL("https://en.wikipedia.org/w/api.php");
  u.search = new URLSearchParams({ action: "query", list: "search", srsearch: q, srlimit: "5", format: "json", origin: "*" }).toString();
  const res = await fetch(u, { signal });
  if (!res.ok) throw new Error("Wikipedia did not respond");
  const data = await res.json();
  return (data.query?.search ?? []).map((r: { title: string; snippet: string }) => ({
    title: r.title,
    snippet: r.snippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'"),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
  }));
}

export const googleUrl = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

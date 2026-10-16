// Fetches an article (from a news item or a pasted link) and extracts the
// readable text. Fails with a clear reason when the site blocks reading.
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { cors, json, safeFetch, userClient } from "../_shared/http.ts";
import { canonicalUrl } from "../_shared/rss.ts";
import { classify } from "../_shared/classify.ts";

const MIN_FULL_CHARS = 1200;

function meta(doc: Document, names: string[]): string | null {
  for (const n of names) {
    const el = doc.querySelector(`meta[property="${n}"], meta[name="${n}"], meta[itemprop="${n}"]`);
    const v = el?.getAttribute("content");
    if (v) return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = await userClient(req);
  if (u instanceof Response) return u;
  const { sb, userId } = u;
  const body = await req.json().catch(() => ({}));

  let item: Record<string, unknown>;
  if (body.newsId) {
    const { data } = await sb.from("news_items").select("*").eq("id", body.newsId).maybeSingle();
    if (!data) return json({ error: "Article not found" }, 404);
    item = data;
    if (data.article_text && !body.refetch) return json({ item: data });
  } else if (typeof body.url === "string") {
    const url = canonicalUrl(body.url.trim());
    const { data } = await sb.from("news_items").select("*").eq("url", url).maybeSingle();
    if (data?.article_text && !body.refetch) return json({ item: data });
    item = data ?? { url, source_key: "link" };
  } else {
    return json({ error: "Send a link" }, 400);
  }

  const url = String(item.url);
  let extracted: { title: string; text: string; published: string | null; site: string } | null = null;
  let failure: string | null = null;
  try {
    const res = await safeFetch(url);
    if (!/html|xml/i.test(res.contentType)) throw new Error("That link is not a web page (it may be a PDF or file)");
    const { document } = parseHTML(res.text);
    const published = meta(document as unknown as Document, ["article:published_time", "datePublished", "pubdate", "date"]);
    const site = meta(document as unknown as Document, ["og:site_name"]) ?? new URL(res.finalUrl).hostname.replace(/^www\./, "");
    const art = new Readability(document as unknown as Document).parse();
    const text = (art?.textContent ?? "").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
    extracted = {
      title: (art?.title ?? meta(document as unknown as Document, ["og:title"]) ?? "").trim(),
      text,
      published: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : null,
      site,
    };
    if (text.length < 300) failure = "Only a small part of the article could be read (it may be paywalled)";
  } catch (e) {
    failure = (e as Error).message;
  }

  const level = extracted && extracted.text.length >= MIN_FULL_CHARS ? "full" : extracted && extracted.text.length >= 300 ? "excerpt" : (item.content_level as string) ?? "headline";
  const patch: Record<string, unknown> = {
    user_id: userId,
    url,
    content_level: level,
  };
  if (extracted && extracted.text.length >= 300) patch.article_text = extracted.text.slice(0, 60000);
  if (!item.id) {
    const title = extracted?.title || url;
    patch.title = title;
    patch.source_key = "link";
    patch.source_name = extracted?.site ?? new URL(url).hostname.replace(/^www\./, "");
    patch.published_at = extracted?.published ?? null; // unknown stays unknown
    patch.topics = classify(title, extracted?.text.slice(0, 1500) ?? "", { alwaysKeep: true }).topics;
    patch.status = "read";
    patch.read_at = new Date().toISOString();
  } else if (!item.published_at && extracted?.published) {
    patch.published_at = extracted.published;
  }
  const { data: saved, error } = await sb.from("news_items").upsert(patch, { onConflict: "user_id,url" }).select("*").single();
  if (error) return json({ error: error.message }, 500);
  return json({ item: saved, failure });
});

// Fetches today's headlines from the user's enabled sources, keeps the
// UPSC-relevant ones and stores them (duplicates by URL are skipped).
import { cors, json, safeFetch, userClient } from "../_shared/http.ts";
import { DEFAULT_SOURCES, googleNewsFeed } from "../_shared/sources.ts";
import { canonicalUrl, parseFeed, type FeedItem } from "../_shared/rss.ts";
import { classify } from "../_shared/classify.ts";

const MAX_AGE_MS = 48 * 3600_000;
const MAX_PER_SOURCE = 40;
const KEEP_DAYS = 14;

interface SourceRow {
  key: string;
  name: string;
  site: string;
  feeds: string[];
  enabled: boolean;
}

async function readFeed(url: string): Promise<FeedItem[]> {
  const res = await safeFetch(url, { maxBytes: 2_000_000, timeoutMs: 10000, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" });
  return parseFeed(res.text);
}

/** Opinion, editorial and "explained" feeds and PIB are always UPSC material. */
const alwaysKeepFeed = (feed: string, key: string) => key === "pib" || /editorial|opinion|explained|\/lead\//i.test(feed);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = await userClient(req);
  if (u instanceof Response) return u;
  const { sb, userId } = u;
  const body = await req.json().catch(() => ({}));

  const { data: settings } = await sb.from("user_settings").select("last_news_sync").maybeSingle();
  const last = settings?.last_news_sync ? Date.parse(settings.last_news_sync) : 0;
  if (!body.force && Date.now() - last < 5 * 60_000) return json({ skipped: true, last_news_sync: settings?.last_news_sync });

  let { data: sources } = await sb.from("sources").select("key,name,site,feeds,enabled");
  if (!sources || sources.length === 0) {
    const seed = DEFAULT_SOURCES.map((s) => ({ user_id: userId, key: s.key, name: s.name, site: s.site, feeds: s.feeds }));
    await sb.from("sources").upsert(seed, { onConflict: "user_id,key", ignoreDuplicates: true });
    sources = seed.map((s) => ({ ...s, enabled: true }));
  }

  const now = Date.now();
  const report: Record<string, { ok: boolean; count: number; error?: string; fallback: boolean }> = {};

  await Promise.all(
    (sources as SourceRow[]).filter((s) => s.enabled).map(async (src) => {
      const rows: Record<string, unknown>[] = [];
      const errors: string[] = [];
      let usedFallback = false;
      const collect = (items: FeedItem[], feed: string, viaGoogle: boolean) => {
        for (const it of items) {
          if (it.publishedAt && now - Date.parse(it.publishedAt) > MAX_AGE_MS) continue;
          let title = it.title;
          if (viaGoogle) title = title.replace(/\s+-\s+[^-]+$/, ""); // "Headline - Publisher"
          const c = classify(title, it.description, { alwaysKeep: alwaysKeepFeed(feed, src.key) });
          if (!c.keep) continue;
          rows.push({
            user_id: userId,
            url: viaGoogle ? it.url : canonicalUrl(it.url),
            title,
            description: viaGoogle ? "" : it.description,
            source_key: src.key,
            source_name: src.name,
            published_at: it.publishedAt,
            topics: c.topics.length ? c.topics : ["Editorial"],
            content_level: !viaGoogle && it.description.length > 200 ? "excerpt" : "headline",
          });
        }
      };
      const results = await Promise.allSettled(src.feeds.map((f) => readFeed(f)));
      results.forEach((r, i) => {
        if (r.status === "fulfilled") collect(r.value, src.feeds[i], false);
        else errors.push(`${new URL(src.feeds[i]).pathname}: ${(r.reason as Error).message}`);
      });
      const ownOk = results.some((r) => r.status === "fulfilled" && r.value.length > 0);
      if (!ownOk) {
        usedFallback = true;
        try {
          const gfeed = googleNewsFeed(src.site);
          collect(await readFeed(gfeed), gfeed, true);
        } catch (e) {
          errors.push(`Google News fallback: ${(e as Error).message}`);
        }
      }
      // newest first, bounded
      rows.sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")));
      const unique = [...new Map(rows.map((r) => [r.url as string, r])).values()].slice(0, MAX_PER_SOURCE);
      let inserted = 0;
      if (unique.length) {
        const { data, error } = await sb.from("news_items").upsert(unique, { onConflict: "user_id,url", ignoreDuplicates: true }).select("id");
        if (error) errors.push(error.message);
        inserted = data?.length ?? 0;
      }
      const ok = unique.length > 0 || (ownOk && errors.length === 0);
      report[src.key] = { ok, count: inserted, error: errors.join(" · ") || undefined, fallback: usedFallback };
      await sb.from("sources").update({
        last_ok_at: ok ? new Date().toISOString() : undefined,
        last_error: errors.length ? errors.join(" · ").slice(0, 500) : null,
        last_count: inserted,
        used_fallback: usedFallback,
      }).eq("key", src.key);
    }),
  );

  // Keep the inbox bounded: unsaved items older than KEEP_DAYS are removed.
  await sb.from("news_items").delete().neq("status", "saved").lt("fetched_at", new Date(now - KEEP_DAYS * 86400_000).toISOString());
  const syncedAt = new Date().toISOString();
  await sb.from("user_settings").upsert({ user_id: userId, last_news_sync: syncedAt }, { onConflict: "user_id" });
  return json({ synced_at: syncedAt, sources: report });
});

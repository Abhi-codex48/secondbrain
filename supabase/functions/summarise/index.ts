// Creates an AI summary using the free tier of Google Gemini.
// There is no paid fallback: when quotas run out the app keeps working without AI.
import { cors, json, userClient } from "../_shared/http.ts";
import { buildPrompt, parseSummary, type Length, type Summary } from "../_shared/ai.ts";

const DAILY_LIMIT = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "150");

async function callGemini(system: string, user: string) {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return null;
  // Flash-Lite has the largest free daily allowance; the "-latest" alias follows Google's renames.
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-flash-lite-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
  return { text, provider: "Gemini", model };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = await userClient(req);
  if (u instanceof Response) return u;
  const { sb } = u;
  const body = await req.json().catch(() => ({}));
  const length: Length = body.length === "detailed" ? "detailed" : "short";

  let text = "";
  let title = typeof body.title === "string" ? body.title : "";
  let basedOn: Summary["based_on"] = "pasted";
  let newsItem: Record<string, any> | null = null;

  if (body.newsId) {
    const { data } = await sb.from("news_items").select("id,title,article_text,description,content_level,summaries").eq("id", body.newsId).maybeSingle();
    if (!data) return json({ error: "Article not found" }, 404);
    newsItem = data;
    title = data.title;
    if (typeof body.text === "string" && body.text.trim().length > 200) {
      // the user pasted the article text themselves
      text = body.text.trim();
      basedOn = "pasted";
      await sb.from("news_items").update({ article_text: text.slice(0, 60000), content_level: "full", summaries: {} }).eq("id", data.id);
      newsItem.summaries = {};
    } else if (data.article_text) {
      text = data.article_text;
      basedOn = data.content_level === "full" ? "full" : "excerpt";
    } else {
      return json({ error: "Only the headline is available, so there is nothing to summarise. Paste the article text to get a summary.", code: "no_text" }, 422);
    }
    const cached = newsItem.summaries?.[length];
    if (cached && !body.regenerate && basedOn !== "pasted") return json({ summary: cached, cached: true });
  } else if (typeof body.text === "string" && body.text.trim().length >= 80) {
    text = body.text.trim();
    basedOn = body.basedOn === "note" ? "note" : "pasted";
  } else {
    return json({ error: "Not enough text to summarise (at least a few sentences are needed)", code: "no_text" }, 422);
  }

  const { data: count } = await sb.rpc("bump_ai_count");
  if (typeof count === "number" && count > DAILY_LIMIT) {
    return json({ error: `Today's AI limit (${DAILY_LIMIT}) is used up. It resets at midnight. You can still read and write notes.`, code: "quota" }, 429);
  }

  const { system, user } = buildPrompt(text, { title, length, basedOn });
  const errors: string[] = [];
  for (const call of [callGemini]) {
    try {
      const r = await call(system, user);
      if (!r) continue;
      const summary = { ...parseSummary(r.text, basedOn), provider: r.provider, model: r.model, created_at: new Date().toISOString() };
      if (newsItem) {
        await sb.from("news_items").update({ summaries: { ...(newsItem.summaries ?? {}), [length]: summary } }).eq("id", newsItem.id);
      }
      return json({ summary });
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  if (errors.length === 0) {
    return json({ error: "AI summaries are not set up yet. Add a free Gemini key (see README).", code: "not_configured" }, 503);
  }
  return json({ error: "Gemini's free quota is used up or the service is busy right now. Try again later; your notes are unaffected.", code: "unavailable", detail: errors }, 503);
});

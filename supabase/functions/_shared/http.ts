// Runtime helpers shared by the edge functions (Deno).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkUrlShape, isPrivateIPv4, isPrivateIPv6 } from "./ssrf.ts";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

/** Supabase client acting as the signed-in user, so row-level security applies. */
export async function userClient(req: Request): Promise<{ sb: SupabaseClient; userId: string } | Response> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in required" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser(auth.slice(7));
  if (error || !data.user) return json({ error: "Sign in required" }, 401);
  return { sb, userId: data.user.id };
}

async function resolvesPublic(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return !isPrivateIPv4(h);
  if (h.includes(":")) return !isPrivateIPv6(h);
  const [a, aaaa] = await Promise.all([
    Deno.resolveDns(h, "A").catch(() => [] as string[]),
    Deno.resolveDns(h, "AAAA").catch(() => [] as string[]),
  ]);
  if (a.length + aaaa.length === 0) return false;
  return a.every((ip) => !isPrivateIPv4(ip)) && aaaa.every((ip) => !isPrivateIPv6(ip));
}

const UA = "Mozilla/5.0 (compatible; SecondBrainReader/1.0; personal study notes)";

/**
 * Fetches a public URL with redirect re-checking, a timeout and a size cap.
 * Throws an Error whose message is safe to show to the user.
 */
export async function safeFetch(raw: string, opts: { maxBytes?: number; timeoutMs?: number; accept?: string } = {}) {
  const maxBytes = opts.maxBytes ?? 3_000_000;
  let current = raw;
  for (let hop = 0; hop < 5; hop++) {
    const shape = checkUrlShape(current);
    if (!shape.ok) throw new Error(shape.reason);
    if (!(await resolvesPublic(shape.url.hostname))) throw new Error("That site could not be reached");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
    let res: Response;
    try {
      res = await fetch(shape.url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, Accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      });
    } catch {
      clearTimeout(timer);
      throw new Error("The site did not respond");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      clearTimeout(timer);
      current = new URL(res.headers.get("location")!, shape.url).toString();
      continue;
    }
    if (!res.ok) {
      clearTimeout(timer);
      throw new Error(res.status === 401 || res.status === 403 || res.status === 402 ? "The site blocked automatic reading (paywall or bot protection)" : `The site returned an error (${res.status})`);
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    clearTimeout(timer);
    const buf = new Uint8Array(Math.min(size, maxBytes));
    let off = 0;
    for (const c of chunks) {
      buf.set(c.subarray(0, buf.length - off), off);
      off += c.byteLength;
      if (off >= buf.length) break;
    }
    return { finalUrl: current, contentType: res.headers.get("content-type") ?? "", text: new TextDecoder().decode(buf) };
  }
  throw new Error("Too many redirects");
}

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && key);

export const supabase = createClient(url || "https://not-configured.invalid", key || "not-configured", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Calls an edge function and turns errors into readable messages. */
export async function callFn<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    let code: string | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        message = j.error ?? message;
        code = j.code;
      } catch {
        /* keep the generic message */
      }
    }
    if (/Failed to send a request/i.test(message)) message = "Can't reach the server. Check your connection, or the functions may not be deployed yet.";
    throw Object.assign(new Error(message), { code });
  }
  return data as T;
}

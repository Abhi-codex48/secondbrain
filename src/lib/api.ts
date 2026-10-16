import { callFn, supabase } from "./supabase";
import { addDays, istDay, istDayStart } from "./date";
import type { Folder, NewsItem, Note, NoteVersion, Source, Summary, Todo } from "./types";

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

/** Plain text of note HTML, used for search and AI. */
export function htmlToText(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html.replace(/<(p|h[1-6]|li|br|blockquote|div)[^>]*>/gi, "\n$&");
  return (d.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

// Characters that would break PostgREST filter syntax are dropped from search words.
const escLike = (q: string) => q.replace(/[%_\\,()"'.:*]/g, " ").trim();

// ---------- folders ----------
export const listFolders = async () =>
  must(await supabase.from("folders").select("*").order("sort").order("name")) as Folder[];
export const createFolder = async (name: string, color: string) =>
  must(await supabase.from("folders").insert({ name: name.trim(), color }).select().single()) as Folder;
export const updateFolder = async (id: string, patch: Partial<Folder>) =>
  must(await supabase.from("folders").update(patch).eq("id", id).select().single()) as Folder;
export const deleteFolder = async (id: string) => must(await supabase.from("folders").delete().eq("id", id));

// ---------- notes ----------
export interface NoteFilter {
  q?: string;
  folderId?: string | null; // undefined = all, null = no folder
  kind?: string;
  source?: string;
  from?: string; // YYYY-MM-DD (read_on)
  to?: string;
  hasAi?: boolean;
  pinned?: boolean;
  trash?: boolean;
  limit?: number;
}

const LIST_COLS = "id,folder_id,kind,title,body_text,ai_summary,source_url,source_name,read_on,pinned,color,created_at,updated_at,deleted_at,ink";

export async function listNotes(f: NoteFilter = {}): Promise<Note[]> {
  let q = supabase.from("notes").select(LIST_COLS);
  q = f.trash ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
  if (f.folderId === null) q = q.is("folder_id", null);
  else if (f.folderId) q = q.eq("folder_id", f.folderId);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.source) q = q.eq("source_name", f.source);
  if (f.from) q = q.gte("read_on", f.from);
  if (f.to) q = q.lte("read_on", f.to);
  if (f.hasAi) q = q.not("ai_summary", "is", null);
  if (f.pinned) q = q.eq("pinned", true);
  for (const w of escLike(f.q ?? "").split(/\s+/).filter(Boolean).slice(0, 6)) {
    const p = `%${w}%`;
    q = q.or(`title.ilike.${p},body_text.ilike.${p},source_name.ilike.${p}`);
  }
  const rows = must(await q.order("pinned", { ascending: false }).order("updated_at", { ascending: false }).limit(f.limit ?? 200));
  return rows as unknown as Note[];
}

export const getNote = async (id: string) => must(await supabase.from("notes").select("*").eq("id", id).single()) as Note;

export async function saveNote(n: Partial<Note> & { id?: string }): Promise<Note> {
  const row: Record<string, unknown> = { ...n };
  if (typeof n.body_html === "string") row.body_text = htmlToText(n.body_html);
  delete row.created_at;
  delete row.updated_at;
  return must(await supabase.from("notes").upsert(row).select().single()) as Note;
}

export const trashNote = async (id: string) => must(await supabase.from("notes").update({ deleted_at: new Date().toISOString() }).eq("id", id));
export const restoreNote = async (id: string) => must(await supabase.from("notes").update({ deleted_at: null }).eq("id", id));
export const deleteNoteForever = async (id: string) => must(await supabase.from("notes").delete().eq("id", id));
export const emptyTrash = async () => must(await supabase.from("notes").delete().not("deleted_at", "is", null));

export const listVersions = async (noteId: string) =>
  must(await supabase.from("note_versions").select("id,title,body_html,ink,ai_summary,created_at").eq("note_id", noteId).order("created_at", { ascending: false })) as NoteVersion[];

export async function noteSources(): Promise<string[]> {
  const rows = must(await supabase.from("notes").select("source_name").not("source_name", "is", null).is("deleted_at", null).limit(1000)) as { source_name: string }[];
  return [...new Set(rows.map((r) => r.source_name))].sort();
}

// ---------- attachments ----------
export async function uploadImage(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Images must be under 5 MB");
  const { data: u } = await supabase.auth.getUser();
  const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${u.user!.id}/${crypto.randomUUID()}.${ext}`;
  must(await supabase.storage.from("attachments").upload(path, file, { contentType: file.type }));
  const { data, error } = await supabase.storage.from("attachments").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------- to-do ----------
export const listTodos = async () =>
  must(await supabase.from("todos").select("*").order("done").order("created_at", { ascending: false }).limit(500)) as Todo[];
export const addTodo = async (text: string, due_on?: string | null) =>
  must(await supabase.from("todos").insert({ text: text.trim(), due_on: due_on || null }).select().single()) as Todo;
export const setTodoDone = async (id: string, done: boolean) =>
  must(await supabase.from("todos").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", id).select().single()) as Todo;
export const updateTodo = async (id: string, patch: Partial<Todo>) => must(await supabase.from("todos").update(patch).eq("id", id));
export const deleteTodo = async (id: string) => must(await supabase.from("todos").delete().eq("id", id));

// ---------- news ----------
export async function listNews(opts: { topic?: string; source?: string; status?: string; day?: string; q?: string; limit?: number } = {}): Promise<NewsItem[]> {
  let q = supabase.from("news_items").select("id,url,title,description,source_key,source_name,published_at,fetched_at,topics,content_level,status,read_at,summaries");
  if (opts.status === "saved") q = q.eq("status", "saved");
  else if (opts.status === "unread") q = q.eq("status", "new");
  else q = q.neq("status", "dismissed");
  if (opts.topic) q = q.contains("topics", [opts.topic]);
  if (opts.source) q = q.eq("source_key", opts.source);
  if (opts.day) q = q.gte("fetched_at", istDayStart(opts.day)).lt("fetched_at", istDayStart(addDays(opts.day, 1)));
  if (opts.q) q = q.ilike("title", `%${escLike(opts.q)}%`);
  const rows = must(await q.order("published_at", { ascending: false, nullsFirst: false }).order("fetched_at", { ascending: false }).limit(opts.limit ?? 300));
  return rows as unknown as NewsItem[];
}
export const getNews = async (id: string) => must(await supabase.from("news_items").select("*").eq("id", id).single()) as NewsItem;
export const setNewsStatus = async (id: string, status: NewsItem["status"]) =>
  must(await supabase.from("news_items").update({ status, ...(status === "read" || status === "saved" ? { read_at: new Date().toISOString() } : {}) }).eq("id", id));

export const syncNews = (force = false) =>
  callFn<{ synced_at?: string; skipped?: boolean; sources?: Record<string, { ok: boolean; count: number; error?: string; fallback: boolean }> }>("news-sync", { force });
export const fetchArticle = (args: { newsId?: string; url?: string; refetch?: boolean }) =>
  callFn<{ item: NewsItem; failure?: string | null }>("fetch-article", args);
export const summarise = (args: { newsId?: string; text?: string; title?: string; length: "short" | "detailed"; regenerate?: boolean; basedOn?: "note" | "pasted" }) =>
  callFn<{ summary: Summary; cached?: boolean }>("summarise", args);

export const lastSync = async () =>
  (must(await supabase.from("user_settings").select("last_news_sync,ai_count,ai_day").maybeSingle()) as { last_news_sync: string | null; ai_count: number; ai_day: string | null } | null);

export const listSources = async () => must(await supabase.from("sources").select("*").order("name")) as Source[];
export const updateSource = async (key: string, patch: Partial<Source>) => must(await supabase.from("sources").update(patch).eq("key", key));

// ---------- daily log ----------
export async function activityBetween(from: string, to: string) {
  const [notes, news, todos] = await Promise.all([
    supabase.from("notes").select("id,title,kind,source_name,read_on,created_at,updated_at,ai_summary").is("deleted_at", null)
      .or(`and(read_on.gte.${from},read_on.lte.${to}),and(updated_at.gte.${istDayStart(from)},updated_at.lt.${istDayStart(addDays(to, 1))})`)
      .order("updated_at", { ascending: false }).limit(300),
    supabase.from("news_items").select("id,title,source_name,read_at,status").in("status", ["read", "saved"])
      .gte("read_at", istDayStart(from)).lt("read_at", istDayStart(addDays(to, 1))).order("read_at", { ascending: false }).limit(300),
    supabase.from("todos").select("id,text,done_at").eq("done", true)
      .gte("done_at", istDayStart(from)).lt("done_at", istDayStart(addDays(to, 1))).order("done_at", { ascending: false }).limit(300),
  ]);
  return {
    notes: must(notes) as Pick<Note, "id" | "title" | "kind" | "source_name" | "read_on" | "created_at" | "updated_at" | "ai_summary">[],
    news: must(news) as Pick<NewsItem, "id" | "title" | "source_name" | "read_at" | "status">[],
    todos: must(todos) as Pick<Todo, "id" | "text" | "done_at">[],
  };
}

// ---------- home counts ----------
export async function homeCounts() {
  const today = istDay();
  const [news, notes, todos] = await Promise.all([
    supabase.from("news_items").select("id", { count: "exact", head: true }).neq("status", "dismissed").gte("fetched_at", istDayStart(today)),
    supabase.from("notes").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("todos").select("id", { count: "exact", head: true }).eq("done", false),
  ]);
  return { news: news.count ?? 0, notes: notes.count ?? 0, todos: todos.count ?? 0 };
}

// ---------- storage ----------
export interface Usage {
  notes_bytes: number;
  trash_bytes: number;
  versions_bytes: number;
  news_bytes: number;
  news_count: number;
  notes_count: number;
  trash_count: number;
  files_bytes: number;
  files_count: number;
}
export const storageUsage = async () => must(await supabase.rpc("storage_usage")) as Usage;
export const deleteOldNews = async (days: number) =>
  must(await supabase.from("news_items").delete().neq("status", "saved").lt("fetched_at", new Date(Date.now() - days * 86400_000).toISOString()));
/** Deletes uploaded images that no note (including Trash) refers to any more. */
export async function deleteUnusedImages(): Promise<number> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user!.id;
  const files = must(await supabase.storage.from("attachments").list(uid, { limit: 1000 })) as { name: string }[];
  if (!files.length) return 0;
  const notes = must(await supabase.from("notes").select("body_html").limit(5000)) as { body_html: string }[];
  const all = notes.map((n) => n.body_html).join("\n");
  const unused = files.filter((f) => !all.includes(`${uid}/${f.name}`)).map((f) => `${uid}/${f.name}`);
  if (unused.length) must(await supabase.storage.from("attachments").remove(unused));
  return unused.length;
}
export const deleteOldVersions = async () => must(await supabase.from("note_versions").delete().lt("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()));

export async function findNoteForNews(newsId: string): Promise<Pick<Note, "id" | "title"> | null> {
  const rows = must(await supabase.from("notes").select("id,title").eq("news_item_id", newsId).is("deleted_at", null).limit(1)) as Pick<Note, "id" | "title">[];
  return rows[0] ?? null;
}

export async function folderCounts(): Promise<{ total: number; none: number; pinned: number; trash: number; by: Record<string, number> }> {
  const rows = must(await supabase.from("notes").select("folder_id,pinned,deleted_at").limit(10000)) as { folder_id: string | null; pinned: boolean; deleted_at: string | null }[];
  const by: Record<string, number> = {};
  let total = 0, none = 0, pinned = 0, trash = 0;
  for (const r of rows) {
    if (r.deleted_at) { trash++; continue; }
    total++;
    if (r.pinned) pinned++;
    if (r.folder_id) by[r.folder_id] = (by[r.folder_id] ?? 0) + 1;
    else none++;
  }
  return { total, none, pinned, trash, by };
}

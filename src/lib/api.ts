// Data layer on Google Firebase (Firestore). Everything lives under
// users/{uid}/... and is cached on the device, so the app works offline and
// syncs when the connection returns. Lists are filtered on the device, which
// keeps Firestore reads (free quota ~50,000/day) very low.
import {
  collection, deleteDoc, doc, getDoc, getDocs, getDocsFromCache, limit, orderBy, query, setDoc, where, writeBatch,
  type CollectionReference, type DocumentData,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { addDays, istDay } from "./date";
import type { Folder, NewsItem, Note, NoteVersion, Source, Todo } from "./types";

const uid = () => {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error("Please sign in again");
  return u;
};
const col = (name: string) => collection(db, "users", uid(), name) as CollectionReference<DocumentData>;
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/** Plain text of note HTML, used for search and key points. */
export function htmlToText(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html.replace(/<(p|h[1-6]|li|br|blockquote|div)[^>]*>/gi, "\n$&");
  return (d.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Resolves when Firestore confirms; a pending write stays queued on the device while offline. */
export type Synced = Promise<void>;

// ---------- notes (cached in memory, delta-synced) ----------
let notes: Map<string, Note> | null = null;
let notesFor = "";
let syncing: Promise<Map<string, Note>> | null = null;

async function syncNotes(): Promise<Map<string, Note>> {
  if (notesFor !== uid()) {
    notes = null;
    notesFor = uid();
  }
  if (syncing) return syncing;
  syncing = (async () => {
    if (!notes) {
      notes = new Map();
      const cached = await getDocsFromCache(col("notes")).catch(() => null);
      cached?.docs.forEach((d) => notes!.set(d.id, d.data() as Note));
    }
    // Only notes changed since the newest one on this device are downloaded.
    let max = "";
    for (const n of notes.values()) if (n.updated_at > max) max = n.updated_at;
    try {
      const snap = await getDocs(max ? query(col("notes"), where("updated_at", ">", max)) : col("notes"));
      snap.docs.forEach((d) => notes!.set(d.id, d.data() as Note));
    } catch {
      /* offline: use what is on the device */
    }
    return notes;
  })();
  try {
    return await syncing;
  } finally {
    syncing = null;
  }
}

export interface NoteFilter {
  q?: string;
  folderId?: string | null; // undefined = all, null = no folder
  kind?: string;
  source?: string;
  from?: string;
  to?: string;
  hasKeyPoints?: boolean;
  pinned?: boolean;
  trash?: boolean;
  limit?: number;
}

export async function listNotes(f: NoteFilter = {}): Promise<Note[]> {
  const all = [...(await syncNotes()).values()].filter((n) => !n.purged);
  const words = (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return all
    .filter((n) => (f.trash ? !!n.deleted_at : !n.deleted_at))
    .filter((n) => f.folderId === undefined || (f.folderId === null ? !n.folder_id : n.folder_id === f.folderId))
    .filter((n) => !f.kind || n.kind === f.kind)
    .filter((n) => !f.source || n.source_name === f.source)
    .filter((n) => !f.from || n.read_on >= f.from)
    .filter((n) => !f.to || n.read_on <= f.to)
    .filter((n) => !f.hasKeyPoints || !!n.key_points)
    .filter((n) => !f.pinned || n.pinned)
    .filter((n) => {
      if (!words.length) return true;
      const hay = `${n.title} ${n.body_text} ${n.source_name ?? ""} ${n.key_points?.lead ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at))
    .slice(0, f.limit ?? 500);
}

export async function getNote(id: string): Promise<Note> {
  const m = await syncNotes();
  const hit = m.get(id);
  if (hit && !hit.purged) return hit;
  const d = await getDoc(doc(col("notes"), id));
  if (!d.exists() || (d.data() as Note).purged) throw new Error("This note doesn't exist any more");
  m.set(id, d.data() as Note);
  return d.data() as Note;
}

const VERSION_GAP_MS = 10 * 60_000;
const MAX_VERSIONS = 30;
const lastSnapshot = new Map<string, number>();

/** Saves on the device immediately and returns; `synced` resolves when Firestore confirms. */
export function saveNote(patch: Partial<Note> & { id?: string }): { note: Note; synced: Synced } {
  const m = notes ?? new Map<string, Note>();
  notes = m;
  const id = patch.id ?? newId();
  const prev = m.get(id);
  const t = now();
  const note: Note = {
    id, folder_id: null, kind: "note", title: "", body_html: "", body_text: "", ink: null, key_points: null,
    source_url: null, source_name: null, source_published_at: null, news_item_id: null, read_on: istDay(),
    pinned: false, color: null, created_at: t, deleted_at: null,
    ...prev, ...patch, updated_at: t,
  };
  if (typeof patch.body_html === "string") note.body_text = htmlToText(patch.body_html);
  const size = JSON.stringify(note).length;
  if (size > 950_000) throw new Error("This note is too large to save (Firestore allows about 1 MB per note). Move some images or handwriting into a new note.");
  m.set(id, note);

  const writes: Promise<void>[] = [setDoc(doc(col("notes"), id), note)];
  // Version history: keep the previous content when it changes, at most once every 10 minutes.
  const changed = prev && (prev.body_html !== note.body_html || prev.title !== note.title || JSON.stringify(prev.ink) !== JSON.stringify(note.ink) || JSON.stringify(prev.key_points) !== JSON.stringify(note.key_points));
  if (changed && (prev.body_html || prev.ink || prev.key_points) && Date.now() - (lastSnapshot.get(id) ?? 0) > VERSION_GAP_MS) {
    lastSnapshot.set(id, Date.now());
    const v: NoteVersion = { id: newId(), title: prev.title, body_html: prev.body_html, ink: prev.ink, key_points: prev.key_points, created_at: t };
    writes.push(setDoc(doc(collection(db, "users", uid(), "notes", id, "versions"), v.id), v).then(() => pruneVersions(id)));
  }
  return { note, synced: Promise.all(writes).then(() => undefined) };
}

async function pruneVersions(noteId: string) {
  const vs = await getDocs(query(collection(db, "users", uid(), "notes", noteId, "versions"), orderBy("created_at", "desc")));
  await Promise.all(vs.docs.slice(MAX_VERSIONS).map((d) => deleteDoc(d.ref)));
}

export async function listVersions(noteId: string): Promise<NoteVersion[]> {
  const vs = await getDocs(query(collection(db, "users", uid(), "notes", noteId, "versions"), orderBy("created_at", "desc"), limit(MAX_VERSIONS)));
  return vs.docs.map((d) => d.data() as NoteVersion);
}

export const trashNote = (id: string) => saveNote({ id, deleted_at: now() }).synced;
export const restoreNote = (id: string) => saveNote({ id, deleted_at: null }).synced;

/** Removes the content for good; a small marker remains so other devices drop it too. */
export async function deleteNoteForever(id: string) {
  const vs = await getDocs(collection(db, "users", uid(), "notes", id, "versions")).catch(() => null);
  await Promise.all(vs?.docs.map((d) => deleteDoc(d.ref)) ?? []);
  const t = now();
  const marker = { id, purged: true, updated_at: t, deleted_at: t } as unknown as Note;
  notes?.set(id, marker);
  await setDoc(doc(col("notes"), id), marker);
}
export async function emptyTrash() {
  const trash = await listNotes({ trash: true });
  for (const n of trash) await deleteNoteForever(n.id);
}

export async function noteSources(): Promise<string[]> {
  const all = await listNotes();
  return [...new Set(all.map((n) => n.source_name).filter(Boolean) as string[])].sort();
}

export async function findNoteForNews(newsId: string): Promise<Pick<Note, "id" | "title"> | null> {
  const all = await listNotes();
  return all.find((n) => n.news_item_id === newsId) ?? null;
}

export async function folderCounts() {
  const all = [...(await syncNotes()).values()].filter((n) => !n.purged);
  const by: Record<string, number> = {};
  let total = 0, none = 0, pinned = 0, trash = 0;
  for (const n of all) {
    if (n.deleted_at) { trash++; continue; }
    total++;
    if (n.pinned) pinned++;
    if (n.folder_id) by[n.folder_id] = (by[n.folder_id] ?? 0) + 1;
    else none++;
  }
  return { total, none, pinned, trash, by };
}

// ---------- images (stored inside the note, since file storage needs a paid plan) ----------
export async function imageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  for (const q of [0.75, 0.6, 0.45, 0.3]) {
    const url = c.toDataURL("image/jpeg", q);
    if (url.length < 280_000) return url;
  }
  throw new Error("This image is too detailed to store. Try a smaller screenshot.");
}

// ---------- folders ----------
export async function listFolders(): Promise<Folder[]> {
  const s = await getDocs(col("folders"));
  return s.docs.map((d) => d.data() as Folder).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}
export async function createFolder(name: string, color: string): Promise<Folder> {
  const existing = await listFolders();
  if (existing.some((f) => f.name.toLowerCase() === name.trim().toLowerCase())) throw new Error("A folder with this name already exists");
  const f: Folder = { id: newId(), name: name.trim(), color, sort: 0, created_at: now() };
  void setDoc(doc(col("folders"), f.id), f);
  return f;
}
export async function updateFolder(id: string, patch: Partial<Folder>) {
  void setDoc(doc(col("folders"), id), patch, { merge: true });
}
/** Deletes the folder; its notes move to Unfiled. */
export async function deleteFolder(id: string) {
  for (const n of await listNotes({ folderId: id })) saveNote({ id: n.id, folder_id: null });
  for (const n of await listNotes({ folderId: id, trash: true })) saveNote({ id: n.id, folder_id: null });
  void deleteDoc(doc(col("folders"), id));
}

// ---------- to-do ----------
export async function listTodos(): Promise<Todo[]> {
  const s = await getDocs(col("todos"));
  return s.docs.map((d) => d.data() as Todo).sort((a, b) => Number(a.done) - Number(b.done) || b.created_at.localeCompare(a.created_at));
}
export async function addTodo(text: string, due_on?: string | null): Promise<Todo> {
  const t: Todo = { id: newId(), text: text.trim(), done: false, done_at: null, due_on: due_on || null, created_at: now() };
  void setDoc(doc(col("todos"), t.id), t);
  return t;
}
export async function setTodoDone(id: string, done: boolean) {
  void setDoc(doc(col("todos"), id), { done, done_at: done ? now() : null }, { merge: true });
}
export const deleteTodo = async (id: string) => void deleteDoc(doc(col("todos"), id));

// ---------- news (headlines from news.json; your read/saved state in Firestore) ----------
interface NewsFile {
  generatedAt: string;
  sources: Source[];
  items: { id: string; url: string; title: string; description: string; source: string; sourceName: string; publishedAt: string | null; fetchedAt: string; topics: string[]; level: "headline" | "excerpt" }[];
}
interface NewsState { status: NewsItem["status"]; read_at: string | null }
let newsFile: NewsFile | null = null;
let newsLoadedAt = 0;
let states: Map<string, NewsState> | null = null;

export async function loadNewsFile(force = false): Promise<NewsFile> {
  if (newsFile && !force && Date.now() - newsLoadedAt < 10 * 60_000) return newsFile;
  try {
    const res = await fetch(`./news.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const text = await res.text();
    newsFile = JSON.parse(text);
    try { localStorage.setItem("sb-news", text); } catch { /* storage full: fine */ }
  } catch {
    // Offline or the site is unreachable: show the last news list this device saw.
    const saved = (() => { try { return localStorage.getItem("sb-news"); } catch { return null; } })();
    if (!saved) throw new Error("News couldn't be loaded. Check your connection; headlines update every hour.");
    newsFile = JSON.parse(saved);
  }
  newsLoadedAt = Date.now();
  return newsFile!;
}

async function loadStates() {
  if (!states) {
    const s = await getDocs(col("newsState"));
    states = new Map(s.docs.map((d) => [d.id, d.data() as NewsState]));
  }
  return states;
}

function toItem(i: NewsFile["items"][number], st?: NewsState, text?: string | null): NewsItem {
  return {
    id: i.id, url: i.url, title: i.title, description: i.description, source_key: i.source, source_name: i.sourceName,
    published_at: i.publishedAt, fetched_at: i.fetchedAt, topics: i.topics, content_level: text ? "full" : i.level,
    article_text: text ?? null, status: st?.status ?? "new", read_at: st?.read_at ?? null,
  };
}

export async function listNews(opts: { topic?: string; source?: string; status?: string; day?: string; q?: string } = {}): Promise<NewsItem[]> {
  const [f, st] = await Promise.all([loadNewsFile(), loadStates()]);
  const q = opts.q?.toLowerCase();
  return f.items
    .map((i) => toItem(i, st.get(i.id)))
    .filter((n) => (opts.status === "saved" ? n.status === "saved" : opts.status === "unread" ? n.status === "new" : n.status !== "dismissed"))
    .filter((n) => !opts.topic || n.topics.includes(opts.topic))
    .filter((n) => !opts.source || n.source_key === opts.source)
    .filter((n) => !opts.day || istDay(n.fetched_at) === opts.day || (n.published_at !== null && istDay(n.published_at) === opts.day))
    .filter((n) => !q || n.title.toLowerCase().includes(q));
}

export async function getNews(id: string): Promise<NewsItem> {
  const [st, art] = await Promise.all([loadStates(), getDoc(doc(col("articles"), id)).catch(() => null)]);
  const saved = art?.exists() ? (art.data() as { text: string; item: NewsFile["items"][number] }) : null;
  const f = await loadNewsFile().catch(() => null);
  const item = f?.items.find((i) => i.id === id) ?? saved?.item;
  if (!item) throw new Error("This article is no longer in the news list");
  return toItem(item, st.get(id), saved?.text ?? null);
}

export async function setNewsStatus(id: string, status: NewsItem["status"]) {
  const s = await loadStates();
  const st: NewsState = { status, read_at: status === "read" || status === "saved" ? now() : s.get(id)?.read_at ?? null };
  s.set(id, st);
  void setDoc(doc(col("newsState"), id), st);
}

/** Stores article text you pasted (private) so key points can be picked from it. */
export async function savePastedText(item: NewsItem, text: string): Promise<NewsItem> {
  const raw = { id: item.id, url: item.url, title: item.title, description: item.description, source: item.source_key, sourceName: item.source_name, publishedAt: item.published_at, fetchedAt: item.fetched_at, topics: item.topics, level: "headline" as const };
  void setDoc(doc(col("articles"), item.id), { text: text.slice(0, 200_000), item: raw, saved_at: now() });
  return { ...item, article_text: text, content_level: "full" };
}

/** A link you pasted: kept as a private article you can read and take notes on. */
export async function addLink(url: string, title: string): Promise<string> {
  const id = `link-${(await sha1(url)).slice(0, 14)}`;
  const host = new URL(url).hostname.replace(/^www\./, "");
  const item = { id, url, title: title || host, description: "", source: "link", sourceName: host, publishedAt: null, fetchedAt: now(), topics: [], level: "headline" as const };
  await setDoc(doc(col("articles"), id), { text: "", item, saved_at: now() }, { merge: true });
  return id;
}
async function sha1(s: string) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function newsHealth() {
  const f = await loadNewsFile(true).catch(() => null);
  return { generatedAt: f?.generatedAt ?? null, sources: f?.sources ?? [] };
}

// ---------- daily log ----------
export async function activityBetween(from: string, to: string) {
  const inRange = (iso: string | null | undefined) => !!iso && istDay(iso) >= from && istDay(iso) <= to;
  const [all, st, todos, f] = await Promise.all([listNotes(), loadStates(), listTodos(), loadNewsFile().catch(() => null)]);
  const titles = new Map(f?.items.map((i) => [i.id, i]) ?? []);
  return {
    notes: all.filter((n) => (n.read_on >= from && n.read_on <= to) || inRange(n.updated_at)),
    news: [...st.entries()].filter(([, s]) => (s.status === "read" || s.status === "saved") && inRange(s.read_at))
      .map(([id, s]) => ({ id, title: titles.get(id)?.title ?? "Article", source_name: titles.get(id)?.sourceName ?? "", read_at: s.read_at, status: s.status })),
    todos: todos.filter((t) => t.done && inRange(t.done_at)),
  };
}

export async function homeCounts() {
  const today = istDay();
  const [news, fc, todos] = await Promise.all([
    listNews({ day: today }).catch(() => []),
    folderCounts().catch(() => ({ total: 0 })),
    listTodos().catch(() => []),
  ]);
  return { news: news.length, notes: fc.total, todos: todos.filter((t) => !t.done).length };
}

// ---------- storage, backup and clean-up ----------
const TABLES = ["folders", "notes", "todos", "newsState", "articles"] as const;

export async function exportAll(): Promise<Record<string, Record<string, unknown>[]>> {
  await syncNotes();
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const t of TABLES) {
    if (t === "notes") out.notes = [...notes!.values()].filter((n) => !n.purged) as unknown as Record<string, unknown>[];
    else out[t] = (await getDocs(col(t))).docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  return out;
}

export async function importAll(data: Record<string, Record<string, unknown>[]>, onProgress?: (m: string) => void) {
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = (data[t] ?? []).filter((r) => r && typeof r.id === "string");
    for (let i = 0; i < rows.length; i += 400) {
      onProgress?.(`Restoring ${t} (${Math.min(i + 400, rows.length)}/${rows.length})`);
      const b = writeBatch(db);
      for (const r of rows.slice(i, i + 400)) {
        const { id, ...rest } = r as { id: string };
        b.set(doc(col(t), id), t === "newsState" || t === "articles" ? rest : r);
      }
      await b.commit();
    }
    counts[t] = rows.length;
  }
  notes = null;
  states = null;
  return counts;
}

export async function storageUsage() {
  const data = await exportAll();
  const size = (rows: unknown[]) => rows.reduce<number>((a, r) => a + JSON.stringify(r).length, 0);
  const live = (data.notes as unknown as Note[]).filter((n) => !n.deleted_at);
  const trash = (data.notes as unknown as Note[]).filter((n) => n.deleted_at);
  return {
    notes_bytes: size(live), notes_count: live.length,
    trash_bytes: size(trash), trash_count: trash.length,
    other_bytes: size(data.folders) + size(data.todos) + size(data.newsState) + size(data.articles),
    articles_count: data.articles.length,
  };
}

/** Removes read/hidden marks and pasted article text older than `days`. Saved items are kept. */
export async function deleteOldNewsData(days: number) {
  const cutoff = addDays(istDay(), -days);
  const [st, arts] = await Promise.all([loadStates(), getDocs(col("articles"))]);
  for (const [id, s] of st) if (s.status !== "saved" && s.read_at && istDay(s.read_at) < cutoff) { st.delete(id); void deleteDoc(doc(col("newsState"), id)); }
  for (const a of arts.docs) {
    const d = a.data() as { saved_at?: string };
    if (st.get(a.id)?.status !== "saved" && d.saved_at && istDay(d.saved_at) < cutoff) void deleteDoc(a.ref);
  }
}

export async function deleteEverything() {
  await syncNotes();
  for (const n of notes!.values()) {
    const vs = await getDocs(collection(db, "users", uid(), "notes", n.id, "versions")).catch(() => null);
    await Promise.all(vs?.docs.map((d) => deleteDoc(d.ref)) ?? []);
  }
  for (const t of TABLES) {
    const s = await getDocs(col(t));
    for (let i = 0; i < s.docs.length; i += 400) {
      const b = writeBatch(db);
      s.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
      await b.commit();
    }
  }
  notes = new Map();
  states = new Map();
}

import JSZip from "jszip";
import { supabase } from "./supabase";
import type { Folder, Note, Summary } from "./types";

const BACKUP_VERSION = 1;
const TABLES = ["folders", "notes", "note_versions", "todos", "sources", "news_items"] as const;
type Table = (typeof TABLES)[number];

async function all(table: Table): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select("*").range(from, from + 999);
    if (table === "news_items") q = q.eq("status", "saved"); // only saved news is worth backing up
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface Backup {
  app: "secondbrain";
  version: number;
  exported_at: string;
  note: string;
  data: Record<Table, Record<string, unknown>[]>;
}

export async function buildBackup(): Promise<Backup> {
  const data = {} as Backup["data"];
  for (const t of TABLES) data[t] = await all(t);
  return {
    app: "secondbrain",
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    note: "Images are referenced by link only; the image files themselves are not inside this backup.",
    data,
  };
}

export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function downloadJsonBackup() {
  const b = await buildBackup();
  const day = b.exported_at.slice(0, 10);
  downloadBlob(new Blob([JSON.stringify(b, null, 1)], { type: "application/json" }), `secondbrain-backup-${day}.json`);
  return b;
}

/** Validates a backup file and upserts every row by id, so restoring twice creates no duplicates. */
export async function restoreBackup(file: File, onProgress?: (msg: string) => void) {
  let b: Backup;
  try {
    b = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not a valid backup (it is not JSON).");
  }
  if (b?.app !== "secondbrain" || typeof b.data !== "object") throw new Error("This file is not a Second Brain backup.");
  if (b.version > BACKUP_VERSION) throw new Error("This backup was made by a newer version of the app.");
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user!.id;
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows: Record<string, unknown>[] = (b.data[t] ?? []).filter((r) => r && typeof r === "object").map((r) => ({ ...r, user_id: uid }));
    if (t !== "sources" && rows.some((r) => typeof r.id !== "string")) throw new Error(`Rows in "${t}" are missing ids; the file may be damaged.`);
    for (let i = 0; i < rows.length; i += 200) {
      onProgress?.(`Restoring ${t} (${Math.min(i + 200, rows.length)}/${rows.length})`);
      const conflict = t === "sources" ? "user_id,key" : t === "news_items" ? "user_id,url" : "id";
      const { error } = await supabase.from(t).upsert(rows.slice(i, i + 200), { onConflict: conflict });
      if (error) throw new Error(`${t}: ${error.message}`);
    }
    counts[t] = rows.length;
  }
  return counts;
}

// ---------- Markdown export ----------
function htmlToMarkdown(html: string): string {
  const d = document.createElement("div");
  d.innerHTML = html;
  const walk = (n: Node, depth = 0): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? "";
    if (!(n instanceof HTMLElement)) return "";
    const inner = () => [...n.childNodes].map((c) => walk(c, depth)).join("");
    switch (n.tagName) {
      case "H1": return `\n# ${inner()}\n\n`;
      case "H2": return `\n## ${inner()}\n\n`;
      case "H3": return `\n### ${inner()}\n\n`;
      case "P": return `${inner()}\n\n`;
      case "BR": return "\n";
      case "STRONG": case "B": return `**${inner()}**`;
      case "EM": case "I": return `*${inner()}*`;
      case "S": return `~~${inner()}~~`;
      case "MARK": return `==${inner()}==`;
      case "CODE": return `\`${inner()}\``;
      case "A": return `[${inner()}](${n.getAttribute("href") ?? ""})`;
      case "IMG": return `![image](${n.getAttribute("src") ?? ""})`;
      case "BLOCKQUOTE": return inner().trim().split("\n").map((l) => `> ${l}`).join("\n") + "\n\n";
      case "UL": case "OL": {
        const ordered = n.tagName === "OL";
        return [...n.children].map((li, i) => {
          const box = li.getAttribute("data-checked");
          const mark = box != null ? `- [${box === "true" ? "x" : " "}] ` : ordered ? `${i + 1}. ` : "- ";
          return `${"  ".repeat(depth)}${mark}${[...li.childNodes].map((c) => walk(c, depth + 1)).join("").trim()}`;
        }).join("\n") + "\n\n";
      }
      default: return inner();
    }
  };
  return walk(d).replace(/\n{3,}/g, "\n\n").trim();
}

function summaryToMarkdown(s: Summary): string {
  const sec = (h: string, xs: string[]) => (xs.length ? `**${h}**\n${xs.map((x) => `- ${x}`).join("\n")}\n\n` : "");
  return `## AI summary (draft, check facts)\n\n${s.in_short}\n\n${sec("What happened", s.what_happened)}${sec("Why it matters", s.why_it_matters)}${sec("Key facts", s.key_facts)}${sec("Mains angle", s.mains_angle)}${sec("Prelims points", s.prelims_points)}${sec("Read further", s.read_further)}`;
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled";
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function downloadMarkdownZip() {
  const b = await buildBackup();
  const folders = new Map((b.data.folders as unknown as Folder[]).map((f) => [f.id, f.name]));
  const zip = new JSZip();
  const used = new Set<string>();
  const index = [["title", "folder", "kind", "source", "source_url", "read_on", "created_at", "updated_at", "in_trash"].join(",")];
  for (const n of b.data.notes as unknown as Note[]) {
    const folder = safeName(n.folder_id ? folders.get(n.folder_id) ?? "Unfiled" : "Unfiled");
    let path = `${n.deleted_at ? "Trash/" : ""}${folder}/${safeName(n.title || "Untitled")}.md`;
    for (let i = 2; used.has(path); i++) path = path.replace(/( \(\d+\))?\.md$/, ` (${i}).md`);
    used.add(path);
    const front = [
      "---",
      `title: ${JSON.stringify(n.title)}`,
      n.source_name ? `source: ${JSON.stringify(n.source_name)}` : "",
      n.source_url ? `source_url: ${n.source_url}` : "",
      `source_published: ${n.source_published_at ?? "unknown"}`,
      `read_on: ${n.read_on}`,
      `created: ${n.created_at}`,
      `updated: ${n.updated_at}`,
      n.ink?.length ? `handwriting_pages: ${n.ink.length} (kept in the JSON backup)` : "",
      "---",
    ].filter(Boolean).join("\n");
    const body = `${front}\n\n# ${n.title || "Untitled"}\n\n${htmlToMarkdown(n.body_html)}\n\n${n.ai_summary ? summaryToMarkdown(n.ai_summary) : ""}`;
    zip.file(path, body);
    index.push([n.title, folder, n.kind, n.source_name, n.source_url, n.read_on, n.created_at, n.updated_at, n.deleted_at ? "yes" : "no"].map(csv).join(","));
  }
  zip.file("index.csv", index.join("\n"));
  zip.file("backup.json", JSON.stringify(b, null, 1));
  zip.file("README.txt", "Notes as Markdown files by folder, an index.csv, and backup.json (use this to restore in Settings). Images are links only.");
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `secondbrain-export-${b.exported_at.slice(0, 10)}.zip`);
}

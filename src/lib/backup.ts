import JSZip from "jszip";
import { exportAll, importAll } from "./api";
import type { Folder, Note } from "./types";
import type { KeyPoints } from "./keypoints";

const BACKUP_VERSION = 2;

export interface Backup {
  app: "secondbrain";
  version: number;
  exported_at: string;
  note: string;
  data: Record<string, Record<string, unknown>[]>;
}

export async function buildBackup(): Promise<Backup> {
  return {
    app: "secondbrain",
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    note: "Notes (with images and handwriting inside them), folders, tasks, news marks and pasted article text. Version history is not included.",
    data: await exportAll(),
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
  downloadBlob(new Blob([JSON.stringify(b)], { type: "application/json" }), `secondbrain-backup-${b.exported_at.slice(0, 10)}.json`);
}

/** Validates a backup and writes every item by its id, so restoring twice creates no duplicates. */
export async function restoreBackup(file: File, onProgress?: (msg: string) => void) {
  let b: Backup;
  try {
    b = JSON.parse(await file.text());
  } catch {
    throw new Error("This file is not a valid backup (it is not JSON).");
  }
  if (b?.app !== "secondbrain" || typeof b.data !== "object") throw new Error("This file is not a Second Brain backup.");
  if (b.version !== BACKUP_VERSION) throw new Error("This backup was made by a different version of the app and can't be restored here.");
  return importAll(b.data, onProgress);
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
      case "IMG": return "[image: kept in the JSON backup]";
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

function keyPointsToMarkdown(k: KeyPoints): string {
  const sec = (h: string, xs: string[]) => (xs.length ? `**${h}**\n${xs.map((x) => `- ${x}`).join("\n")}\n\n` : "");
  return `## Key points (picked from the source text)\n\n${k.lead}\n\n${sec("Key points", k.points)}${sec("Facts and figures", k.facts)}${sec("Mentioned", k.mentions)}`;
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
    zip.file(path, `${front}\n\n# ${n.title || "Untitled"}\n\n${htmlToMarkdown(n.body_html)}\n\n${n.key_points ? keyPointsToMarkdown(n.key_points) : ""}`);
    index.push([n.title, folder, n.kind, n.source_name, n.source_url, n.read_on, n.created_at, n.updated_at, n.deleted_at ? "yes" : "no"].map(csv).join(","));
  }
  zip.file("index.csv", index.join("\n"));
  zip.file("backup.json", JSON.stringify(b));
  zip.file("README.txt", "Notes as Markdown files by folder, an index.csv, and backup.json (restore it in Settings). Images and handwriting are inside backup.json.");
  downloadBlob(await zip.generateAsync({ type: "blob" }), `secondbrain-export-${b.exported_at.slice(0, 10)}.zip`);
}

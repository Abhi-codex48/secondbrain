// PDF export through the browser's own print dialog ("Save as PDF"), which
// keeps text sharp and selectable and needs no extra download. The pages are
// rendered into a print-only area; the app itself is hidden while printing.
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import type { Note, Folder } from "./types";
import type { Page } from "./ink";
import { PageFull } from "../components/Studio";
import { fmtDate } from "./date";

function PrintNote({ n, folder }: { n: Note; folder?: string }) {
  const k = n.key_points;
  return (
    <article className="print-note">
      <h1>{n.title || "Untitled note"}</h1>
      <p className="print-meta">
        {fmtDate(n.created_at)}{folder ? ` · ${folder}` : ""}
        {n.source_url ? <> · <a href={n.source_url}>{n.source_name || n.source_url}</a></> : null}
      </p>
      {n.body_html && <div className="print-body" dangerouslySetInnerHTML={{ __html: n.body_html }} />}
      {k && (
        <section className="print-kp">
          <h2>Key points</h2>
          <p><b>Gist:</b> {k.lead}</p>
          <ul>{k.points.map((x, i) => <li key={i}>{x}</li>)}</ul>
          {k.facts.length > 0 && <><h3>Facts and figures</h3><ul>{k.facts.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
        </section>
      )}
      {(n.ink ?? []).map((p, i) => (
        <figure key={p.id ?? i} className="print-page">
          <PageFull page={p} />
          {(n.ink?.length ?? 0) > 1 && <figcaption>Page {i + 1}</figcaption>}
        </figure>
      ))}
    </article>
  );
}

async function print(node: React.ReactNode, title: string) {
  document.getElementById("print-root")?.remove();
  const host = document.createElement("div");
  host.id = "print-root";
  document.body.appendChild(host);
  const root = createRoot(host);
  flushSync(() => root.render(node));
  // Wait for pictures inside the pages before opening the print dialog.
  await Promise.all([...host.querySelectorAll("img")].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
  const before = document.title;
  document.title = title; // becomes the suggested file name
  const done = () => {
    document.title = before;
    root.unmount();
    host.remove();
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  // Some phones don't send "afterprint"; tidy up once the user is back.
  setTimeout(() => { if (document.getElementById("print-root")) done(); }, 60_000);
}

/** Every page of a handwritten note as a PDF. */
export function exportPagesPdf(pages: Page[], title: string) {
  return print(
    <article className="print-note">
      <h1>{title}</h1>
      {pages.map((p, i) => (
        <figure key={p.id ?? i} className="print-page"><PageFull page={p} /><figcaption>Page {i + 1} of {pages.length}</figcaption></figure>
      ))}
    </article>,
    title,
  );
}

/** A whole folder (or any list of notes) as one PDF, with a contents list. */
export function exportNotesPdf(notes: Note[], title: string, folders: Folder[] = []) {
  const name = (id: string | null) => folders.find((f) => f.id === id)?.name;
  return print(
    <div>
      <section className="print-cover">
        <h1>{title}</h1>
        <p className="print-meta">{notes.length} notes · exported {fmtDate(new Date().toISOString())} from Second Brain</p>
        <ol>{notes.map((n) => <li key={n.id}>{n.title || "Untitled note"}</li>)}</ol>
      </section>
      {notes.map((n) => <PrintNote key={n.id} n={n} folder={name(n.folder_id)} />)}
    </div>,
    title,
  );
}

import { useEffect, useMemo, useState } from "react";
import { NotebookPen, BookmarkCheck, Bookmark as BookmarkIcon, Highlighter, ListTodo, ExternalLink, Trash2 } from "lucide-react";
import { deleteBookmark, listBookmarks, type Bookmark } from "../lib/api";
import { relTime } from "../lib/date";
import { go, type Route } from "../lib/router";
import { Notes } from "./Notes";
import { Todos } from "./More";
import { Highlights, Panel, ReadingList } from "./ReadingTools";
import { Skeleton, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

export type LibTab = "notes" | "articles" | "bookmarks" | "highlights" | "todo";
const TABS: [LibTab, string, React.ComponentType<{ size?: number | string }>][] = [
  ["notes", "Notes", NotebookPen],
  ["articles", "Articles", BookmarkCheck],
  ["bookmarks", "Bookmarks", BookmarkIcon],
  ["highlights", "Highlights", Highlighter],
  ["todo", "To-do", ListTodo],
];

/**
 * Library: everything you keep, in one place and each thing only once:
 * your notes, saved articles, bookmarks from the briefing and Explore,
 * highlights, and your to-do list.
 */
export function Library({ route }: { route: Route }) {
  const tab: LibTab = route.path[0] === "notes" ? "notes" : ((route.query.get("t") as LibTab) || "notes");
  const label = TABS.find(([k]) => k === tab)?.[1] ?? "Library";
  useEffect(() => setTitle(label), [label]);
  const pick = (t: LibTab) => go(t === "notes" ? "notes" : `library?t=${t}`);
  return (
    <div className="page" style={{ ["--c1" as string]: "var(--notes-1)" }}>
      <div className="lib-head">
        <span className="kicker">Library</span>
        <nav className="lib-tabs" role="tablist" aria-label="Library">
          {TABS.map(([k, name, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => pick(k)}><Icon size={16} />{name}</button>
          ))}
        </nav>
      </div>
      {tab === "notes" && <Notes route={route} />}
      {tab === "articles" && <ReadingList />}
      {tab === "bookmarks" && <Bookmarks />}
      {tab === "highlights" && <Highlights />}
      {tab === "todo" && <Todos />}
    </div>
  );
}

function Bookmarks() {
  const [items, setItems] = useState<Bookmark[] | null>(null);
  const toast = useToast();
  useEffect(() => { listBookmarks().then(setItems).catch(() => setItems([])); }, []);
  const groups = useMemo(() => {
    const m = new Map<string, Bookmark[]>();
    for (const b of items ?? []) m.set(b.kind, [...(m.get(b.kind) ?? []), b]);
    return [...m.entries()];
  }, [items]);
  if (items === null) return <Panel icon={<BookmarkIcon size={18} />} title="Bookmarks" color="var(--more-1)"><Skeleton lines={3} /></Panel>;
  if (!items.length) {
    return (
      <Panel icon={<BookmarkIcon size={18} />} title="Bookmarks" color="var(--more-1)">
        <p className="tiny">Tap the bookmark on any story in the World briefing or any item in Explore (books, long reads, science and more). They are kept here, grouped by kind.</p>
      </Panel>
    );
  }
  return (
    <div className="rtools">
      {groups.map(([kind, list]) => (
        <Panel key={kind} icon={<BookmarkIcon size={18} />} title={kind} color="var(--more-1)" extra={<span className="tiny">{list.length}</span>}>
          <ul className="rlist">
            {list.map((b) => (
              <li key={b.id} className="rrow">
                <a href={b.url || undefined} target="_blank" rel="noopener noreferrer">
                  <span className="t">{b.title}</span>
                  {b.text && <span className="bk-text">{b.text}</span>}
                  <span className="tiny">{b.source} · saved {relTime(b.created_at)} <ExternalLink size={11} /></span>
                </a>
                <button className="icon-btn sm" aria-label={`Remove bookmark "${b.title}"`} title="Remove" onClick={async () => {
                  setItems((xs) => xs?.filter((x) => x.id !== b.id) ?? null);
                  await deleteBookmark(b.id).catch(() => {});
                  toast("Bookmark removed");
                }}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { Home, Newspaper, FolderOpen, LayoutGrid, Search, Settings, PenLine, Plus } from "lucide-react";
import { go, type Route } from "../lib/router";
import { DrawOverlay } from "./DrawOverlay";

const NAV = [
  { id: "", label: "Home", icon: Home, c1: "var(--accent)", soft: "var(--accent-soft)" },
  { id: "news", label: "News", icon: Newspaper, c1: "var(--news-2)", soft: "var(--news-soft)" },
  { id: "notes", label: "Notes", icon: FolderOpen, c1: "var(--notes-1)", soft: "var(--notes-soft)" },
  { id: "more", label: "More", icon: LayoutGrid, c1: "var(--more-1)", soft: "var(--more-soft)" },
];

const section = (r: Route) => {
  const p = r.path[0] ?? "";
  if (p === "read") return "news";
  if (p === "note") return "notes";
  return p;
};

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const [pen, setPen] = useState(false);
  const [q, setQ] = useState("");
  const cur = section(route);
  // The "+ Note" button is hidden where the page already has its own note area.
  const onEditor = route.path[0] === "note" || route.path[0] === "read";
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="#/" style={{ textDecoration: "none", color: "inherit" }}>
            <img src="./icon.svg" alt="" />
            <span>Second Brain</span>
          </a>
          <nav className="topnav" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.id} href={`#/${n.id}`} className={cur === n.id ? "on" : ""}>{n.label}</a>
            ))}
          </nav>
          <form
            className="top-search searchbox"
            style={{ minHeight: 42 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) go(`search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything" aria-label="Search" />
          </form>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => setPen(true)} aria-label="Pen mode" title="Pen mode: draw over the screen"><PenLine size={20} /></button>
            <a className={`icon-btn ${cur === "settings" ? "on" : ""}`} href="#/settings" aria-label="Settings"><Settings size={20} /></a>
          </div>
        </div>
      </header>

      <main className="main">{children}</main>

      <div className="fab-stack">
        {!pen && (
          <button className="fab pen" onClick={() => setPen(true)} aria-label="Pen mode: draw over the screen" title="Pen mode">
            <PenLine size={22} />
          </button>
        )}
        {!onEditor && !pen && (
          <button className="fab" onClick={() => go("note/new")} aria-label="New note">
            <Plus size={22} />
            <span>Note</span>
          </button>
        )}
      </div>

      <nav className="bottomnav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.id} href={`#/${n.id}`} className={cur === n.id ? "on" : ""} style={{ ["--c1" as string]: n.c1, ["--soft" as string]: n.soft }}>
            <n.icon size={22} />
            {n.label}
          </a>
        ))}
      </nav>

      {pen && <DrawOverlay onClose={() => setPen(false)} context={{ title: document.title.replace(/ · Second Brain$/, "") || "Second Brain", href: window.location.hash || "#/" }} />}
    </div>
  );
}

export function setTitle(t: string) {
  document.title = t ? `${t} · Second Brain` : "Second Brain";
}

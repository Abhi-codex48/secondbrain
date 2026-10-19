import { useEffect, useRef, useState, type ReactNode } from "react";
import { Home, Newspaper, TrendingUp, Library as LibraryIcon, LayoutGrid, Search, Settings, PenLine, Plus, X } from "lucide-react";
import { go, replace, type Route } from "../lib/router";
import { DrawOverlay } from "./DrawOverlay";

const NAV = [
  { id: "", label: "Home", icon: Home, c1: "var(--accent)", soft: "var(--accent-soft)" },
  { id: "news", label: "News", icon: Newspaper, c1: "var(--news-2)", soft: "var(--news-soft)" },
  { id: "markets", label: "Markets", icon: TrendingUp, c1: "var(--ok)", soft: "var(--ok-soft)" },
  { id: "notes", label: "Library", icon: LibraryIcon, c1: "var(--notes-1)", soft: "var(--notes-soft)" },
  { id: "more", label: "More", icon: LayoutGrid, c1: "var(--more-1)", soft: "var(--more-soft)" },
];

const section = (r: Route) => {
  const p = r.path[0] ?? "";
  if (p === "read") return "news";
  if (p === "note" || p === "library") return "notes";
  return p;
};

/** Tapping the tab or logo of the page you're already on scrolls back to the top. */
const toTop = (e: React.MouseEvent<HTMLAnchorElement>) => {
  const target = e.currentTarget.getAttribute("href") ?? "";
  const here = window.location.hash || "#/";
  if (target === here || (target === "#/" && here === "#")) {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
};

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const [pen, setPen] = useState(false);
  // Live search: results update a moment after you stop typing.
  const onSearch = route.path[0] === "search";
  const [q, setQ] = useState(() => (onSearch ? route.query.get("q") ?? "" : ""));
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => { if (!onSearch) setQ(""); }, [onSearch]);
  const type = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const t = v.trim();
      const path = t ? `search?q=${encodeURIComponent(t)}` : "search";
      if (window.location.hash.startsWith("#/search")) replace(path);
      else if (t) go(path);
    }, 300);
  };
  const cur = section(route);
  // The "+ Note" button is hidden where the page already has its own note area.
  const onEditor = route.path[0] === "note" || route.path[0] === "read";
  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-in">
          <a className="brand" href="#/" onClick={toTop} style={{ textDecoration: "none", color: "inherit" }}>
            <img src="./icon.svg" alt="" />
            <span>Second Brain</span>
          </a>
          <nav className="topnav" aria-label="Main">
            {NAV.map((n) => (
              <a key={n.id} href={`#/${n.id}`} onClick={toTop} className={cur === n.id ? "on" : ""}>{n.label}</a>
            ))}
          </nav>
          <form
            className="top-search searchbox"
            style={{ minHeight: 42 }}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              (document.activeElement as HTMLElement | null)?.blur(); // closes the phone keyboard
            }}
          >
            <Search size={18} />
            <input value={q} onChange={(e) => type(e.target.value)} placeholder="Search everything" aria-label="Search" type="search" enterKeyHint="search" />
            {q && <button type="button" className="icon-btn sm" onClick={() => type("")} aria-label="Clear search"><X size={16} /></button>}
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
          <a key={n.id} href={`#/${n.id}`} onClick={toTop} className={cur === n.id ? "on" : ""} style={{ ["--c1" as string]: n.c1, ["--soft" as string]: n.soft }}>
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

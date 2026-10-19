import { useEffect, useRef, useState, type ReactNode } from "react";
import { Home, Newspaper, TrendingUp, Library as LibraryIcon, LayoutGrid, Search, PenLine, Plus, X, Sun, Moon, BookOpen } from "lucide-react";
import { go, replace, type Route } from "../lib/router";
import { applyTheme, currentTheme, type Mode } from "../lib/theme";
import { auth } from "../lib/firebase";
import { getName, initials } from "../lib/profile";
import { NamePrompt } from "./NamePrompt";
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
  // The New note button steps aside while you scroll down, and comes back on scroll up.
  const [fabHidden, setFabHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setFabHidden(y > last && y > 120);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
            <ThemeButton />
            <button className="icon-btn" onClick={() => setPen(true)} aria-label="Pen mode" title="Pen mode: draw over the screen"><PenLine size={20} /></button>
            <Avatar on={cur === "settings"} />
          </div>
        </div>
      </header>

      <main className="main">{children}</main>

      {!onEditor && !pen && (
        <div className={`fab-stack${fabHidden ? " away" : ""}`}>
          <button className="fab" onClick={() => go("note/new")} aria-label="New note" title="New note">
            <Plus size={24} />
          </button>
        </div>
      )}

      <nav className="bottomnav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.id} href={`#/${n.id}`} onClick={toTop} className={cur === n.id ? "on" : ""} style={{ ["--c1" as string]: n.c1, ["--soft" as string]: n.soft }}>
            <n.icon size={22} />
            {n.label}
          </a>
        ))}
      </nav>

      <NamePrompt />
      {pen && <DrawOverlay onClose={() => setPen(false)} context={{ title: document.title.replace(/ · Second Brain$/, "") || "Second Brain", href: window.location.hash || "#/" }} />}
    </div>
  );
}

const MODES: { m: Mode; label: string; Icon: typeof Sun }[] = [
  { m: "light", label: "Light", Icon: Sun },
  { m: "reading", label: "Reading (warm, easy on the eyes)", Icon: BookOpen },
  { m: "dark", label: "Dark", Icon: Moon },
];
/** One tap cycles Light → Reading → Dark. */
function ThemeButton() {
  const [mode, setMode] = useState<Mode>(() => currentTheme().mode);
  useEffect(() => {
    const upd = () => setMode(currentTheme().mode);
    window.addEventListener("sb-theme", upd);
    return () => window.removeEventListener("sb-theme", upd);
  }, []);
  const i = Math.max(0, MODES.findIndex((x) => x.m === mode));
  const { Icon, label } = MODES[i];
  const next = MODES[(i + 1) % MODES.length];
  return (
    <button className="icon-btn" onClick={() => setMode(applyTheme(undefined, next.m).mode)} aria-label={`Theme: ${label}. Switch to ${next.label}`} title={`Theme: ${label} (tap for ${next.label.split(" ")[0]})`}>
      <Icon size={20} />
    </button>
  );
}

/** Your picture or initials; opens Settings (profile, appearance, data). */
function Avatar({ on }: { on: boolean }) {
  const [name, setNameState] = useState(getName);
  useEffect(() => {
    const upd = () => setNameState(getName());
    window.addEventListener("sb-name", upd);
    return () => window.removeEventListener("sb-name", upd);
  }, []);
  const u = auth.currentUser;
  return (
    <a className={`avatar-btn ${on ? "on" : ""}`} href="#/settings" aria-label="Profile and settings" title="Profile and settings">
      {u?.photoURL ? <img src={u.photoURL} alt="" referrerPolicy="no-referrer" /> : <span>{initials(name, u?.email ?? "")}</span>}
    </a>
  );
}

export function setTitle(t: string) {
  document.title = t ? `${t} · Second Brain` : "Second Brain";
}

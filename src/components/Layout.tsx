import { flushSync } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Home, Newspaper, TrendingUp, Library as LibraryIcon, LayoutGrid, Search, PenLine, NotebookPen, Plus, Check, X, Sun, Moon, BookOpen } from "lucide-react";
import { go, replace, type Route } from "../lib/router";
import { applyTheme, currentTheme, PALETTES, type Mode, type PaletteId } from "../lib/theme";
import { auth } from "../lib/firebase";
import { getName, initials } from "../lib/profile";
import { SiteFooter } from "./SiteFooter";
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
  const [dial, setDial] = useState(false);
  useEffect(() => setDial(false), [route.path[0]]);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setFabHidden(y > last && y > 120);
      if (y > last) setDial(false);
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
  const onNote = route.path[0] === "note";
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
            <Avatar on={cur === "settings"} />
          </div>
        </div>
      </header>

      <main className="main">{children}<SiteFooter /></main>

      {!onNote && !pen && (
        <>
          {dial && <div className="dial-scrim" onClick={() => setDial(false)} />}
          <div className={`fab-stack${fabHidden && !dial ? " away" : ""}${dial ? " open" : ""}`}>
            {dial && (
              <div className="dial" role="menu">
                <button role="menuitem" className="dial-item" onClick={() => { setDial(false); setPen(true); }}>
                  <span>Highlight / draw on screen</span><i className="pen"><PenLine size={19} /></i>
                </button>
                <button role="menuitem" className="dial-item" onClick={() => { setDial(false); go("note/new"); }}>
                  <span>New note</span><i><NotebookPen size={19} /></i>
                </button>
              </div>
            )}
            <button className="fab" onClick={() => setDial((d) => !d)} aria-label={dial ? "Close" : "Create"} aria-expanded={dial} title="Highlight or new note">
              <Plus size={24} />
            </button>
          </div>
        </>
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
  { m: "reading", label: "Reading", Icon: BookOpen },
  { m: "dark", label: "Dark", Icon: Moon },
];
/** Switches the theme with a circle that spreads from where you tapped. */
function revealTheme(e: React.MouseEvent, palette: PaletteId, mode: Mode) {
  const root = document.documentElement;
  const d = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!d.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { applyTheme(palette, mode); return; }
  const x = e.clientX || innerWidth - 40, y = e.clientY || 30;
  root.style.setProperty("--tx", `${x}px`);
  root.style.setProperty("--ty", `${y}px`);
  root.style.setProperty("--tr", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  root.classList.add("theme-vt");
  d.startViewTransition(() => flushSync(() => applyTheme(palette, mode))).finished.finally(() => root.classList.remove("theme-vt"));
}

/** Tap to pick Light, Reading or Dark, and a colour style. */
function ThemeButton() {
  const [{ mode, palette }, setTheme] = useState(currentTheme);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const upd = () => setTheme(currentTheme());
    window.addEventListener("sb-theme", upd);
    return () => window.removeEventListener("sb-theme", upd);
  }, []);
  const i = Math.max(0, MODES.findIndex((x) => x.m === mode));
  const { Icon, label } = MODES[i];
  return (
    <div className="theme-pick">
      <button className={`icon-btn${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-label={`Theme: ${label}`} aria-expanded={open} title="Theme">
        <Icon key={mode} size={20} className="theme-ic" />
      </button>
      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <div className="theme-panel" role="dialog" aria-label="Theme">
            <div className="tp-head"><b>Theme</b><span>{PALETTES.find((p) => p.id === palette)?.name} · {label}</span></div>
            <div className="mode-seg" role="radiogroup" aria-label="Mode" style={{ ["--i" as string]: i }}>
              <i className="mode-thumb" />
              {MODES.map(({ m, label: l, Icon: I }) => (
                <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={(e) => mode !== m && revealTheme(e, palette, m)}>
                  <I size={18} /><span>{l}</span>
                </button>
              ))}
            </div>
            <div className="orbs" role="radiogroup" aria-label="Colours">
              {PALETTES.map((p) => (
                <button key={p.id} role="radio" aria-checked={palette === p.id} aria-label={p.name} title={p.name} className={palette === p.id ? "on" : ""} onClick={(e) => palette !== p.id && revealTheme(e, p.id, mode)} style={{ background: `conic-gradient(from 210deg, ${p.swatch[0]} 0 33%, ${p.swatch[1]} 0 66%, ${p.swatch[2]} 0)` }}>
                  {palette === p.id && <Check size={16} strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
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

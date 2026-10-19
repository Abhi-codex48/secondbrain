import { useEffect } from "react";
import {
  LogIn, Home, Newspaper, NotebookPen, PenLine, Highlighter, LayoutGrid, Search, Settings, ShieldCheck, Globe2, Compass, FileDown, WifiOff, TrendingUp, Library as LibraryIcon, Share2, type LucideIcon,
} from "lucide-react";
import { setTitle } from "../components/Layout";

interface Part { icon: LucideIcon; color: string; title: string; lead: string; steps: string[] }

export const GUIDE: Part[] = [
  {
    icon: LogIn, color: "var(--accent)", title: "Getting started",
    lead: "Sign in once; your space is private to your Google account.",
    steps: [
      "Tap Continue with Google. The first time, tell us what to call you, and Home greets you by name.",
      "Add it to your phone like an app: Chrome menu ⋮ → Add to Home screen, or Safari Share → Add to Home Screen.",
      "Your notes sync across phone, tablet and laptop, and work offline.",
    ],
  },
  {
    icon: Home, color: "var(--news-1)", title: "Home",
    lead: "Three doors (News, Markets, Library), quick buttons, and things worth reading today.",
    steps: [
      "Quick buttons: New note, Write by hand, To-do, How it works.",
      "Tap the logo or the Home tab again to jump back to the top of any page.",
      "Top bar: the theme button picks Light, Reading (warm, easy on the eyes) or Dark, and a colour style; your picture opens Settings. The + button at the bottom: Highlight / draw on screen, or New note.",
    ],
  },
  {
    icon: Globe2, color: "var(--notes-1)", title: "World briefing",
    lead: "Today's big world stories, explained, on the Home screen.",
    steps: [
      "Top stories with plain background on each one.",
      "World events by type: wars and conflicts, economy and markets, politics, science, disasters. Each links to the outlet it cites (Reuters, AP, BBC…).",
      "Trending: what the world is reading. On this day: events from history.",
      "Tap the bookmark on any item to keep it in Library → Bookmarks.",
    ],
  },
  {
    icon: Compass, color: "var(--more-1)", title: "Explore",
    lead: "Small boxes for reading beyond the news, India and the world. Updated every hour.",
    steps: [
      "Reading: long reads, books, science, economy explained, history and stories, ideas, environment, word of the day.",
      "India: government decisions, courts, Parliament and laws, states and cities, RBI.",
      "World: United Nations, global health, global economy, diplomacy and summits, a country to know.",
      "Tap the bookmark next to any item (a book, a long read, a court ruling…) to keep it in Library → Bookmarks.",
    ],
  },
  {
    icon: Newspaper, color: "var(--news-2)", title: "News",
    lead: "Every section of 13 newspapers and PIB, collected every hour.",
    steps: [
      "Section chips (India, World, Business, Opinion, Sports…) filter exactly; paper chips show one newspaper.",
      "By date: go back day by day or pick any date in the last 90 days, and search that day's headlines.",
      "Open a headline: the full article loads with its key points. Short gives the gist; Detailed adds more points, figures and a condensed article.",
      "Copy puts the key points on your clipboard; Add to note puts them in your own note; Save to notes keeps everything.",
      "Paste any web link at the top to read and take notes on it.",
      "If a paper blocks reading in the app, open the original and paste the text instead.",
    ],
  },
  {
    icon: TrendingUp, color: "var(--ok)", title: "Markets",
    lead: "Stock markets in India and the world, commodities, currencies and Bitcoin. Updated every hour.",
    steps: [
      "Each card shows the price and the day's change, green for up and red for down.",
      "Why it moved: today's headlines from the newspapers that mention that market. Tap one to read it.",
      "Prices are delayed (Yahoo Finance, Stooq). For reading, not investment advice.",
    ],
  },
  {
    icon: LibraryIcon, color: "var(--notes-1)", title: "Library",
    lead: "Everything you keep, in one place and each thing only once.",
    steps: [
      "Notes: your own writing and handwriting, in folders.",
      "Articles: headlines you bookmarked, marked when readable offline. Remove any with the bin icon.",
      "Bookmarks: what you saved from the World briefing and Explore, grouped by kind.",
      "Highlights: passages you highlighted while reading. To-do: your task list.",
    ],
  },
  {
    icon: NotebookPen, color: "var(--notes-1)", title: "Writing notes",
    lead: "Notes work like folders on a computer.",
    steps: [
      "Folders with colours; filters for kind, source and date; live search.",
      "Writing: bold, five highlight colours, text colours, headings, lists, checklists, quotes, links, images.",
      "Voice typing with the microphone button. Pick key points from any long note.",
      "Version history (clock icon) and Trash keep you safe from mistakes.",
    ],
  },
  {
    icon: PenLine, color: "var(--news-1)", title: "Handwriting",
    lead: "A full drawing studio, like Notability.",
    steps: [
      "Pens: ballpoint, fountain, pencil, highlighter; eraser for part of a stroke or a whole stroke.",
      "Hold the pen still at the end of a line, box or circle to straighten it. Shapes, text and tables from the + menu.",
      "Lasso to move, resize, recolour or delete. Pinch with two fingers to zoom.",
      "Many pages per note: use the page bar to go back and forth or add a New page.",
    ],
  },
  {
    icon: Highlighter, color: "var(--more-2)", title: "Pen mode",
    lead: "Write and highlight on any screen of the app.",
    steps: [
      "Tap the + button at the bottom right → Highlight / draw on screen. Draw with one finger; scroll with two fingers (or the hand button).",
      "Nothing is saved until you press Save; then the part of the page with your marks becomes a note.",
    ],
  },
  {
    icon: FileDown, color: "var(--notes-2)", title: "Export as PDF",
    lead: "Keep or share your work.",
    steps: [
      "Library → Notes → Export PDF saves the folder (or what you've filtered) as one file with a contents page.",
      "In a note, the download icon exports that note; in the drawing studio, it exports every page.",
      "Choose Save as PDF in the print screen that opens.",
    ],
  },
  {
    icon: Share2, color: "var(--news-2)", title: "Sharing",
    lead: "Send a note, an article's key points or a passage as a link.",
    steps: [
      "Tap Share in a note or an article, or select a passage and tap Share passage. The link opens right at the shared part.",
      "Choose how long the link works (1 hour to 30 days, custom, or no expiry). After that it stops opening.",
      "Turn off any link early in Settings → Shared links. Only what you share is visible, nothing else in your account.",
      "Share into Second Brain: add it to your phone's Home screen first, then pick Second Brain from any app's Share menu and choose where to keep it.",
    ],
  },
  {
    icon: LayoutGrid, color: "var(--more-1)", title: "More",
    lead: "What you studied today, anything on any date, and your progress.",
    steps: [
      "Today and By date: look back at any day's notes, news and finished tasks.",
      "Progress: your reading streak, a 5-question daily quiz from the World briefing, and topics you follow (their headlines also show as chips on News).",
      "While reading an article, select text to Highlight it or Define a word.",
    ],
  },
  {
    icon: Search, color: "var(--accent)", title: "Search",
    lead: "The bar at the top searches everything.",
    steps: [
      "Results appear as you type: your notes, news and Wikipedia at once, with a one-tap Google search.",
      "Tap ✕ in the bar to clear it.",
    ],
  },
  {
    icon: Settings, color: "var(--ink-2)", title: "Settings",
    lead: "Tap your picture at the top. Everything is grouped, tap a row to open it.",
    steps: [
      "Profile: change the name you're greeted by.",
      "Content: news sources and your shared links.",
      "Download a backup or Markdown copy, restore a backup, free up space.",
      "Delete all your data or your whole account at any time.",
    ],
  },
  {
    icon: WifiOff, color: "var(--ok)", title: "Offline",
    lead: "Keeps working without internet.",
    steps: ["Notes save on your device first and sync when you're back online. The last news list stays readable offline."],
  },
  {
    icon: ShieldCheck, color: "var(--ok)", title: "Privacy",
    lead: "Only you can read your notes.",
    steps: ["Each account's data is locked to its owner. No ads, no AI reading your notes, no selling of data."],
  },
];

/** A short tour of everything the app does, from signing in to each feature. */
export function GuideList() {
  return (
    <div className="guide">
      {GUIDE.map((g, i) => (
        <details key={g.title} className="gpart" open={i < 2} style={{ ["--g" as string]: g.color }}>
          <summary>
            <span className="gic"><g.icon size={19} /></span>
            <span className="gt"><b>{g.title}</b><span>{g.lead}</span></span>
          </summary>
          <ul>{g.steps.map((s) => <li key={s}>{s}</li>)}</ul>
        </details>
      ))}
    </div>
  );
}

export function Guide() {
  useEffect(() => setTitle("How it works"), []);
  return (
    <div className="page">
      <div className="stack" style={{ gap: 4 }}>
        <span className="kicker" style={{ color: "var(--accent)" }}>Guide</span>
        <h1>How it works</h1>
        <p className="muted">Everything Second Brain can do, in a few lines each. Tap a section to open it.</p>
      </div>
      <GuideList />
    </div>
  );
}

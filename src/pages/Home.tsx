import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, LayoutGrid, ListTodo, Newspaper, PenLine, Plus } from "lucide-react";
import { homeCounts } from "../lib/api";
import { fmtLong } from "../lib/date";
import { setTitle } from "../components/Layout";
import { KnowledgeBox } from "../components/KnowledgeBox";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const [c, setC] = useState<{ news: number; notes: number; todos: number } | null>(null);
  useEffect(() => {
    setTitle("");
    homeCounts().then(setC).catch(() => setC(null));
  }, []);
  return (
    <div className="page" style={{ gap: 24 }}>
      <div className="hero">
        <span className="date">{fmtLong()}</span>
        <h1>{greeting()}. <span className="wave">What are you reading today?</span></h1>
      </div>

      <nav className="quick" aria-label="Quick actions">
        <a href="#/note/new" style={{ ["--q" as string]: "var(--notes-1)" }}><Plus size={18} />New note</a>
        <a href="#/draw/new/new" style={{ ["--q" as string]: "var(--news-1)" }}><PenLine size={18} />Write by hand</a>
        <a href="#/more?t=todo" style={{ ["--q" as string]: "var(--more-1)" }}><ListTodo size={18} />To-do</a>
      </nav>

      <div className="tiles">
        <a className="tile t-news" href="#/news">
          <span className="ic"><Newspaper size={26} /></span>
          <div className="head"><h2>News</h2>{c && <span className="count">{c.news} today</span>}</div>
          <p>Every section of 13 newspapers and PIB, updated hourly. Full articles, key points, and any past date.</p>
          <span className="go" aria-hidden="true"><ArrowRight size={19} /></span>
        </a>
        <a className="tile t-notes" href="#/notes">
          <span className="ic"><FolderOpen size={26} /></span>
          <div className="head"><h2>Notes</h2>{c && <span className="count">{c.notes} notes</span>}</div>
          <p>Your private folders. Type, highlight, or write by hand like on paper.</p>
          <span className="go" aria-hidden="true"><ArrowRight size={19} /></span>
        </a>
        <a className="tile t-more" href="#/more">
          <span className="ic"><LayoutGrid size={26} /></span>
          <div className="head"><h2>More</h2>{c && <span className="count">{c.todos} to-do</span>}</div>
          <p>To-do list, what you studied today, and anything you recorded on any date.</p>
          <span className="go" aria-hidden="true"><ArrowRight size={19} /></span>
        </a>
      </div>
      <KnowledgeBox />
    </div>
  );
}

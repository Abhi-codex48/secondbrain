import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, LayoutGrid, Newspaper, Search } from "lucide-react";
import { homeCounts } from "../lib/api";
import { fmtLong } from "../lib/date";
import { go } from "../lib/router";
import { setTitle } from "../components/Layout";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function Home() {
  const [c, setC] = useState<{ news: number; notes: number; todos: number } | null>(null);
  const [q, setQ] = useState("");
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

      <div className="tiles">
        <a className="tile t-news" href="#/news">
          {c && <span className="count">{c.news} today</span>}
          <span className="ic"><Newspaper size={26} /></span>
          <h2>News</h2>
          <p>Today's headlines from ten major newspapers and PIB, updated every hour. Bookmark what matters and keep notes on it.</p>
          <span className="go">Open News <ArrowRight size={18} /></span>
        </a>
        <a className="tile t-notes" href="#/notes">
          {c && <span className="count">{c.notes} notes</span>}
          <span className="ic"><FolderOpen size={26} /></span>
          <h2>Notes</h2>
          <p>Your private space in folders. Type, highlight, or write and draw by hand like on paper. Search and filter everything.</p>
          <span className="go">Open Notes <ArrowRight size={18} /></span>
        </a>
        <a className="tile t-more" href="#/more">
          {c && <span className="count">{c.todos} to-do</span>}
          <span className="ic"><LayoutGrid size={26} /></span>
          <h2>More</h2>
          <p>To-do list, what you studied today, and everything you recorded on any date.</p>
          <span className="go">Open More <ArrowRight size={18} /></span>
        </a>
      </div>

      <form
        className="searchbox"
        style={{ minHeight: 54, borderRadius: 18 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(`search?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <Search size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your notes, news, Wikipedia and Google" aria-label="Search everything" />
        <button className="btn primary sm" type="submit">Search</button>
      </form>
    </div>
  );
}

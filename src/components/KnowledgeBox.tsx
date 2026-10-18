import { useEffect, useState } from "react";
import { BookmarkPlus, ChevronDown, ExternalLink, Lightbulb, Check } from "lucide-react";
import { saveNote } from "../lib/api";
import { fmtLong } from "../lib/date";
import { errMsg, useToast } from "./ui";

interface Card { subject: string; title: string; text: string; url: string; image: string | null; simple: boolean }
interface Knowledge { day: string; cards: Card[]; events: { year: number; text: string; url: string | null }[] }

const COLORS: Record<string, string> = {
  "AI": "#7c4dff", "Technology": "#2f6bff", "Money & Economy": "#18a058", "Geography": "#0aa5a5", "World": "#e0384f",
  "India": "#ff7a45", "Science & Space": "#5b5bd6", "Environment": "#3f9d3f", "History & Culture": "#b5703a",
};
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Today's "Know more" box: short, plain-English explainers from Wikipedia on a
 * different set of subjects each day, plus events from this day in history.
 */
export function KnowledgeBox() {
  const [k, setK] = useState<Knowledge | null>(null);
  const [all, setAll] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const toast = useToast();

  useEffect(() => {
    fetch("./knowledge.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(setK).catch(() => setK(null));
  }, []);
  if (!k || !k.cards.length) return null;

  const save = (c: Card) => {
    try {
      saveNote({
        title: c.title,
        body_html: `<p>${esc(c.text)}</p><p>Source: <a href="${esc(c.url)}">${c.simple ? "Simple English Wikipedia" : "Wikipedia"}</a></p>`,
        source_url: c.url,
        source_name: "Wikipedia",
      });
      setSaved((s) => new Set(s).add(c.url));
      toast("Saved to your notes");
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };

  const cards = all ? k.cards : k.cards.slice(0, 4);
  return (
    <section className="kbox" aria-labelledby="kbox-h">
      <header className="kbox-head">
        <span className="kbox-ic"><Lightbulb size={20} /></span>
        <div>
          <h2 id="kbox-h">Know more today</h2>
          <span className="tiny">{fmtLong(k.day ? new Date(`${k.day}T12:00:00+05:30`) : undefined)} · from Wikipedia, in simple English</span>
        </div>
      </header>
      <table className="ktable">
        <thead><tr><th scope="col">Subject</th><th scope="col">What to know</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {cards.map((c) => (
            <tr key={c.url} style={{ ["--k" as string]: COLORS[c.subject] ?? "var(--accent)" }}>
              <th scope="row"><span className="ksub">{c.subject}</span></th>
              <td>
                <div className="kbody">
                  {c.image && <img src={c.image} alt="" loading="lazy" />}
                  <div>
                    <b>{c.title}</b>
                    <p>{c.text}</p>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="ksrc">{c.simple ? "Simple English Wikipedia" : "Wikipedia"} <ExternalLink size={12} /></a>
                  </div>
                </div>
              </td>
              <td className="kact">
                <button className="icon-btn sm" onClick={() => save(c)} disabled={saved.has(c.url)} aria-label={`Save ${c.title} to notes`} title="Save to notes">
                  {saved.has(c.url) ? <Check size={18} color="var(--ok)" /> : <BookmarkPlus size={18} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {k.cards.length > 4 && (
        <button className="nmore" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Show less" : `Show all ${k.cards.length} subjects`} <ChevronDown size={16} style={{ transform: all ? "rotate(180deg)" : undefined }} />
        </button>
      )}
      {k.events.length > 0 && (
        <div className="kday">
          <h3>On this day</h3>
          <ul>
            {k.events.slice(0, all ? 5 : 3).map((e) => (
              <li key={`${e.year}${e.text.slice(0, 20)}`}>
                <span className="kyear">{e.year}</span>
                <span>{e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.text}</a> : e.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

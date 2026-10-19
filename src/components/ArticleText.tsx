import { useEffect, useMemo, useRef, useState } from "react";
import { Highlighter, BookA, X, ExternalLink, Loader2 } from "lucide-react";
import { addHighlight, listHighlights, type Highlight } from "../lib/api";
import type { NewsItem } from "../lib/types";
import { errMsg, useToast } from "./ui";

interface Sense { part: string; defs: string[] }

const strip = (h: string) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();

/** Meanings from Wiktionary (Wikimedia's free dictionary). */
async function define(word: string): Promise<Sense[]> {
  const r = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word.toLowerCase())}`);
  if (!r.ok) throw new Error("No meaning found");
  const j = await r.json();
  return (j.en ?? []).slice(0, 3).map((s: { partOfSpeech: string; definitions: { definition: string }[] }) => ({
    part: s.partOfSpeech,
    defs: s.definitions.map((d) => strip(d.definition)).filter(Boolean).slice(0, 2),
  })).filter((s: Sense) => s.defs.length);
}

/**
 * The article's text, with your highlights marked. Select any passage to
 * highlight it (collected under Library → Highlights) or look up a word.
 */
export function ArticleText({ item }: { item: NewsItem }) {
  const box = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState("");
  const [marks, setMarks] = useState<Highlight[]>([]);
  const [word, setWord] = useState<{ w: string; senses: Sense[] | null; err?: string } | null>(null);
  const toast = useToast();

  useEffect(() => { listHighlights().then((h) => setMarks(h.filter((x) => x.news_id === item.id))).catch(() => {}); }, [item.id]);
  useEffect(() => {
    const on = () => {
      const s = window.getSelection();
      const t = s?.toString().replace(/\s+/g, " ").trim() ?? "";
      const inside = !!s?.anchorNode && !!box.current?.contains(s.anchorNode);
      setSel(inside && t.length > 1 ? t.slice(0, 1200) : "");
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, []);

  const paras = useMemo(() => (item.article_text ?? "").split(/\n{2,}/).filter(Boolean), [item.article_text]);
  const render = (p: string) => {
    const hits = marks.map((m) => m.text).filter((t) => t.length > 1 && p.includes(t));
    if (!hits.length) return p;
    const re = new RegExp(`(${hits.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return p.split(re).map((part, i) => (hits.includes(part) ? <mark key={i}>{part}</mark> : part));
  };

  const highlight = async () => {
    try {
      const h = await addHighlight({ text: sel, news_id: item.id, title: item.title, url: item.url, source: item.source_name });
      setMarks((m) => [h, ...m]);
      window.getSelection()?.removeAllRanges();
      setSel("");
      toast("Highlighted. Find it in Library → Highlights.");
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };
  const lookUp = async () => {
    const w = sel.replace(/[^\p{L}\p{N}' -]/gu, "").trim();
    window.getSelection()?.removeAllRanges();
    setSel("");
    setWord({ w, senses: null });
    try {
      setWord({ w, senses: await define(w) });
    } catch (e) {
      setWord({ w, senses: [], err: errMsg(e) });
    }
  };
  const oneWord = sel && sel.split(" ").length <= 3 && sel.length <= 40;

  return (
    <>
      <div className="article-text" ref={box}>
        {paras.map((p, i) => <p key={i}>{render(p)}</p>)}
      </div>
      <p className="tiny">Tip: select any passage to highlight it or look up a word.</p>
      {sel && (
        <div className="selbar" role="toolbar" aria-label="Selected text">
          <button className="btn soft sm" onMouseDown={(e) => e.preventDefault()} onClick={highlight}><Highlighter size={16} />Highlight</button>
          {oneWord && <button className="btn soft sm" onMouseDown={(e) => e.preventDefault()} onClick={lookUp}><BookA size={16} />Define</button>}
          <button className="icon-btn sm" onClick={() => { window.getSelection()?.removeAllRanges(); setSel(""); }} aria-label="Cancel"><X size={16} /></button>
        </div>
      )}
      {word && (
        <>
          <div className="scrim" onClick={() => setWord(null)} />
          <div className="sheet" role="dialog" aria-label={`Meaning of ${word.w}`}>
            <div className="between"><h2>{word.w}</h2><button className="icon-btn" onClick={() => setWord(null)} aria-label="Close"><X size={20} /></button></div>
            {word.senses === null ? <p className="row muted"><Loader2 size={16} className="spin" />Looking it up…</p> : word.senses.length === 0 ? <p className="muted">{word.err ?? "No meaning found."}</p> : (
              <div className="defs">
                {word.senses.map((s) => (
                  <div key={s.part}><span className="tag">{s.part}</span><ol>{s.defs.map((d) => <li key={d}>{d}</li>)}</ol></div>
                ))}
              </div>
            )}
            <a className="ksrc" href={`https://en.wiktionary.org/wiki/${encodeURIComponent(word.w.toLowerCase())}`} target="_blank" rel="noopener noreferrer">Wiktionary <ExternalLink size={12} /></a>
          </div>
        </>
      )}
    </>
  );
}

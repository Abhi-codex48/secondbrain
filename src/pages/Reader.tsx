import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, ListChecks, ClipboardPaste, AlertTriangle, Save, FileText, CheckCircle2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { fetchFullText } from "../lib/fulltext";
import { findNoteForNews, getNews, listFolders, savePastedText, saveNote, setNewsStatus } from "../lib/api";
import type { Folder, NewsItem } from "../lib/types";
import { keyPoints, keyPointsToHtml } from "../lib/keypoints";
import { fmtDate, fmtTime } from "../lib/date";
import { back, go } from "../lib/router";
import { RichEditor } from "../components/RichEditor";
import { KeyPointsView } from "../components/KeyPointsView";
import { errMsg, Skeleton, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";
import { LEVEL, srcColor } from "./News";

type Len = "short" | "detailed";

export function Reader({ id }: { id: string }) {
  const [item, setItem] = useState<NewsItem | null>(null);
  const [len, setLen] = useState<Len>("short");
  const [pasted, setPasted] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState("");
  const [showText, setShowText] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [mine, setMine] = useState("");
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const toast = useToast();
  const started = useRef(false);

  const loadFull = async (it: NewsItem) => {
    setLoading(true);
    setLoadErr("");
    try {
      const text = await fetchFullText(it.url);
      setItem(await savePastedText(it, text));
      setShowText(true);
    } catch (e) {
      setLoadErr(errMsg(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const [it, fs, existing] = await Promise.all([getNews(id), listFolders(), findNoteForNews(id)]);
        setTitle(it.title);
        setItem(it);
        setFolders(fs);
        setSaved(existing);
        const guess = fs.find((f) => it.topics.some((t) => f.name.toLowerCase().includes(t.toLowerCase().split(" ")[0])));
        setFolderId(guess?.id ?? "");
        if (it.status === "new") setNewsStatus(it.id, "read").catch(() => {});
        if (!it.article_text && /^https?:/.test(it.url)) loadFull(it);
      } catch (e) {
        toast(errMsg(e), { bad: true });
      }
    })();
  }, [id, toast]);

  // Key points are worked out on this device from the article text: instant, free, no AI.
  const points = useMemo(
    () => (item?.article_text ? keyPoints(item.article_text, { title: item.title, detailed: len === "detailed", basedOn: pasted ? "pasted" : item.content_level === "full" ? "full" : "excerpt" }) : null),
    [item?.article_text, item?.title, item?.content_level, len, pasted],
  );

  const submitPaste = async () => {
    if (!item) return;
    if (paste.trim().length < 200) return toast("Paste at least a few paragraphs of the article", { bad: true });
    try {
      setItem(await savePastedText(item, paste.trim()));
      setPasted(true);
      setPasting(false);
      setPaste("");
    } catch (e) {
      toast(errMsg(e), { bad: true });
    }
  };

  const save = async () => {
    if (!item) return;
    setSaving(true);
    try {
      const { note: n } = saveNote({
        kind: "article",
        title: item.title,
        body_html: mine,
        key_points: points,
        source_url: item.url,
        source_name: item.source_name,
        source_published_at: item.published_at,
        news_item_id: item.id,
        folder_id: folderId || null,
      });
      await setNewsStatus(item.id, "saved").catch(() => {});
      setSaved({ id: n.id });
      toast("Saved to your notes", { action: { label: "Open", run: () => go(`note/${n.id}`) } });
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setSaving(false);
    }
  };

  if (!item) return <div className="page"><div className="card"><Skeleton lines={5} /></div></div>;

  const noText = !item.article_text;
  return (
    <div className="page">
      <div className="row">
        <button className="btn soft sm" onClick={back}><ArrowLeft size={17} />Back</button>
        <span className="grow" />
        <a className="btn line sm" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Original</a>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row tiny">
          <b style={{ color: srcColor(item.source_key) }}>{item.source_name}</b>
          <span>·</span>
          <span>{item.published_at ? `Published ${fmtDate(item.published_at)}, ${fmtTime(item.published_at)}` : "Publication date not given by the source"}</span>
          <span className={`tag ${item.content_level}`}>{LEVEL[item.content_level]}</span>
          {item.topics.map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
        <h1>{item.title}</h1>
        {item.description && <p className="muted">{item.description}</p>}
      </div>

      <div className="reader">
        <div className="stack">
          {noText && loading && (
            <div className="alert info">
              <Loader2 size={20} className="spin" color="var(--accent)" />
              <div><b>Loading the full article…</b><p className="muted">This takes a few seconds.</p></div>
            </div>
          )}

          {noText && !loading && !pasting && (
            <div className="alert info">
              <ExternalLink size={20} color="var(--accent)" />
              <div className="stack" style={{ gap: 10 }}>
                <div>
                  <b>{loadErr ? "Couldn't load the full article" : "Read it on the newspaper's site"}</b>
                  {loadErr && <p className="muted">{loadErr}</p>}
                  <p className="muted">You can open the article, copy its text and paste it here to get the key points, facts and figures, and the laws and bodies it mentions.</p>
                </div>
                <div className="row">
                  {loadErr && <button className="btn soft sm" onClick={() => loadFull(item)}><RefreshCw size={16} />Try again</button>}
                  <a className="btn primary sm" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open article</a>
                  <button className="btn soft sm" onClick={() => setPasting(true)}><ClipboardPaste size={16} />Paste article text</button>
                </div>
              </div>
            </div>
          )}

          {pasting && (
            <div className="layer src">
              <h3>Paste the article text</h3>
              <p className="tiny">Copy the text from the newspaper site or e-paper and paste it here. It is stored privately and key points are picked from it.</p>
              <textarea className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste here…" autoFocus style={{ minHeight: 180 }} />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn soft" onClick={() => setPasting(false)}>Cancel</button>
                <button className="btn primary" onClick={submitPaste}><ListChecks size={16} />Get key points</button>
              </div>
            </div>
          )}

          {!noText && (
            <div className="seg" style={{ maxWidth: 340 }}>
              <button className={len === "short" ? "on" : ""} onClick={() => setLen("short")}>Short</button>
              <button className={len === "detailed" ? "on" : ""} onClick={() => setLen("detailed")}>Detailed</button>
            </div>
          )}

          {item.article_text && !points && (
            <div className="alert info"><AlertTriangle size={20} /><p>The text is too short to pick key points from. Read it below.</p></div>
          )}

          {points && (
            <KeyPointsView
              k={points}
              actions={<button className="btn soft sm" onClick={() => setMine((m) => `${m}${keyPointsToHtml(points)}`)} title="Copy the key points into your note">Copy to note</button>}
            />
          )}

          {item.article_text && (
            <div className="layer src">
              <button className="between" style={{ width: "100%", minHeight: 44 }} onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
                <span className="row"><FileText size={18} /><b>Full article</b><span className="tiny">{Math.round(item.article_text.length / 5.5 / 200) || 1} min read</span></span>
                {showText ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {showText && <div className="article-text">{item.article_text}</div>}
            </div>
          )}
        </div>

        <aside className="side stack">
          <div className="layer mine">
            <div className="between"><span className="tag mine">My note</span><span className="tiny">Your own words</span></div>
            <RichEditor html={mine} onChange={setMine} compact placeholder="What did you understand? (optional)" />
          </div>
          <div className="card stack">
            <label className="tiny" htmlFor="rfolder">Folder</label>
            <select id="rfolder" className="select" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">No folder</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {saved ? (
              <div className="row">
                <span className="row" style={{ color: "var(--ok)", fontWeight: 800 }}><CheckCircle2 size={18} />Saved</span>
                <span className="grow" />
                <button className="btn soft sm" onClick={() => go(`note/${saved.id}`)}>Open note</button>
                <button className="btn line sm" onClick={save} disabled={saving}>Save again</button>
              </div>
            ) : (
              <button className="btn grad block" style={{ ["--c1" as string]: "var(--notes-1)", ["--c2" as string]: "var(--notes-2)" }} onClick={save} disabled={saving}>
                {saving ? <Loader2 size={17} className="spin" /> : <Save size={17} />}Save to notes
              </button>
            )}
            <p className="tiny">Saves the link, dates, the key points and your note together.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

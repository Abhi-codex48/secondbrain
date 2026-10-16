import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Sparkles, ClipboardPaste, AlertTriangle, Save, FileText, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { fetchArticle, findNoteForNews, getNews, listFolders, saveNote, setNewsStatus, summarise } from "../lib/api";
import type { Folder, NewsItem, Summary } from "../lib/types";
import { fmtDate, fmtTime } from "../lib/date";
import { back, go } from "../lib/router";
import { RichEditor } from "../components/RichEditor";
import { SummaryView, summaryToHtml } from "../components/SummaryView";
import { errMsg, Skeleton, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";
import { LEVEL, srcColor } from "./News";

type Len = "short" | "detailed";

export function Reader({ id }: { id: string }) {
  const [item, setItem] = useState<NewsItem | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [len, setLen] = useState<Len>("short");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sumErr, setSumErr] = useState<{ msg: string; code?: string } | null>(null);
  const [summing, setSumming] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState("");
  const [showText, setShowText] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [mine, setMine] = useState("");
  const [saved, setSaved] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const started = useRef(false);

  const runSummary = useCallback(async (it: NewsItem, l: Len, opts: { regenerate?: boolean; text?: string } = {}) => {
    const cached = it.summaries?.[l];
    if (cached && !opts.regenerate && !opts.text) {
      setSummary(cached);
      return;
    }
    setSumming(true);
    setSumErr(null);
    try {
      const r = await summarise({ newsId: it.id, length: l, regenerate: opts.regenerate, text: opts.text });
      setSummary(r.summary);
      setItem((x) => (x ? { ...x, summaries: { ...(opts.text ? {} : x.summaries), [l]: r.summary }, ...(opts.text ? { article_text: opts.text, content_level: "full" as const } : {}) } : x));
    } catch (e) {
      setSumErr({ msg: errMsg(e), code: (e as { code?: string }).code });
    } finally {
      setSumming(false);
    }
  }, []);

  const loadText = useCallback(async (it: NewsItem, refetch = false) => {
    setFetching(true);
    setFailure(null);
    try {
      const r = await fetchArticle({ newsId: it.id, refetch });
      setItem(r.item);
      if (r.failure) setFailure(r.failure);
      if (r.item.article_text) runSummary(r.item, "short");
    } catch (e) {
      setFailure(errMsg(e));
    } finally {
      setFetching(false);
    }
  }, [runSummary]);

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
        if (it.article_text) runSummary(it, "short");
        else loadText(it);
      } catch (e) {
        toast(errMsg(e), { bad: true });
      }
    })();
  }, [id, loadText, runSummary, toast]);

  const switchLen = (l: Len) => {
    setLen(l);
    if (item?.article_text) runSummary(item, l);
  };

  const submitPaste = async () => {
    if (!item) return;
    if (paste.trim().length < 200) return toast("Paste at least a few paragraphs of the article", { bad: true });
    setPasting(false);
    setFailure(null);
    await runSummary(item, len, { text: paste.trim() });
    setPaste("");
  };

  const save = async () => {
    if (!item) return;
    setSaving(true);
    try {
      const n = await saveNote({
        kind: "article",
        title: item.title,
        body_html: mine,
        ai_summary: summary ?? item.summaries?.short ?? item.summaries?.detailed ?? null,
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
          {fetching && (
            <div className="layer ai"><span className="tag ai"><Loader2 size={13} className="spin" />Reading the article…</span><Skeleton lines={3} /></div>
          )}

          {!fetching && noText && (
            <div className="alert warn">
              <AlertTriangle size={20} color="var(--warn)" />
              <div className="stack" style={{ gap: 10 }}>
                <div>
                  <b>Only the headline is available</b>
                  <p className="muted">{failure ?? "The article text could not be read."} No summary is made from a headline alone.</p>
                </div>
                <div className="row">
                  <a className="btn soft sm" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open original</a>
                  <button className="btn soft sm" onClick={() => setPasting(true)}><ClipboardPaste size={16} />Paste article text</button>
                  <button className="btn soft sm" onClick={() => loadText(item, true)}><RefreshCw size={16} />Try again</button>
                </div>
              </div>
            </div>
          )}

          {pasting && (
            <div className="layer src">
              <h3>Paste the article text</h3>
              <p className="tiny">Copy the text from the newspaper site or e-paper and paste it here. It is stored privately and summarised.</p>
              <textarea className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste here…" autoFocus style={{ minHeight: 180 }} />
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button className="btn soft" onClick={() => setPasting(false)}>Cancel</button>
                <button className="btn primary" onClick={submitPaste}><Sparkles size={16} />Summarise</button>
              </div>
            </div>
          )}

          {!noText && (
            <div className="seg" style={{ maxWidth: 340 }}>
              <button className={len === "short" ? "on" : ""} onClick={() => switchLen("short")}>Short</button>
              <button className={len === "detailed" ? "on" : ""} onClick={() => switchLen("detailed")}>Detailed</button>
            </div>
          )}

          {summing && <div className="layer ai"><span className="tag ai"><Sparkles size={13} />Summarising in simple English…</span><Skeleton lines={4} /></div>}

          {!summing && sumErr && (
            <div className={`alert ${sumErr.code === "not_configured" ? "info" : "warn"}`}>
              <AlertTriangle size={20} />
              <div className="stack" style={{ gap: 8 }}>
                <p>{sumErr.msg}</p>
                {item.article_text && <button className="btn soft sm" style={{ alignSelf: "flex-start" }} onClick={() => runSummary(item, len, { regenerate: true })}><RefreshCw size={16} />Try again</button>}
              </div>
            </div>
          )}

          {!summing && summary && (
            <SummaryView
              s={summary}
              actions={
                <>
                  <button className="btn soft sm" onClick={() => setMine((m) => `${m}${summaryToHtml(summary)}`)} title="Copy the summary into your note">Copy to note</button>
                  <button className="icon-btn sm" onClick={() => runSummary(item, len, { regenerate: true })} aria-label="Make a new summary" title="Make a new summary"><RefreshCw size={17} /></button>
                </>
              }
            />
          )}

          {item.article_text && (
            <div className="layer src">
              <button className="between" style={{ width: "100%", minHeight: 44 }} onClick={() => setShowText((v) => !v)} aria-expanded={showText}>
                <span className="row"><FileText size={18} /><b>Article text</b><span className="tiny">{Math.round(item.article_text.length / 5.5 / 200) || 1} min read</span></span>
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
            <p className="tiny">Saves the link, dates, the AI summary and your note together.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

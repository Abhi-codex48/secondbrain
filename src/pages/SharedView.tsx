import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Clock, Link2Off, Loader2 } from "lucide-react";
import { getShare, type Share } from "../lib/api";
import { fmtDate, fmtTime } from "../lib/date";
import type { Page } from "../lib/ink";

const PageFull = lazy(() => import("../components/Studio").then((m) => ({ default: m.PageFull })));

/** Only plain formatting survives: shared content is shown to people who didn't write it. */
function clean(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const ok = new Set(["P", "BR", "B", "STRONG", "I", "EM", "U", "S", "MARK", "H1", "H2", "H3", "H4", "UL", "OL", "LI", "BLOCKQUOTE", "A", "CODE", "PRE", "IMG", "SPAN", "DIV", "LABEL", "INPUT"]);
  const walk = (el: Element) => {
    for (const c of [...el.children]) {
      if (!ok.has(c.tagName)) { c.replaceWith(...[...c.childNodes]); continue; }
      for (const a of [...c.attributes]) {
        const keep = (c.tagName === "A" && a.name === "href" && /^https?:/i.test(a.value))
          || (c.tagName === "IMG" && a.name === "src" && /^(https?:|data:image\/)/i.test(a.value))
          || (c.tagName === "INPUT" && (a.name === "type" || a.name === "checked") && (a.name !== "type" || a.value === "checkbox"))
          || (a.name === "data-color" && c.tagName === "MARK");
        if (!keep) c.removeAttribute(a.name);
      }
      if (c.tagName === "A") { c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener noreferrer nofollow"); }
      if (c.tagName === "INPUT") c.setAttribute("disabled", "");
      walk(c);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/**
 * A shared item, opened from a link. Works without signing in, until the
 * link's expiry. Scrolls straight to the shared passage when there is one.
 */
export function SharedView({ id }: { id: string }) {
  const [s, setS] = useState<(Share & { ink: unknown }) | null | undefined>(undefined);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { getShare(id).then(setS); }, [id]);
  useEffect(() => { document.title = s?.title ? `${s.title} · Second Brain` : "Shared · Second Brain"; }, [s]);

  // Mark the shared passage and bring it into view.
  useEffect(() => {
    if (!s?.focus || !body.current) return;
    const mark = body.current.querySelector("mark.focus");
    setTimeout(() => mark?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
  }, [s]);

  const paras = useMemo(() => (s?.text ?? "").split(/\n{2,}/).filter(Boolean), [s?.text]);
  const withFocus = (p: string) => {
    const f = s?.focus;
    if (!f || !p.includes(f)) return p;
    const [a, ...rest] = p.split(f);
    return <>{a}<mark className="focus">{f}</mark>{rest.join(f)}</>;
  };

  if (s === undefined) return <div className="shared"><p className="row muted"><Loader2 size={18} className="spin" />Opening…</p></div>;
  if (s === null) {
    return (
      <div className="shared">
        <div className="card empty"><Link2Off size={32} /><b>This link has expired or was removed</b><span className="tiny">Ask the person who shared it for a new link.</span></div>
        <a className="btn line" href="#/">Open Second Brain</a>
      </div>
    );
  }
  const focusInText = !!s.focus && paras.some((p) => p.includes(s.focus!));
  return (
    <div className="shared">
      <header className="shared-top">
        <a className="brand" href="#/" style={{ textDecoration: "none", color: "inherit" }}><img src="./icon.svg" alt="" /><span>Second Brain</span></a>
        <span className="tiny row" style={{ gap: 4 }}><Clock size={13} />{s.expires_at ? `Link works until ${fmtDate(s.expires_at)}, ${fmtTime(s.expires_at)}` : "Shared link"}</span>
      </header>
      <article className="shared-card" ref={body}>
        <span className="kicker">Shared with you</span>
        <h1>{s.title}</h1>
        {(s.source || s.url) && (
          <p className="tiny">{s.source}{s.url && <> · <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">Open original <ExternalLink size={11} /></a></>}</p>
        )}
        {s.focus && !focusInText && <blockquote className="shared-focus"><mark className="focus">{s.focus}</mark></blockquote>}
        {s.html && <div className="prose shared-body" dangerouslySetInnerHTML={{ __html: clean(s.html) }} />}
        {paras.length > 0 && <div className="article-text">{paras.map((p, i) => <p key={i}>{withFocus(p)}</p>)}</div>}
        {Array.isArray(s.ink) && (s.ink as Page[]).length > 0 && (
          <Suspense fallback={null}>
            {(s.ink as Page[]).map((p, i) => <div key={i} className="shared-ink"><PageFull page={p} /></div>)}
          </Suspense>
        )}
      </article>
      <p className="tiny" style={{ textAlign: "center" }}>Shared from Second Brain · created {fmtDate(s.created_at)}</p>
    </div>
  );
}

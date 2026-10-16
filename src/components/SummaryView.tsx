import { Sparkles } from "lucide-react";
import type { Summary } from "../lib/types";
import { fmtDate } from "../lib/date";

const BASED: Record<Summary["based_on"], string> = {
  full: "from the full article",
  excerpt: "from a partial article",
  pasted: "from text you pasted",
  note: "from your note",
};

export function SummaryView({ s, actions }: { s: Summary; actions?: React.ReactNode }) {
  const sec = (title: string, xs: string[], i: number) =>
    xs.length > 0 && (
      <section style={{ animationDelay: `${i * 60}ms` }}>
        <h4>{title}</h4>
        <ul>{xs.map((x, k) => <li key={k}>{x}</li>)}</ul>
      </section>
    );
  return (
    <div className="layer ai sum">
      <div className="between">
        <span className="tag ai"><Sparkles size={13} />AI summary {BASED[s.based_on]}</span>
        <div className="row">{actions}</div>
      </div>
      {s.in_short && <p className="lead">{s.in_short}</p>}
      {sec("What happened", s.what_happened, 0)}
      {sec("Why it matters", s.why_it_matters, 1)}
      {sec("Key facts (from the text)", s.key_facts, 2)}
      {s.upsc_papers.length > 0 && (
        <section style={{ animationDelay: "180ms" }}>
          <h4>UPSC relevance</h4>
          <div className="chips wrap">{s.upsc_papers.map((p) => <span key={p} className="tag">{p}</span>)}</div>
        </section>
      )}
      {sec("Mains angle", s.mains_angle, 4)}
      {sec("Prelims points", s.prelims_points, 5)}
      {sec("Read further", s.read_further, 6)}
      <p className="tiny">AI draft · may contain mistakes, check facts before relying on them{s.provider ? ` · ${s.provider}` : ""}{s.created_at ? ` · ${fmtDate(s.created_at)}` : ""}</p>
    </div>
  );
}

export function summaryToHtml(s: Summary): string {
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sec = (h: string, xs: string[]) => (xs.length ? `<p><strong>${h}</strong></p><ul>${xs.map((x) => `<li><p>${esc(x)}</p></li>`).join("")}</ul>` : "");
  return `<p><strong>In short:</strong> ${esc(s.in_short)}</p>${sec("Why it matters", s.why_it_matters)}${sec("Key facts", s.key_facts)}${sec("Mains angle", s.mains_angle)}`;
}

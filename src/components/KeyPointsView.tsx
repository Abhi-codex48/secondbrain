import { ListChecks } from "lucide-react";
import type { KeyPoints } from "../lib/keypoints";

const BASED: Record<KeyPoints["based_on"], string> = {
  full: "from the full article",
  excerpt: "from a partial article",
  pasted: "from text you pasted",
  note: "from your note",
};

export function KeyPointsView({ k, actions }: { k: KeyPoints; actions?: React.ReactNode }) {
  const sec = (title: string, xs: string[], i: number) =>
    xs.length > 0 && (
      <section style={{ animationDelay: `${i * 60}ms` }}>
        <h4>{title}</h4>
        <ul>{xs.map((x, n) => <li key={n}>{x}</li>)}</ul>
      </section>
    );
  const chips = (title: string, xs: string[], i: number) =>
    xs.length > 0 && (
      <section style={{ animationDelay: `${i * 60}ms` }}>
        <h4>{title}</h4>
        <div className="chips wrap">{xs.map((x) => <span key={x} className="tag">{x}</span>)}</div>
      </section>
    );
  return (
    <div className="layer ai sum">
      <div className="between">
        <span className="tag ai"><ListChecks size={13} />Key points {BASED[k.based_on]}</span>
        <div className="row">{actions}</div>
      </div>
      <p className="lead">{k.lead}</p>
      {sec("Key points", k.points, 0)}
      {sec("Facts and figures", k.facts, 1)}
      {k.summary && k.summary.length > 0 && (
        <section className="condensed">
          <h4>Condensed article</h4>
          {k.summary.map((x, n) => <p key={n}>{x}</p>)}
        </section>
      )}
      {chips("Laws, bodies and schemes mentioned", k.mentions, 2)}
      {chips("Key terms", k.terms, 3)}
      {chips("Topics", k.topics, 4)}
      <p className="tiny">Sentences picked from the text as written, nothing reworded. Check figures before relying on them.</p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Trash2, Plus, ListTodo, BookOpenCheck, CalendarSearch, NotebookPen, Newspaper, CheckCircle2, CalendarDays } from "lucide-react";
import { activityBetween, addTodo, deleteTodo, listTodos, setTodoDone } from "../lib/api";
import type { Todo } from "../lib/types";
import { addDays, fmtDate, fmtTime, istDay } from "../lib/date";
import { go, type Route } from "../lib/router";
import { errMsg, Skeleton, useToast } from "../components/ui";
import { setTitle } from "../components/Layout";

type Tab = "todo" | "today" | "date";

export function More({ route }: { route: Route }) {
  const tab = (route.query.get("t") as Tab) || "todo";
  useEffect(() => setTitle(tab === "todo" ? "To-do" : tab === "today" ? "Studied today" : "By date"), [tab]);
  return (
    <div className="page" style={{ ["--c1" as string]: "var(--more-1)" }}>
      <div className="stack" style={{ gap: 4 }}>
        <span className="kicker" style={{ fontWeight: 800, fontSize: ".8rem", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--more-1)" }}>More</span>
        <h1>{tab === "todo" ? "To-do" : tab === "today" ? "What I studied today" : "Search by date"}</h1>
      </div>
      <div className="seg" role="tablist" style={{ maxWidth: 560 }}>
        <button className={tab === "todo" ? "on" : ""} onClick={() => go("more?t=todo")} role="tab" aria-selected={tab === "todo"}><ListTodo size={17} />To-do</button>
        <button className={tab === "today" ? "on" : ""} onClick={() => go("more?t=today")} role="tab" aria-selected={tab === "today"}><BookOpenCheck size={17} />Today</button>
        <button className={tab === "date" ? "on" : ""} onClick={() => go("more?t=date")} role="tab" aria-selected={tab === "date"}><CalendarSearch size={17} />By date</button>
      </div>
      {tab === "todo" && <Todos />}
      {tab === "today" && <Activity fixed={istDay()} />}
      {tab === "date" && <ByDate />}
    </div>
  );
}

function Todos() {
  const [items, setItems] = useState<Todo[] | null>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [showDone, setShowDone] = useState(false);
  const toast = useToast();
  const load = useCallback(() => listTodos().then(setItems).catch((e) => { toast(errMsg(e), { bad: true }); setItems([]); }), [toast]);
  useEffect(() => { load(); }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const t = await addTodo(text, due || null);
      setItems((xs) => [t, ...(xs ?? [])]);
      setText("");
      setDue("");
    } catch (err) {
      toast(errMsg(err), { bad: true });
    }
  };
  const toggle = async (t: Todo) => {
    setItems((xs) => xs?.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)) ?? null);
    try {
      await setTodoDone(t.id, !t.done);
    } catch (e) {
      toast(errMsg(e), { bad: true });
      load();
    }
  };
  const remove = async (t: Todo) => {
    setItems((xs) => xs?.filter((x) => x.id !== t.id) ?? null);
    try {
      await deleteTodo(t.id);
      toast("Task deleted", { undo: async () => { await addTodo(t.text, t.due_on); load(); } });
    } catch (e) {
      toast(errMsg(e), { bad: true });
      load();
    }
  };

  const open = items?.filter((t) => !t.done) ?? [];
  const done = items?.filter((t) => t.done) ?? [];
  const today = istDay();
  const row = (t: Todo, i: number) => (
    <div key={t.id} className={`todo-item ${t.done ? "done" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
      <button className={`check ${t.done ? "on" : ""}`} onClick={() => toggle(t)} aria-label={t.done ? "Mark not done" : "Mark done"} aria-pressed={t.done}><Check size={15} strokeWidth={3} /></button>
      <span className="t">{t.text}</span>
      {t.due_on && (
        <span className="tag" style={!t.done && t.due_on < today ? { background: "var(--bad-soft)", color: "var(--bad)" } : t.due_on === today ? { background: "var(--more-soft)", color: "var(--more-1)" } : undefined}>
          <CalendarDays size={12} />{t.due_on === today ? "Today" : fmtDate(t.due_on, { day: "numeric", month: "short" })}
        </span>
      )}
      <button className="icon-btn sm" onClick={() => remove(t)} aria-label="Delete task"><Trash2 size={17} /></button>
    </div>
  );

  return (
    <div className="card pad-lg stack">
      <form className="row" onSubmit={add}>
        <input className="input grow" style={{ flex: "1 1 220px" }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task, e.g. Revise Article 356" aria-label="New task" maxLength={500} />
        <input type="date" className="input" style={{ width: "auto", flex: "0 1 170px" }} value={due} min={today} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" title="Due date (optional)" />
        <button className="btn grad" style={{ ["--c1" as string]: "var(--more-1)", ["--c2" as string]: "var(--more-2)" }} disabled={!text.trim()}><Plus size={18} />Add</button>
      </form>
      {items === null ? <Skeleton /> : open.length === 0 && done.length === 0 ? (
        <div className="empty"><ListTodo size={32} /><span>No tasks yet.</span></div>
      ) : (
        <div>
          {open.map(row)}
          {open.length === 0 && <p className="muted" style={{ padding: "12px 0" }}>All done.</p>}
          {done.length > 0 && (
            <>
              <button className="btn soft sm" style={{ marginTop: 12 }} onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide" : "Show"} completed ({done.length})</button>
              {showDone && done.map(row)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type ActivityData = Awaited<ReturnType<typeof activityBetween>>;

function Activity({ fixed, from, to }: { fixed?: string; from?: string; to?: string }) {
  const f = fixed ?? from!, t = fixed ?? to!;
  const [data, setData] = useState<ActivityData | null>(null);
  const toast = useToast();
  useEffect(() => {
    setData(null);
    activityBetween(f, t).then(setData).catch((e) => { toast(errMsg(e), { bad: true }); setData({ notes: [], news: [], todos: [] }); });
  }, [f, t, toast]);

  const days = useMemo(() => {
    if (!data) return [];
    type Item = { key: string; at: string; kind: "note" | "news" | "todo"; title: string; sub: string; href?: string };
    const items: Item[] = [
      ...data.notes.map((n) => ({ key: `n${n.id}`, at: n.updated_at, kind: "note" as const, title: n.title || "Untitled", sub: `${n.kind === "article" ? "Saved article" : n.kind === "ink" ? "Handwriting" : "Note"}${n.source_name ? ` · ${n.source_name}` : ""}${n.ai_summary ? " · AI summary" : ""}`, href: `#/note/${n.id}` })),
      ...data.news.map((n) => ({ key: `r${n.id}`, at: n.read_at!, kind: "news" as const, title: n.title, sub: `Read · ${n.source_name}`, href: `#/read/${n.id}` })),
      ...data.todos.map((x) => ({ key: `t${x.id}`, at: x.done_at!, kind: "todo" as const, title: x.text, sub: "Task done" })),
    ].filter((x) => !!x.at).sort((a, b) => b.at.localeCompare(a.at));
    const by = new Map<string, Item[]>();
    for (const it of items) {
      const d = istDay(it.at);
      if (d < f || d > t) continue;
      by.set(d, [...(by.get(d) ?? []), it]);
    }
    return [...by.entries()];
  }, [data, f, t]);

  if (!data) return <div className="card"><Skeleton lines={5} /></div>;
  const total = days.reduce((a, [, xs]) => a + xs.length, 0);
  return (
    <div className="stack">
      <div className="row">
        <span className="tag" style={{ background: "var(--notes-soft)", color: "var(--notes-1)" }}><NotebookPen size={12} />{data.notes.length} notes</span>
        <span className="tag" style={{ background: "var(--news-soft)", color: "var(--news-2)" }}><Newspaper size={12} />{data.news.length} articles read</span>
        <span className="tag" style={{ background: "var(--more-soft)", color: "var(--more-1)" }}><CheckCircle2 size={12} />{data.todos.length} tasks done</span>
      </div>
      {total === 0 ? (
        <div className="card empty">
          <BookOpenCheck size={32} />
          <b>Nothing recorded {fixed ? "today yet" : "in this period"}</b>
          {fixed && <button className="btn primary" onClick={() => go("note/new")}>Write today's note</button>}
        </div>
      ) : (
        <div className="card pad-lg stack" style={{ gap: 16 }}>
          {days.map(([d, xs]) => (
            <div key={d} className="log-day">
              {!fixed && <h3>{fmtDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h3>}
              {xs.map((it) => {
                const Icon = it.kind === "note" ? NotebookPen : it.kind === "news" ? Newspaper : CheckCircle2;
                const inner = (
                  <>
                    <span className={`ic ${it.kind}`}><Icon size={17} /></span>
                    <span className="grow stack" style={{ gap: 2 }}>
                      <b style={{ overflowWrap: "anywhere" }}>{it.title}</b>
                      <span className="tiny">{it.sub}</span>
                    </span>
                    <span className="tiny" style={{ whiteSpace: "nowrap" }}>{fmtTime(it.at)}</span>
                  </>
                );
                return it.href ? <a key={it.key} href={it.href} className="log-item">{inner}</a> : <div key={it.key} className="log-item">{inner}</div>;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ByDate() {
  const today = istDay();
  const [from, setFrom] = useState(addDays(today, -6));
  const [to, setTo] = useState(today);
  const quick: [string, string, string][] = [
    ["Today", today, today],
    ["Yesterday", addDays(today, -1), addDays(today, -1)],
    ["Last 7 days", addDays(today, -6), today],
    ["Last 30 days", addDays(today, -29), today],
  ];
  return (
    <div className="stack">
      <div className="card stack">
        <div className="chips wrap">
          {quick.map(([l, a, b]) => (
            <button key={l} className={`chip ${from === a && to === b ? "on" : ""}`} style={{ ["--c1" as string]: "var(--more-1)" }} onClick={() => { setFrom(a); setTo(b); }}>{l}</button>
          ))}
        </div>
        <div className="row">
          <label className="row tiny grow" style={{ flex: "1 1 160px" }}>From<input type="date" className="input" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
          <label className="row tiny grow" style={{ flex: "1 1 160px" }}>To<input type="date" className="input" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
        </div>
      </div>
      <Activity from={from} to={to} />
    </div>
  );
}

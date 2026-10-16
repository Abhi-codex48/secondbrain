import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getStroke } from "perfect-freehand";
import { Eraser, Hand, Highlighter, Image as ImageIcon, Minus, PenLine, Plus, Redo2, Trash2, Undo2, Grid3x3, Rows3, Square, PenTool } from "lucide-react";
import type { InkPage, Stroke } from "../lib/types";

export const INK_W = 1000; // logical width; drawings scale to any screen
export const PEN_COLORS = ["#1b1530", "#e0384f", "#2f6bff", "#18a058", "#7c4dff", "#ff7a45"];
export const HL_COLORS = ["#ffe14d", "#7ef0a0", "#ff9ccc", "#8fd3ff", "#ffb870"];
const SIZES = [3, 5, 8, 14];

export type Tool = "pen" | "highlighter" | "eraser" | "hand";

function pathFromStroke(s: Stroke): string {
  const hl = s.tool === "highlighter";
  const pts = getStroke(s.points, {
    size: hl ? s.size * 3.2 : s.size,
    thinning: hl ? 0 : 0.55,
    smoothing: 0.55,
    streamline: 0.45,
    simulatePressure: s.points.every((p) => p[2] === 0.5),
    last: true,
    start: { cap: true },
    end: { cap: true },
  });
  if (!pts.length) return "";
  const d = pts.reduce<(string | number)[]>(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0.toFixed(1), y0.toFixed(1), ((x0 + x1) / 2).toFixed(1), ((y0 + y1) / 2).toFixed(1));
      return acc;
    },
    ["M", ...pts[0].map((n) => n.toFixed(1)), "Q"],
  );
  return `${d.join(" ")} Z`;
}

function StrokePath({ s }: { s: Stroke }) {
  const d = useMemo(() => pathFromStroke(s), [s]);
  return <path d={d} fill={s.color} fillOpacity={s.tool === "highlighter" ? 0.38 : 1} style={s.tool === "highlighter" ? { mixBlendMode: "multiply" } : undefined} />;
}

/** Distance from point p to segment ab. */
function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function hits(s: Stroke, x: number, y: number, r: number) {
  const pad = r + s.size * (s.tool === "highlighter" ? 1.6 : 0.6);
  const p = s.points;
  if (p.length === 1) return Math.hypot(p[0][0] - x, p[0][1] - y) < pad;
  for (let i = 1; i < p.length; i++) if (distSeg(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) < pad) return true;
  return false;
}

export interface InkState {
  tool: Tool;
  color: string;
  hlColor: string;
  size: number;
  penOnly: boolean;
}

/**
 * Drawing surface. Coordinates are stored in a 1000-unit-wide space so a page
 * drawn on a phone looks the same on a laptop.
 */
export function InkLayer({
  strokes, onCommit, height, state, onPenSeen, onNearBottom, className, svgRef,
}: {
  strokes: Stroke[];
  onCommit: (next: Stroke[]) => void;
  height: number;
  state: InkState;
  onPenSeen?: () => void;
  onNearBottom?: () => void;
  className?: string;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<Stroke | null>(null);
  const liveRef = useRef<Stroke | null>(null);
  const activeId = useRef<number | null>(null);
  const touches = useRef(new Set<number>());
  const erased = useRef<Stroke[] | null>(null);
  const scrollTouch = useRef<{ id: number; y: number } | null>(null);
  const raf = useRef(0);

  const toLogical = (e: PointerEvent | React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const k = INK_W / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k] as const;
  };
  const pressureOf = (e: PointerEvent | React.PointerEvent) => (e.pointerType === "pen" ? Math.max(0.05, e.pressure || 0.5) : 0.5);

  const flush = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setLive(liveRef.current ? { ...liveRef.current, points: [...liveRef.current.points] } : null));
  };

  const down = (e: React.PointerEvent) => {
    if (state.tool === "hand") return;
    if (e.pointerType === "pen") onPenSeen?.();
    if (e.pointerType === "touch") {
      touches.current.add(e.pointerId);
      if (state.penOnly) {
        // palm rejection: fingers never draw in stylus-only mode; one finger scrolls the page instead
        if (!scrollTouch.current) scrollTouch.current = { id: e.pointerId, y: e.clientY };
        return;
      }
      if (touches.current.size > 1) {
        // second finger: cancel the stroke (likely a pinch or palm)
        liveRef.current = null;
        activeId.current = null;
        setLive(null);
        return;
      }
    }
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (activeId.current !== null) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    activeId.current = e.pointerId;
    const [x, y] = toLogical(e);
    if (state.tool === "eraser") {
      erased.current = strokes;
      const keep = strokes.filter((s) => !hits(s, x, y, 10));
      if (keep.length !== strokes.length) erased.current = keep;
      onCommit(erased.current);
      return;
    }
    const s: Stroke = {
      tool: state.tool === "highlighter" ? "highlighter" : "pen",
      color: state.tool === "highlighter" ? state.hlColor : state.color,
      size: state.size,
      points: [[x, y, pressureOf(e)]],
    };
    liveRef.current = s;
    flush();
  };

  const move = (e: React.PointerEvent) => {
    const sc = scrollTouch.current;
    if (sc && sc.id === e.pointerId) {
      window.scrollBy(0, sc.y - e.clientY);
      sc.y = e.clientY;
      return;
    }
    if (activeId.current !== e.pointerId) return;
    const events = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const list = events.length ? events : [e.nativeEvent];
    if (state.tool === "eraser") {
      let cur = erased.current ?? strokes;
      for (const ev of list) {
        const [x, y] = toLogical(ev);
        cur = cur.filter((s) => !hits(s, x, y, 10));
      }
      if (cur !== erased.current) {
        erased.current = cur;
        onCommit(cur);
      }
      return;
    }
    const s = liveRef.current;
    if (!s) return;
    for (const ev of list) {
      const [x, y] = toLogical(ev);
      const last = s.points[s.points.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 0.6) continue;
      s.points.push([x, y, pressureOf(ev)]);
      if (y > height - 80) onNearBottom?.();
    }
    flush();
  };

  const up = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (scrollTouch.current?.id === e.pointerId) scrollTouch.current = null;
    if (activeId.current !== e.pointerId) return;
    activeId.current = null;
    if (state.tool === "eraser") {
      erased.current = null;
      return;
    }
    const s = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (s && s.points.length) onCommit([...strokes, s]);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // The surface never lets the browser pan while a drawing tool is active, so strokes are not
  // interrupted; in stylus-only mode a finger drag scrolls the page manually (see move()).
  const lock = state.tool !== "hand";
  return (
    <div
      ref={ref}
      className={`${className ?? ""} ${lock ? "locked" : ""}`}
      style={{ height: "100%", touchAction: lock ? "none" : "pan-y", cursor: state.tool === "hand" ? "grab" : state.tool === "eraser" ? "cell" : "crosshair" }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={(e) => e.pointerType === "mouse" && up(e)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg ref={svgRef} viewBox={`0 0 ${INK_W} ${height}`} preserveAspectRatio="xMinYMin meet" aria-label="Handwriting">
        {strokes.map((s, i) => <StrokePath key={i} s={s} />)}
        {live && <StrokePath s={live} />}
      </svg>
    </div>
  );
}

/** Pen-only mode stops fingers and palms drawing; useful on tablets with a stylus. */
export function useInkState(): [InkState, (p: Partial<InkState>) => void] {
  const [s, setS] = useState<InkState>(() => {
    let penOnly = false;
    try {
      penOnly = localStorage.getItem("sb-penonly") === "1";
    } catch { /* ignore */ }
    return { tool: "pen", color: PEN_COLORS[0], hlColor: HL_COLORS[0], size: 5, penOnly };
  });
  const set = useCallback((p: Partial<InkState>) => setS((x) => {
    const n = { ...x, ...p };
    if (p.penOnly !== undefined) try { localStorage.setItem("sb-penonly", p.penOnly ? "1" : "0"); } catch { /* ignore */ }
    return n;
  }), []);
  return [s, set];
}

export function InkTools({ st, set, onUndo, onRedo, canUndo, canRedo, extra }: {
  st: InkState; set: (p: Partial<InkState>) => void; onUndo: () => void; onRedo: () => void; canUndo: boolean; canRedo: boolean; extra?: React.ReactNode;
}) {
  const colors = st.tool === "highlighter" ? HL_COLORS : PEN_COLORS;
  const cur = st.tool === "highlighter" ? st.hlColor : st.color;
  return (
    <>
      <button className={`icon-btn ${st.tool === "pen" ? "on" : ""}`} onClick={() => set({ tool: "pen" })} aria-label="Pen" title="Pen"><PenLine size={19} /></button>
      <button className={`icon-btn ${st.tool === "highlighter" ? "on" : ""}`} onClick={() => set({ tool: "highlighter" })} aria-label="Highlighter" title="Highlighter"><Highlighter size={19} /></button>
      <button className={`icon-btn ${st.tool === "eraser" ? "on" : ""}`} onClick={() => set({ tool: "eraser" })} aria-label="Eraser" title="Eraser (removes whole strokes)"><Eraser size={19} /></button>
      <button className={`icon-btn ${st.tool === "hand" ? "on" : ""}`} onClick={() => set({ tool: "hand" })} aria-label="Scroll" title="Scroll without drawing"><Hand size={19} /></button>
      <span className="sep" />
      {st.tool !== "eraser" && st.tool !== "hand" && (
        <>
          {colors.map((c) => (
            <button key={c} className={`swatch ${cur === c ? "on" : ""}`} style={{ background: c }} onClick={() => set(st.tool === "highlighter" ? { hlColor: c } : { color: c })} aria-label={`Colour ${c}`} />
          ))}
          <span className="sep" />
          {SIZES.map((z) => (
            <button key={z} className={`ink-size ${st.size === z ? "on" : ""}`} onClick={() => set({ size: z })} aria-label={`Size ${z}`}>
              <i style={{ width: 4 + z, height: 4 + z }} />
            </button>
          ))}
          <span className="sep" />
        </>
      )}
      <button className="icon-btn" onClick={onUndo} disabled={!canUndo} aria-label="Undo"><Undo2 size={19} /></button>
      <button className="icon-btn" onClick={onRedo} disabled={!canRedo} aria-label="Redo"><Redo2 size={19} /></button>
      <button className={`icon-btn ${st.penOnly ? "on" : ""}`} onClick={() => set({ penOnly: !st.penOnly })} aria-label="Stylus only" title="Stylus only: fingers scroll, only the pen draws (palm rejection)">
        <PenTool size={19} />
      </button>
      {extra}
    </>
  );
}

/** Undo/redo history for a list of strokes. */
export function useStrokeHistory(initial: Stroke[], onChange: (s: Stroke[]) => void) {
  const [strokes, setStrokes] = useState<Stroke[]>(initial);
  const cur = useRef<Stroke[]>(initial);
  const undo = useRef<Stroke[][]>([]);
  const redo = useRef<Stroke[][]>([]);
  const set = (next: Stroke[]) => {
    cur.current = next;
    setStrokes(next);
    onChange(next);
  };
  const commit = (next: Stroke[]) => {
    undo.current.push(cur.current);
    if (undo.current.length > 100) undo.current.shift();
    redo.current = [];
    set(next);
  };
  const doUndo = () => {
    const p = undo.current.pop();
    if (!p) return;
    redo.current.push(cur.current);
    set(p);
  };
  const doRedo = () => {
    const n = redo.current.pop();
    if (!n) return;
    undo.current.push(cur.current);
    set(n);
  };
  return { strokes, commit, undo: doUndo, redo: doRedo, canUndo: undo.current.length > 0, canRedo: redo.current.length > 0 };
}

export async function svgToPng(svg: SVGSVGElement, bg: string): Promise<Blob> {
  const vb = svg.viewBox.baseVal;
  const scale = 2;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(vb.width));
  clone.setAttribute("height", String(vb.height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement("canvas");
  c.width = vb.width * scale;
  c.height = vb.height * scale;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

type Bg = "lines" | "grid" | "plain";

/** A handwriting page inside a note. */
export function InkPageEditor({ page, onChange, onDelete, onExport }: {
  page: InkPage;
  onChange: (p: InkPage) => void;
  onDelete: () => void;
  onExport: (svg: SVGSVGElement) => void;
}) {
  const [st, set] = useInkState();
  const [height, setHeight] = useState(page.height || 700);
  const [bg, setBg] = useState<Bg>(() => {
    try { return (localStorage.getItem("sb-inkbg") as Bg) || "lines"; } catch { return "lines"; }
  });
  const heightRef = useRef(height);
  heightRef.current = height;
  const emit = useCallback((strokes: Stroke[]) => onChange({ id: page.id, height: heightRef.current, strokes }), [onChange, page.id]);
  const h = useStrokeHistory(page.strokes ?? [], emit);
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / INK_W));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  const grow = (n = 400) => {
    const next = Math.min(heightRef.current + n, 12000);
    setHeight(next);
    heightRef.current = next;
    onChange({ id: page.id, height: next, strokes: h.strokes });
  };
  const growing = useRef(false);
  const nearBottom = () => {
    if (growing.current) return;
    growing.current = true;
    grow(300);
    setTimeout(() => (growing.current = false), 400);
  };
  const cycleBg = () => {
    const n: Bg = bg === "lines" ? "grid" : bg === "grid" ? "plain" : "lines";
    setBg(n);
    try { localStorage.setItem("sb-inkbg", n); } catch { /* ignore */ }
  };

  return (
    <div className="ink-wrap">
      <div className="ink-tools">
        <InkTools
          st={st} set={set} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo}
          extra={
            <>
              <span className="sep" />
              <button className="icon-btn" onClick={cycleBg} aria-label="Paper style" title="Paper: lines, grid or plain">
                {bg === "lines" ? <Rows3 size={19} /> : bg === "grid" ? <Grid3x3 size={19} /> : <Square size={19} />}
              </button>
              <button className="icon-btn" onClick={() => svg.current && onExport(svg.current)} aria-label="Save as image" title="Save as PNG image"><ImageIcon size={19} /></button>
              <button className="icon-btn" onClick={onDelete} aria-label="Delete page" title="Delete this handwriting page"><Trash2 size={19} /></button>
            </>
          }
        />
      </div>
      <div ref={wrap} className={`ink-surface ${bg === "lines" ? "" : bg}`} style={{ height: height * scale, ["--ink-scale" as string]: scale }}>
        <InkLayer strokes={h.strokes} onCommit={h.commit} height={height} state={st} onNearBottom={nearBottom} svgRef={svg} onPenSeen={() => !st.penOnly && set({ penOnly: true })} />
      </div>
      <div className="ink-more">
        <button className="btn soft sm" onClick={() => grow()}><Plus size={16} />More space</button>
        {height > 700 && <button className="btn soft sm" onClick={() => { const n = Math.max(700, height - 400); setHeight(n); heightRef.current = n; onChange({ id: page.id, height: n, strokes: h.strokes }); }}><Minus size={16} />Less</button>}
      </div>
    </div>
  );
}

/** Small read-only preview of handwriting, for lists. */
export function InkThumb({ page, maxHeight = 120 }: { page: InkPage; maxHeight?: number }) {
  const ys = page.strokes.flatMap((s) => s.points.map((p) => p[1]));
  const h = Math.min(page.height, Math.max(200, (ys.length ? Math.max(...ys) : 200) + 40));
  return (
    <svg viewBox={`0 0 ${INK_W} ${h}`} style={{ width: "100%", maxHeight, display: "block" }} preserveAspectRatio="xMinYMin meet" aria-label="Handwriting preview">
      {page.strokes.slice(0, 400).map((s, i) => <StrokePath key={i} s={s} />)}
    </svg>
  );
}

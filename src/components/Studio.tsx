import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Undo2, Redo2, Share2, PenLine, Type, Lasso, Plus, Trash2, Copy, ImagePlus, Shapes, Rows3, Grid3x3, Square, CircleDot, MoveVertical, PenTool, X, Minus, ArrowUpRight, Circle, Triangle, Table, RectangleHorizontal } from "lucide-react";
import {
  W, eraseAt, hitItem, itemsOf, lassoSelect, recognize, shapePath, snapAngle, strokePath, transform, uid, unionBox, wrapText,
  type Item, type Page, type Paper, type PenKind, type ShapeItem, type ShapeKind, type StrokeItem, type TextItem,
} from "../lib/ink";
import { imageToDataUrl } from "../lib/api";
import { downloadBlob } from "../lib/backup";
import { errMsg, useConfirm, useToast } from "./ui";

type Tab = "draw" | "text" | "lasso";
type Tool = PenKind | "eraser";

const COLORS = ["#1b1530", "#5b5b66", "#e0384f", "#ff7a45", "#e3a008", "#18a058", "#12b5a5", "#2f6bff", "#7c4dff", "#d63ca5", "#8b5a2b", "#ffffff"];
const HL_COLORS = ["#ffe14d", "#7ef0a0", "#ff9ccc", "#8fd3ff", "#ffb870", "#c9a7ff"];
const DEFAULTS: Record<Tool, { color: string; size: number }> = {
  ballpoint: { color: "#2f6bff", size: 4 },
  fountain: { color: "#1b1530", size: 5 },
  pencil: { color: "#5b5b66", size: 4 },
  highlighter: { color: "#ffe14d", size: 8 },
  eraser: { color: "", size: 14 },
};
const TEXT_SIZES = [22, 30, 42];

function load<T>(k: string, d: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...d, ...JSON.parse(v) } : d;
  } catch {
    return d;
  }
}
function store(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch { /* ignore */ }
}

// ---------- rendering ----------
export function ItemView({ it, selected }: { it: Item; selected?: boolean }) {
  const d = useMemo(() => (it.type === "stroke" ? strokePath(it) : it.type === "shape" ? shapePath(it) : ""), [it]);
  const op = selected ? 0.55 : 1;
  if (it.type === "stroke") {
    const hl = it.pen === "highlighter";
    return <path d={d} fill={it.color} opacity={(hl ? 0.4 : it.pen === "pencil" ? 0.85 : 1) * op} filter={it.pen === "pencil" ? "url(#pencil)" : undefined} style={hl ? { mixBlendMode: "multiply" } : undefined} />;
  }
  if (it.type === "shape") return <path d={d} fill="none" stroke={it.color} strokeWidth={it.size} strokeLinecap="round" strokeLinejoin="round" opacity={op} />;
  if (it.type === "text") {
    const lines = wrapText(it.text, it.w, it.size);
    return (
      <text x={it.x} y={it.y + it.size} fontSize={it.size} fill={it.color} fontFamily="Manrope, system-ui, sans-serif" fontWeight={600} opacity={op}>
        {lines.map((l, i) => <tspan key={i} x={it.x} dy={i ? it.size * 1.3 : 0}>{l || " "}</tspan>)}
      </text>
    );
  }
  return <image href={it.src} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="none" opacity={op} />;
}

const Defs = () => (
  <defs>
    <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n" />
      <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
    </filter>
  </defs>
);

/** Read-only picture of a page, for lists and previews. */
export function PageThumb({ page, maxHeight = 140 }: { page: Page; maxHeight?: number }) {
  const items = itemsOf(page);
  const box = unionBox(items);
  const h = Math.min(page.height, Math.max(220, (box ? box.y + box.h : 220) + 30));
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: "100%", maxHeight, display: "block" }} preserveAspectRatio="xMinYMin meet" aria-label="Handwriting preview">
      <Defs />
      {items.slice(0, 600).map((it) => <ItemView key={it.id} it={it} />)}
    </svg>
  );
}

export async function svgToPng(svg: SVGSVGElement, bg: string): Promise<Blob> {
  const vb = svg.viewBox.baseVal;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-ui]").forEach((n) => n.remove());
  clone.setAttribute("width", String(vb.width));
  clone.setAttribute("height", String(vb.height));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement("canvas");
  c.width = vb.width * 1.5;
  c.height = vb.height * 1.5;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

// ---------- tool icons (pens like a real pencil case) ----------
function PenIcon({ kind, color, active }: { kind: Tool; color: string; active: boolean }) {
  const body = "#f4f3f8";
  const shade = "#dcd9e6";
  return (
    <svg viewBox="0 0 40 96" width="34" height="82" style={{ transform: active ? "translateY(-12px)" : "translateY(6px)", transition: "transform .25s cubic-bezier(.2,.8,.2,1)", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.18))" }} aria-hidden="true">
      {kind === "eraser" ? (
        <>
          <rect x="7" y="22" width="26" height="74" rx="4" fill="#d9cdbb" />
          <rect x="7" y="22" width="26" height="16" rx="4" fill="#f3efe7" />
        </>
      ) : kind === "highlighter" ? (
        <>
          <path d="M12 14 L28 6 L28 26 L12 26 Z" fill={color} />
          <rect x="8" y="26" width="24" height="70" rx="5" fill={body} stroke={shade} />
        </>
      ) : kind === "pencil" ? (
        <>
          <path d="M20 2 L28 26 H12 Z" fill="#e8c9a0" />
          <path d="M20 2 L23 11 H17 Z" fill={color} />
          <rect x="12" y="26" width="16" height="70" fill={body} stroke={shade} />
        </>
      ) : kind === "fountain" ? (
        <>
          <path d="M20 2 L28 22 Q20 30 12 22 Z" fill="#cfd2dc" stroke="#9aa0b0" />
          <line x1="20" y1="6" x2="20" y2="20" stroke="#6b7080" />
          <rect x="11" y="26" width="18" height="70" rx="6" fill={body} stroke={shade} />
          <rect x="18" y="40" width="4" height="22" rx="2" fill={color} />
        </>
      ) : (
        <>
          <path d="M20 4 L26 24 H14 Z" fill="#cfd2dc" />
          <circle cx="20" cy="5" r="1.5" fill="#555" />
          <rect x="12" y="24" width="16" height="72" rx="6" fill={body} stroke={shade} />
          <rect x="18" y="40" width="4" height="22" rx="2" fill={color} />
        </>
      )}
    </svg>
  );
}

const SHAPES: { k: ShapeKind; label: string; icon: React.ReactNode }[] = [
  { k: "line", label: "Line", icon: <Minus size={20} /> },
  { k: "arrow", label: "Arrow", icon: <ArrowUpRight size={20} /> },
  { k: "rect", label: "Rectangle", icon: <RectangleHorizontal size={20} /> },
  { k: "ellipse", label: "Circle", icon: <Circle size={20} /> },
  { k: "triangle", label: "Triangle", icon: <Triangle size={20} /> },
  { k: "table", label: "Table", icon: <Table size={20} /> },
];

// ---------- studio ----------
export interface StudioProps {
  page: Page;
  title?: string;
  /** "overlay" draws over a frozen picture of the screen. */
  mode?: "page" | "overlay";
  onChange?: (p: Page) => void;
  onSave: (p: Page) => void | Promise<void>;
  onClose: () => void;
}

export function Studio({ page, title, mode = "page", onChange, onSave, onClose }: StudioProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[]>(() => itemsOf(page));
  const itemsRef = useRef(items);
  const [height, setHeight] = useState(page.height || 1400);
  const [paper, setPaper] = useState<Paper>(page.paper ?? (mode === "overlay" ? "plain" : "lines"));
  const undoS = useRef<Item[][]>([]);
  const redoS = useRef<Item[][]>([]);
  const [, bump] = useState(0);
  const dirty = useRef(false);

  const [tab, setTab] = useState<Tab>("draw");
  const [tool, setTool] = useState<Tool>(() => load("sb-studio-tool", { t: "fountain" as Tool }).t);
  const [styles, setStyles] = useState(() => load("sb-studio-styles", DEFAULTS));
  const [eraserMode, setEraserMode] = useState<"partial" | "stroke">(() => load("sb-studio-eraser", { m: "partial" as "partial" | "stroke" }).m);
  const [shape, setShape] = useState<ShapeKind | null>(null);
  const [penOnly, setPenOnly] = useState(() => load("sb-studio-penonly", { v: false }).v);
  const [pop, setPop] = useState<null | "size" | "color" | "insert" | "shapes" | "eraser">(null);
  const [textSize, setTextSize] = useState(30);
  const [selected, setSelected] = useState<string[]>([]);
  const [lasso, setLasso] = useState<[number, number][] | null>(null);
  const [live, setLive] = useState<Item | null>(null);
  const [editing, setEditing] = useState<TextItem | null>(null);
  const [saving, setSaving] = useState(false);
  const openedAt = useRef(0);

  const surface = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => store("sb-studio-tool", { t: tool }), [tool]);
  useEffect(() => store("sb-studio-styles", styles), [styles]);
  useEffect(() => store("sb-studio-eraser", { m: eraserMode }), [eraserMode]);
  useEffect(() => store("sb-studio-penonly", { v: penOnly }), [penOnly]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / W));
    if (surface.current) ro.observe(surface.current);
    return () => ro.disconnect();
  }, []);

  const current = (): Page => ({ id: page.id, height, paper, items: itemsRef.current });
  const emit = (next: Item[], h = height, p = paper) => {
    dirty.current = true;
    onChange?.({ id: page.id, height: h, paper: p, items: next });
  };
  const commit = useCallback((next: Item[]) => {
    undoS.current.push(itemsRef.current);
    if (undoS.current.length > 150) undoS.current.shift();
    redoS.current = [];
    itemsRef.current = next;
    setItems(next);
    emit(next);
    bump((n) => n + 1);
  }, [height, paper]); // eslint-disable-line react-hooks/exhaustive-deps
  const undo = () => {
    const p = undoS.current.pop();
    if (!p) return;
    redoS.current.push(itemsRef.current);
    itemsRef.current = p;
    setItems(p);
    setSelected([]);
    emit(p);
    bump((n) => n + 1);
  };
  const redo = () => {
    const n = redoS.current.pop();
    if (!n) return;
    undoS.current.push(itemsRef.current);
    itemsRef.current = n;
    setItems(n);
    emit(n);
    bump((x) => x + 1);
  };

  const growTo = (y: number) => {
    if (mode === "overlay" || y < height - 160) return;
    const h = Math.min(20000, height + 800);
    setHeight(h);
    emit(itemsRef.current, h);
  };

  // ---------- pointer handling ----------
  const act = useRef<{
    id: number; kind: "draw" | "shape" | "erase" | "lasso" | "move" | "scale" | "scroll";
    start: [number, number]; last: [number, number]; stroke?: StrokeItem; shape?: ShapeItem;
    hold?: ReturnType<typeof setTimeout>; recognized?: boolean; base?: Item[]; box?: ReturnType<typeof unionBox>; erased?: Item[];
  } | null>(null);
  const touches = useRef(new Set<number>());

  const toPage = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = surface.current!.getBoundingClientRect();
    const k = W / r.width;
    return [Math.round((e.clientX - r.left) * k * 10) / 10, Math.round((e.clientY - r.top) * k * 10) / 10];
  };
  const pressure = (e: PointerEvent | React.PointerEvent) => (e.pointerType === "pen" ? Math.round(Math.max(0.05, e.pressure || 0.5) * 100) / 100 : 0.5);
  const selBox = useMemo(() => unionBox(items.filter((i) => selected.includes(i.id))), [items, selected]);

  const down = (e: React.PointerEvent) => {
    if (editing) return;
    setPop(null);
    if (e.pointerType === "pen" && !penOnly) setPenOnly(true); // a stylus was used: fingers stop drawing (palm rejection)
    if (e.pointerType === "touch") {
      touches.current.add(e.pointerId);
      if (touches.current.size > 1 && act.current && act.current.kind !== "scroll") {
        clearTimeout(act.current.hold);
        act.current = null;
        setLive(null);
        setLasso(null);
        return;
      }
      if (penOnly && tab !== "text") {
        act.current = { id: e.pointerId, kind: "scroll", start: [e.clientX, e.clientY], last: [e.clientX, e.clientY] };
        return;
      }
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (act.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toPage(e);

    if (tab === "text") {
      e.preventDefault(); // keep the new text box focused (the tap would otherwise move focus away)
      openedAt.current = Date.now();
      const hit = [...itemsRef.current].reverse().find((it) => it.type === "text" && hitItem(it, p[0], p[1], 4)) as TextItem | undefined;
      setEditing(hit ?? { type: "text", id: uid(), x: Math.min(p[0], W - 320), y: p[1] - textSize * 0.6, w: Math.min(520, W - Math.min(p[0], W - 320) - 20), text: "", color: (() => { const c = styles[tool === "eraser" || tool === "highlighter" ? "fountain" : tool].color; return c === "#ffffff" ? "#1b1530" : c; })(), size: textSize });
      return;
    }
    if (tab === "lasso") {
      if (selBox) {
        const hx = selBox.x + selBox.w, hy = selBox.y + selBox.h;
        if (Math.hypot(p[0] - hx, p[1] - hy) < 34 / scale) {
          act.current = { id: e.pointerId, kind: "scale", start: p, last: p, base: itemsRef.current, box: selBox };
          return;
        }
        if (p[0] >= selBox.x && p[0] <= hx && p[1] >= selBox.y && p[1] <= hy) {
          act.current = { id: e.pointerId, kind: "move", start: p, last: p, base: itemsRef.current };
          return;
        }
      }
      setSelected([]);
      act.current = { id: e.pointerId, kind: "lasso", start: p, last: p };
      setLasso([[p[0], p[1]]]);
      return;
    }
    if (shape) {
      const sk: PenKind = tool === "eraser" || tool === "highlighter" ? "fountain" : tool;
      const s: ShapeItem = { type: "shape", id: uid(), shape, color: styles[sk].color, size: Math.max(2, styles[sk].size * 0.8), x1: p[0], y1: p[1], x2: p[0], y2: p[1], rows: 3, cols: 3 };
      act.current = { id: e.pointerId, kind: "shape", start: p, last: p, shape: s };
      setLive(s);
      return;
    }
    if (tool === "eraser") {
      act.current = { id: e.pointerId, kind: "erase", start: p, last: p, base: itemsRef.current, erased: itemsRef.current };
      eraseMove(p);
      return;
    }
    const st = styles[tool];
    const s: StrokeItem = { type: "stroke", id: uid(), pen: tool, color: st.color, size: st.size, points: [[p[0], p[1], pressure(e)]] };
    act.current = { id: e.pointerId, kind: "draw", start: p, last: p, stroke: s };
    armHold();
    setLive({ ...s });
  };

  const armHold = () => {
    const a = act.current;
    if (!a || a.kind !== "draw") return;
    clearTimeout(a.hold);
    a.hold = setTimeout(() => {
      const cur = act.current;
      if (!cur?.stroke || cur.recognized || cur.stroke.pen === "highlighter") return;
      const sh = recognize(cur.stroke.points, cur.stroke.color, Math.max(2, cur.stroke.size * 0.8));
      if (!sh) return;
      cur.recognized = true;
      cur.shape = sh;
      setLive(sh);
      navigator.vibrate?.(10);
    }, 550);
  };

  const eraseMove = (p: [number, number]) => {
    const a = act.current!;
    const r = styles.eraser.size;
    const base = a.erased ?? itemsRef.current;
    const next = eraserMode === "partial"
      ? eraseAt(base, p[0], p[1], r)
      : base.filter((it) => (it.type === "image" && (it as { locked?: boolean }).locked) || !hitItem(it, p[0], p[1], r));
    if (next !== base && (next.length !== base.length || next.some((x, i) => x !== base[i]))) {
      a.erased = next;
      itemsRef.current = next;
      setItems(next);
    }
  };

  const move = (e: React.PointerEvent) => {
    const a = act.current;
    if (!a || a.id !== e.pointerId) return;
    if (a.kind === "scroll") {
      scroller.current?.scrollBy(0, a.last[1] - e.clientY);
      a.last = [e.clientX, e.clientY];
      return;
    }
    const evs = typeof e.nativeEvent.getCoalescedEvents === "function" ? e.nativeEvent.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e.nativeEvent];
    const p = toPage(list[list.length - 1]);
    if (a.kind === "draw" && a.stroke) {
      if (a.recognized && a.shape) {
        const sh = a.shape;
        if (sh.shape === "line") [sh.x2, sh.y2] = snapAngle(sh.x1, sh.y1, p[0], p[1]);
        else { sh.x2 = Math.max(sh.x1 + 10, p[0]); sh.y2 = Math.max(sh.y1 + 10, p[1]); }
        setLive({ ...sh });
        return;
      }
      for (const ev of list) {
        const q = toPage(ev);
        const last = a.stroke.points[a.stroke.points.length - 1];
        if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.8) continue;
        a.stroke.points.push([q[0], q[1], pressure(ev)]);
        if (Math.hypot(q[0] - a.last[0], q[1] - a.last[1]) > 3) { a.last = q; armHold(); }
      }
      growTo(p[1]);
      setLive({ ...a.stroke, points: [...a.stroke.points] });
    } else if (a.kind === "shape" && a.shape) {
      const sh = a.shape;
      if (sh.shape === "line" || sh.shape === "arrow") [sh.x2, sh.y2] = snapAngle(sh.x1, sh.y1, p[0], p[1]);
      else { sh.x2 = p[0]; sh.y2 = p[1]; }
      growTo(p[1]);
      setLive({ ...sh });
    } else if (a.kind === "erase") {
      // check the whole path between samples, so a quick swipe can't skip over a stroke
      for (const ev of list) {
        const q = toPage(ev);
        const step = Math.max(2, styles.eraser.size / 2);
        const n = Math.ceil(Math.hypot(q[0] - a.last[0], q[1] - a.last[1]) / step);
        for (let i = 1; i <= n; i++) eraseMove([a.last[0] + ((q[0] - a.last[0]) * i) / n, a.last[1] + ((q[1] - a.last[1]) * i) / n]);
        a.last = q;
      }
    } else if (a.kind === "lasso") {
      setLasso((l) => (l ? [...l, [p[0], p[1]]] : l));
    } else if (a.kind === "move" && a.base) {
      const dx = p[0] - a.start[0], dy = p[1] - a.start[1];
      const next = a.base.map((it) => (selected.includes(it.id) ? transform(it, dx, dy) : it));
      itemsRef.current = next;
      setItems(next);
    } else if (a.kind === "scale" && a.base && a.box) {
      const b = a.box;
      const s = Math.max(0.15, Math.min(8, Math.max((p[0] - b.x) / b.w, (p[1] - b.y) / b.h)));
      const next = a.base.map((it) => (selected.includes(it.id) ? transform(it, 0, 0, s, b.x, b.y) : it));
      itemsRef.current = next;
      setItems(next);
    }
  };

  const up = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    const a = act.current;
    if (!a || a.id !== e.pointerId) return;
    act.current = null;
    clearTimeout(a.hold);
    if (a.kind === "scroll") return;
    if (a.kind === "draw" && a.stroke) {
      setLive(null);
      if (a.recognized && a.shape) commit([...itemsRef.current, a.shape]);
      else commit([...itemsRef.current, a.stroke]);
    } else if (a.kind === "shape" && a.shape) {
      setLive(null);
      const s = a.shape;
      if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 8) commit([...itemsRef.current, s]);
    } else if (a.kind === "erase") {
      // the whole erase gesture is one undo step
      if (a.base && itemsRef.current !== a.base) {
        undoS.current.push(a.base);
        redoS.current = [];
        emit(itemsRef.current);
        bump((n) => n + 1);
      }
    } else if (a.kind === "lasso") {
      const poly = lasso ?? [];
      setLasso(null);
      const ids = lassoSelect(itemsRef.current, poly);
      setSelected(ids);
    } else if (a.kind === "move" || a.kind === "scale") {
      const moved = itemsRef.current;
      itemsRef.current = a.base!;
      commit(moved);
    }
  };


  // ---------- text editing ----------
  const finishText = (t: TextItem | null) => {
    setEditing(null);
    if (!t) return;
    const exists = itemsRef.current.some((i) => i.id === t.id);
    const text = t.text.replace(/\s+$/, "");
    if (!text) {
      if (exists) commit(itemsRef.current.filter((i) => i.id !== t.id));
      return;
    }
    const nt = { ...t, text };
    commit(exists ? itemsRef.current.map((i) => (i.id === t.id ? nt : i)) : [...itemsRef.current, nt]);
  };

  // ---------- selection actions ----------
  const delSel = () => { commit(itemsRef.current.filter((i) => !selected.includes(i.id))); setSelected([]); };
  const dupSel = () => {
    const copies = itemsRef.current.filter((i) => selected.includes(i.id)).map((i) => ({ ...transform(i, 30, 30), id: uid() }));
    commit([...itemsRef.current, ...copies]);
    setSelected(copies.map((c) => c.id));
  };
  const colorSel = (c: string) => commit(itemsRef.current.map((i) => (selected.includes(i.id) && i.type !== "image" ? { ...i, color: c } as Item : i)));

  // ---------- insert ----------
  const addImage = async (f?: File) => {
    if (!f) return;
    try {
      const src = await imageToDataUrl(f);
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.src = src; });
      const w = Math.min(700, W - 80), h = (w * img.height) / img.width;
      const top = ((scroller.current?.scrollTop ?? 0) / scale) + 80;
      commit([...itemsRef.current, { type: "image", id: uid(), x: (W - w) / 2, y: top, w, h, src }]);
      growTo(top + h + 200);
      setTab("lasso");
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      if (file.current) file.current.value = "";
    }
  };
  const setPaperAndEmit = (p: Paper) => { setPaper(p); emit(itemsRef.current, height, p); setPop(null); };

  const share = async () => {
    if (!svg.current) return;
    try {
      const blob = await svgToPng(svg.current, "#ffffff");
      const name = `${(title || "drawing").replace(/[^\w -]+/g, "").slice(0, 40) || "drawing"}.png`;
      const f = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [f] })) await navigator.share({ files: [f], title: title || "Drawing" });
      else downloadBlob(blob, name);
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast(errMsg(e), { bad: true });
    }
  };

  const save = async () => {
    if (editing) finishText(editing);
    setSaving(true);
    try {
      await onSave(current());
      dirty.current = false;
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setSaving(false);
    }
  };
  const close = async () => {
    if (mode === "overlay" && itemsRef.current.some((i) => !(i.type === "image" && i.locked)) && dirty.current) {
      if (!(await confirm({ title: "Discard this drawing?", body: "Tap Save to keep it as a note.", confirm: "Discard", danger: true }))) return;
    }
    onClose();
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (editing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selected.length) delSel();
      if (e.key === "Escape") { if (selected.length) setSelected([]); else if (pop) setPop(null); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const style = styles[tool];
  const shapeTool: PenKind = tool === "eraser" || tool === "highlighter" ? "fountain" : tool;
  const palette = tool === "highlighter" ? HL_COLORS : COLORS;
  const setStyle = (patch: Partial<{ color: string; size: number }>) => setStyles((s) => ({ ...s, [tool]: { ...s[tool], ...patch } }));
  const cursor = tab === "text" ? "text" : tab === "lasso" ? "crosshair" : tool === "eraser" ? "cell" : "crosshair";
  const handle = selBox ? { x: selBox.x + selBox.w, y: selBox.y + selBox.h } : null;

  return (
    <div className={`studio ${mode}`} role="dialog" aria-label="Drawing">
      <header className="studio-top">
        <button className="icon-btn" onClick={close} aria-label="Back"><ArrowLeft size={24} /></button>
        <span className="studio-title">{title}</span>
        <button className="icon-btn" onClick={undo} disabled={!undoS.current.length} aria-label="Undo"><Undo2 size={22} /></button>
        <button className="icon-btn" onClick={redo} disabled={!redoS.current.length} aria-label="Redo"><Redo2 size={22} /></button>
        <button className="icon-btn" onClick={share} aria-label="Share as image"><Share2 size={21} /></button>
        <button className="studio-save" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </header>

      <div className="studio-scroll" ref={scroller}>
        <div
          ref={surface}
          className={`studio-page paper-${paper}`}
          style={{ height: height * scale, cursor, touchAction: "none", ["--s" as string]: scale }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onContextMenu={(e) => e.preventDefault()}
        >
          <svg ref={svg} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="xMinYMin meet">
            <Defs />
            {items.map((it) => <ItemView key={it.id} it={it} selected={editing?.id === it.id} />)}
            {live && <ItemView it={live} />}
            {lasso && <polyline data-ui points={lasso.map((p) => p.join(",")).join(" ")} fill="rgba(124,77,255,.08)" stroke="#7c4dff" strokeWidth={2 / scale} strokeDasharray={`${6 / scale} ${5 / scale}`} />}
            {selBox && tab === "lasso" && (
              <g data-ui>
                <rect x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h} fill="rgba(124,77,255,.06)" stroke="#7c4dff" strokeWidth={2 / scale} strokeDasharray={`${8 / scale} ${6 / scale}`} rx={6 / scale} />
                <circle cx={handle!.x} cy={handle!.y} r={11 / scale} fill="#fff" stroke="#7c4dff" strokeWidth={3 / scale} />
              </g>
            )}
          </svg>
          {editing && (
            <textarea
              className="studio-text"
              autoFocus
              value={editing.text}
              onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              onBlur={(e) => {
                // a blur right after opening comes from the same tap; keep typing
                if (!e.currentTarget.value && Date.now() - openedAt.current < 400) { const t = e.currentTarget; setTimeout(() => t.focus(), 0); return; }
                finishText(editing);
              }}
              onKeyDown={(e) => e.key === "Escape" && finishText(editing)}
              placeholder="Type here"
              style={{ left: editing.x * scale, top: editing.y * scale, width: editing.w * scale, fontSize: editing.size * scale, color: editing.color, minHeight: editing.size * scale * 1.6 }}
            />
          )}
        </div>
      </div>

      {/* selection actions */}
      {tab === "lasso" && selected.length > 0 && (
        <div className="studio-selbar">
          <span className="tiny">{selected.length} selected · drag to move, corner to resize</span>
          {COLORS.slice(0, 8).map((c) => <button key={c} className="swatch" style={{ background: c }} onClick={() => colorSel(c)} aria-label={`Colour ${c}`} />)}
          <button className="icon-btn sm" onClick={dupSel} aria-label="Duplicate"><Copy size={18} /></button>
          <button className="icon-btn sm" onClick={delSel} aria-label="Delete"><Trash2 size={18} /></button>
        </div>
      )}

      <div className="studio-bottom">
        {tab === "draw" && !shape && (
          <div className="studio-tray">
            <div className="studio-pens">
              {(["ballpoint", "fountain", "pencil", "highlighter", "eraser"] as Tool[]).map((k) => (
                <button key={k} className="studio-pen" onClick={() => { if (tool === k && k === "eraser") setPop(pop === "eraser" ? null : "eraser"); setTool(k); }} aria-label={k === "eraser" ? `Eraser (${eraserMode === "partial" ? "partial" : "whole stroke"})` : k[0].toUpperCase() + k.slice(1)} aria-pressed={tool === k}>
                  <PenIcon kind={k} color={k === "eraser" ? "" : styles[k].color} active={tool === k} />
                </button>
              ))}
            </div>
            <span className="studio-div" />
            <button className="studio-size" onClick={() => setPop(pop === "size" ? null : "size")} aria-label="Thickness">
              <i style={{ height: Math.max(2, Math.min(18, style.size * (tool === "highlighter" ? 1.6 : 1))) }} />
            </button>
            {tool !== "eraser" && (
              <button className="studio-color" onClick={() => setPop(pop === "color" ? null : "color")} aria-label="Colour">
                <i style={{ background: style.color }} />
              </button>
            )}
          </div>
        )}
        {tab === "draw" && shape && (
          <div className="studio-tray">
            {SHAPES.map((s) => (
              <button key={s.k} className={`icon-btn ${shape === s.k ? "on" : ""}`} onClick={() => setShape(s.k)} aria-label={s.label} title={s.label}>{s.icon}</button>
            ))}
            <span className="studio-div" />
            <button className="studio-color" onClick={() => setPop(pop === "color" ? null : "color")} aria-label="Colour"><i style={{ background: styles[shapeTool].color }} /></button>
            <button className="btn soft sm" onClick={() => setShape(null)}>Done</button>
          </div>
        )}
        {tab === "text" && (
          <div className="studio-tray">
            <span className="tiny">Tap anywhere to type</span>
            {TEXT_SIZES.map((s, i) => (
              <button key={s} className={`chip ${textSize === s ? "on" : ""}`} onClick={() => setTextSize(s)}>{["Small", "Medium", "Large"][i]}</button>
            ))}
          </div>
        )}
        {tab === "lasso" && selected.length === 0 && (
          <div className="studio-tray"><span className="tiny">Draw a loop around what you want to move, resize, recolour or delete</span></div>
        )}

        {pop === "size" && (
          <div className="studio-pop">
            <label className="tiny" htmlFor="st-size">Thickness</label>
            <input id="st-size" type="range" min={tool === "eraser" ? 6 : 1} max={tool === "eraser" ? 60 : tool === "highlighter" ? 24 : 20} step={0.5} value={style.size} onChange={(e) => setStyle({ size: Number(e.target.value) })} />
          </div>
        )}
        {pop === "color" && (
          <div className="studio-pop">
            <div className="studio-swatches">
              {(shape ? COLORS : palette).map((c) => (
                <button key={c} className={`swatch ${style.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => { if (shape) setStyles((s) => ({ ...s, [shapeTool]: { ...s[shapeTool], color: c } })); else setStyle({ color: c }); setPop(null); }} aria-label={`Colour ${c}`} />
              ))}
              <label className="swatch custom" aria-label="Any colour">
                <input type="color" value={style.color || "#000000"} onChange={(e) => setStyle({ color: e.target.value })} />
              </label>
            </div>
          </div>
        )}
        {pop === "eraser" && (
          <div className="studio-pop">
            <div className="seg">
              <button className={eraserMode === "partial" ? "on" : ""} onClick={() => { setEraserMode("partial"); setPop(null); }}>Erase part</button>
              <button className={eraserMode === "stroke" ? "on" : ""} onClick={() => { setEraserMode("stroke"); setPop(null); }}>Whole stroke</button>
            </div>
          </div>
        )}
        {pop === "insert" && (
          <div className="studio-pop studio-menu">
            <button onClick={() => { setPop(null); file.current?.click(); }}><ImagePlus size={20} />Image</button>
            <button onClick={() => { setTab("draw"); setShape("rect"); if (tool === "eraser" || tool === "highlighter") setTool("fountain"); setPop(null); }}><Shapes size={20} />Shapes</button>
            {mode === "page" && <button onClick={() => { const h = Math.min(20000, height + 1000); setHeight(h); emit(itemsRef.current, h); setPop(null); }}><MoveVertical size={20} />More space</button>}
            {mode === "page" && (
              <div className="row" style={{ padding: "4px 8px" }}>
                <span className="tiny" style={{ marginRight: 4 }}>Paper</span>
                <button className={`icon-btn sm ${paper === "lines" ? "on" : ""}`} onClick={() => setPaperAndEmit("lines")} aria-label="Lined"><Rows3 size={18} /></button>
                <button className={`icon-btn sm ${paper === "grid" ? "on" : ""}`} onClick={() => setPaperAndEmit("grid")} aria-label="Grid"><Grid3x3 size={18} /></button>
                <button className={`icon-btn sm ${paper === "dots" ? "on" : ""}`} onClick={() => setPaperAndEmit("dots")} aria-label="Dots"><CircleDot size={18} /></button>
                <button className={`icon-btn sm ${paper === "plain" ? "on" : ""}`} onClick={() => setPaperAndEmit("plain")} aria-label="Plain"><Square size={18} /></button>
              </div>
            )}
            <button onClick={() => setPenOnly((v) => !v)}><PenTool size={20} />Stylus only (palm rejection): {penOnly ? "On" : "Off"}</button>
            <button onClick={async () => { setPop(null); if (await confirm({ title: "Clear the page?", body: "You can undo this.", confirm: "Clear", danger: true })) commit(itemsRef.current.filter((i) => i.type === "image" && i.locked)); }}><X size={20} />Clear page</button>
          </div>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => addImage(e.target.files?.[0])} />

        <nav className="studio-tabs" aria-label="Tools">
          <button className={tab === "draw" ? "on" : ""} onClick={() => { if (editing) finishText(editing); setTab("draw"); setSelected([]); setPop(null); }} aria-label="Draw"><PenLine size={26} /></button>
          <button className={tab === "text" ? "on" : ""} onClick={() => { setTab("text"); setSelected([]); setShape(null); setPop(null); }} aria-label="Text"><Type size={26} /></button>
          <button className={tab === "lasso" ? "on" : ""} onClick={() => { if (editing) finishText(editing); setTab("lasso"); setShape(null); setPop(null); }} aria-label="Select (lasso)"><Lasso size={26} /></button>
          <button className={pop === "insert" ? "on" : ""} onClick={() => setPop(pop === "insert" ? null : "insert")} aria-label="Insert"><Plus size={28} /></button>
        </nav>
      </div>
    </div>
  );
}

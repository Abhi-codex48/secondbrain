import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Pen, Highlighter, Eraser, Undo2, Hand, Save, Loader2 } from "lucide-react";
import { saveNote } from "../lib/api";
import { W, hitItem, strokePath, uid, unionBox, type Item, type Pt, type StrokeItem, type Page } from "../lib/ink";
import { go } from "../lib/router";
import { errMsg, useConfirm, useToast } from "./ui";

type Tool = "pen" | "highlighter" | "eraser";
const dark = () => document.documentElement.dataset.mode === "dark";
// The first pen colour follows the theme so marks always show on the page.
const colors = () => [dark() ? "#ffffff" : "#1f1f2e", "#e5383b", dark() ? "#60a5fa" : "#2563eb", dark() ? "#4ade80" : "#16a34a", "#f59e0b", dark() ? "#c084fc" : "#a855f7"];
const HL_COLORS = ["#ffe14d", "#7cf29a", "#7cd3ff", "#ff9bd2", "#ffb86b"];
const SKIP = ["pen-layer", "pen-bar", "fab-stack", "toasts", "topbar", "bottomnav"];

/** Takes a picture of part of the page (document coordinates), without the app's floating bars. */
async function capture(top: number, height: number): Promise<{ src: string; w: number } | null> {
  try {
    const { toCanvas } = await import("html-to-image");
    const w = document.documentElement.clientWidth;
    for (const ratio of [Math.min(2, window.devicePixelRatio || 1), 1, 0.7]) {
      const canvas = await toCanvas(document.body, {
        width: w,
        height,
        pixelRatio: ratio,
        skipFonts: true,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
        style: { transform: `translate(0px, ${-top}px)`, transformOrigin: "top left" },
        filter: (n) => !(n instanceof HTMLElement && SKIP.some((c) => n.classList.contains(c))),
      });
      for (const q of [0.8, 0.65, 0.5]) {
        const src = canvas.toDataURL("image/jpeg", q);
        if (src.length < 420_000) return { src, w };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Pen mode: draw straight on the page you're reading. The page keeps
 * scrolling (two fingers, or one finger once a stylus is used, or the hand
 * button). Nothing is saved until you press Save.
 */
export function DrawOverlay({ onClose, context }: { onClose: () => void; context: { title: string; href: string } }) {
  const [items, setItems] = useState<Item[]>([]);
  const [undo, setUndo] = useState<Item[][]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [COLORS] = useState(colors);
  const [color, setColor] = useState(COLORS[0]);
  const [hl, setHl] = useState(HL_COLORS[0]);
  const [scroll, setScroll] = useState(false);
  const [stylus, setStylus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const live = useRef<StrokeItem | null>(null);
  const [, force] = useState(0);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const panY = useRef<number | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    const measure = () => setSize({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const commit = (next: Item[]) => {
    setUndo((u) => [...u.slice(-49), items]);
    setItems(next);
  };
  const at = (e: React.PointerEvent): Pt => [e.pageX, e.pageY, e.pointerType === "pen" ? e.pressure || 0.5 : 0.5];
  const midY = () => { const v = [...touches.current.values()]; return v.reduce((a, p) => a + p.y, 0) / v.length; };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "pen" && !stylus) setStylus(true);
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Two fingers, or a finger once a stylus is in use, scroll the page.
      if (touches.current.size >= 2 || stylus) {
        live.current = null;
        force((n) => n + 1);
        panY.current = midY();
        return;
      }
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "eraser") return eraseAt(e);
    live.current = tool === "highlighter"
      ? { type: "stroke", id: uid(), pen: "highlighter", color: hl, size: 6, points: [at(e)] }
      : { type: "stroke", id: uid(), pen: "ballpoint", color, size: 3, points: [at(e)] };
    force((n) => n + 1);
  };
  const eraseAt = (e: React.PointerEvent) => {
    const hit = items.filter((it) => hitItem(it, e.pageX, e.pageY, 14));
    if (hit.length) commit(items.filter((it) => !hit.includes(it)));
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (panY.current !== null) {
        const m = midY();
        window.scrollBy(0, panY.current - m);
        panY.current = m;
        return;
      }
    }
    if (tool === "eraser" && e.buttons) return eraseAt(e);
    if (!live.current) return;
    const evs = (e.nativeEvent.getCoalescedEvents?.() ?? []) as PointerEvent[];
    const pts: Pt[] = evs.length ? evs.map((c) => [c.pageX, c.pageY, c.pointerType === "pen" ? c.pressure || 0.5 : 0.5]) : [at(e)];
    live.current = { ...live.current, points: [...live.current.points, ...pts] };
    force((n) => n + 1);
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2 && !stylus) panY.current = null;
    if (touches.current.size === 0) panY.current = null;
    const s = live.current;
    live.current = null;
    if (s && s.points.length > 1) commit([...items, s]);
    else force((n) => n + 1);
  };

  const close = async () => {
    if (items.length && !(await confirm({ title: "Discard your marks?", body: "They haven't been saved. Press Save to keep them as a note.", confirm: "Discard", danger: true }))) return;
    onClose();
  };

  const save = async () => {
    const b = unionBox(items);
    if (!b) return toast("Draw something first");
    setSaving(true);
    try {
      const top = Math.max(0, Math.floor(b.y - 40));
      const height = Math.min(Math.ceil(b.y + b.h + 40) - top, size.h - top, 5000);
      const shot = await capture(top, height);
      const vw = shot?.w ?? document.documentElement.clientWidth;
      const s = W / vw;
      const marks = items.map((it) => (it.type === "stroke" ? { ...it, size: it.size * s, points: it.points.map(([x, y, p]) => [x * s, (y - top) * s, p] as Pt) } : it));
      const h = Math.round(height * s);
      const page: Page = { id: uid(), height: h, paper: "plain", items: [...(shot ? [{ type: "image" as const, id: uid(), x: 0, y: 0, w: W, h, src: shot.src, locked: true }] : []), ...marks] };
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const { note } = saveNote({
        kind: "ink",
        title: `Marks on: ${context.title}`.slice(0, 140),
        body_html: `<p>From <a href="${esc(context.href)}">${esc(context.title)}</a></p>`,
        ink: [page],
      });
      toast("Saved to your notes", { action: { label: "Open", run: () => go(`note/${note.id}`) } });
      onClose();
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setSaving(false);
    }
  };

  const all = live.current ? [...items, live.current] : items;
  return createPortal(
    <>
      <div className="pen-layer" style={{ width: size.w, height: size.h }}>
        <svg width={size.w} height={size.h} style={{ pointerEvents: scroll ? "none" : "auto", touchAction: "none" }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          {all.map((it) => it.type === "stroke" && (
            <path key={it.id} d={strokePath(it)} fill={it.color} opacity={it.pen === "highlighter" ? 0.42 : 1} style={it.pen === "highlighter" && !dark() ? { mixBlendMode: "multiply" } : undefined} />
          ))}
        </svg>
      </div>
      <div className="pen-bar" role="toolbar" aria-label="Pen mode">
        <button className="icon-btn" onClick={close} aria-label="Close pen mode" title="Close"><X size={20} /></button>
        <button className={`icon-btn ${scroll ? "on" : ""}`} onClick={() => setScroll((v) => !v)} aria-pressed={scroll} title={scroll ? "Scrolling: tap to draw" : "Tap to scroll the page"}><Hand size={20} /></button>
        <span className="sep" />
        <button className={`icon-btn ${tool === "pen" && !scroll ? "on" : ""}`} onClick={() => { setTool("pen"); setScroll(false); }} aria-label="Pen"><Pen size={20} color={color} /></button>
        <button className={`icon-btn ${tool === "highlighter" && !scroll ? "on" : ""}`} onClick={() => { setTool("highlighter"); setScroll(false); }} aria-label="Highlighter"><Highlighter size={20} color={hl === "#ffe14d" ? "#d4a106" : hl} /></button>
        <button className={`icon-btn ${tool === "eraser" && !scroll ? "on" : ""}`} onClick={() => { setTool("eraser"); setScroll(false); }} aria-label="Eraser"><Eraser size={20} /></button>
        <span className="sep" />
        <div className="pen-colors">
          {(tool === "highlighter" ? HL_COLORS : COLORS).map((c) => (
            <button key={c} className={(tool === "highlighter" ? hl : color) === c ? "on" : ""} style={{ background: c }} aria-label={`Colour ${c}`}
              onClick={() => { if (tool === "highlighter") setHl(c); else { setColor(c); setTool("pen"); } setScroll(false); }} />
          ))}
        </div>
        <span className="sep" />
        <button className="icon-btn" onClick={() => { const u = undo[undo.length - 1]; if (u) { setItems(u); setUndo(undo.slice(0, -1)); } }} disabled={!undo.length} aria-label="Undo"><Undo2 size={20} /></button>
        <button className="btn primary sm" onClick={save} disabled={saving || !items.length}>{saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}Save</button>
      </div>
    </>,
    document.body,
  );
}

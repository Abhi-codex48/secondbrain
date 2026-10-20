// Drawing model and geometry for the handwriting studio. Pure functions, no
// React, so they can be tested. Coordinates are in a 1000-unit-wide space so
// a page drawn on a phone looks the same on a laptop.
import { getStroke } from "perfect-freehand";

export const W = 1000;

export type PenKind = "ballpoint" | "fountain" | "pencil" | "highlighter";
export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "triangle" | "table";
export type Pt = [number, number, number]; // x, y, pressure

export interface StrokeItem { type: "stroke"; id: string; pen: PenKind; color: string; size: number; points: Pt[] }
export interface ShapeItem { type: "shape"; id: string; shape: ShapeKind; color: string; size: number; x1: number; y1: number; x2: number; y2: number; rows?: number; cols?: number }
export interface TextItem { type: "text"; id: string; x: number; y: number; w: number; text: string; color: string; size: number }
export interface ImageItem { type: "image"; id: string; x: number; y: number; w: number; h: number; src: string; locked?: boolean }
export type Item = StrokeItem | ShapeItem | TextItem | ImageItem;

export type Paper = "lines" | "grid" | "dots" | "plain" | "cornell";
export interface Page { id?: string; height: number; paper?: Paper; items?: Item[]; /** older format */ strokes?: { points: Pt[]; color: string; size: number; tool: "pen" | "highlighter" }[] }

export const uid = () => Math.random().toString(36).slice(2, 10);

/** Reads pages saved by earlier versions (strokes only) into the item format. */
export function itemsOf(p: Page): Item[] {
  if (p.items) return p.items;
  return (p.strokes ?? []).map((s) => ({ type: "stroke", id: uid(), pen: s.tool === "highlighter" ? "highlighter" : "fountain", color: s.color, size: s.size, points: s.points }));
}

// ---------- rendering ----------
const PEN_OPTS: Record<PenKind, { thinning: number; smoothing: number; streamline: number; mult: number; taper: boolean }> = {
  ballpoint: { thinning: 0.15, smoothing: 0.5, streamline: 0.5, mult: 0.9, taper: false },
  fountain: { thinning: 0.7, smoothing: 0.6, streamline: 0.45, mult: 1.3, taper: true },
  pencil: { thinning: 0.25, smoothing: 0.35, streamline: 0.3, mult: 0.85, taper: true },
  highlighter: { thinning: 0, smoothing: 0.6, streamline: 0.5, mult: 3.4, taper: false },
};

export function strokePath(s: StrokeItem): string {
  const o = PEN_OPTS[s.pen];
  const simulate = s.points.every((p) => p[2] === 0.5);
  const pts = getStroke(s.points, {
    size: s.size * o.mult,
    thinning: o.thinning,
    smoothing: o.smoothing,
    streamline: o.streamline,
    simulatePressure: simulate && s.pen !== "highlighter" && s.pen !== "ballpoint",
    last: true,
    start: { cap: !o.taper, taper: o.taper ? s.size * 2 : 0 },
    end: { cap: !o.taper, taper: o.taper ? s.size * 3 : 0 },
  });
  if (!pts.length) return "";
  const d = pts.reduce<(string | number)[]>((acc, [x0, y0], i, arr) => {
    const [x1, y1] = arr[(i + 1) % arr.length];
    acc.push(x0.toFixed(1), y0.toFixed(1), ((x0 + x1) / 2).toFixed(1), ((y0 + y1) / 2).toFixed(1));
    return acc;
  }, ["M", ...pts[0].map((n) => n.toFixed(1)), "Q"]);
  return `${d.join(" ")} Z`;
}

/** SVG path data for a shape (outline only). */
export function shapePath(s: ShapeItem): string {
  const { x1, y1, x2, y2 } = s;
  const l = Math.min(x1, x2), t = Math.min(y1, y2), r = Math.max(x1, x2), b = Math.max(y1, y2);
  switch (s.shape) {
    case "line":
      return `M${x1} ${y1} L${x2} ${y2}`;
    case "arrow": {
      const a = Math.atan2(y2 - y1, x2 - x1);
      const h = Math.max(14, s.size * 4);
      const p1 = [x2 - h * Math.cos(a - 0.45), y2 - h * Math.sin(a - 0.45)];
      const p2 = [x2 - h * Math.cos(a + 0.45), y2 - h * Math.sin(a + 0.45)];
      return `M${x1} ${y1} L${x2} ${y2} M${p1[0]} ${p1[1]} L${x2} ${y2} L${p2[0]} ${p2[1]}`;
    }
    case "rect":
      return `M${l} ${t} H${r} V${b} H${l} Z`;
    case "ellipse": {
      const rx = (r - l) / 2, ry = (b - t) / 2, cx = l + rx, cy = t + ry;
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    case "triangle":
      return `M${(l + r) / 2} ${t} L${r} ${b} L${l} ${b} Z`;
    case "table": {
      const rows = s.rows ?? 3, cols = s.cols ?? 3;
      let d = `M${l} ${t} H${r} V${b} H${l} Z`;
      for (let i = 1; i < rows; i++) d += ` M${l} ${t + ((b - t) * i) / rows} H${r}`;
      for (let j = 1; j < cols; j++) d += ` M${l + ((r - l) * j) / cols} ${t} V${b}`;
      return d;
    }
  }
}

/** Splits text into lines that fit the box width (approximate; same on every device). */
export function wrapText(text: string, w: number, size: number): string[] {
  const maxChars = Math.max(4, Math.floor(w / (size * 0.52)));
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if ((line + word).length > maxChars && line.trim()) {
        out.push(line.trimEnd());
        line = word.trimStart();
      } else line += word;
    }
    out.push(line);
  }
  return out;
}

// ---------- geometry ----------
export interface Box { x: number; y: number; w: number; h: number }

export function bbox(it: Item): Box {
  switch (it.type) {
    case "stroke": {
      let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      for (const [x, y] of it.points) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
      const pad = it.size * (it.pen === "highlighter" ? 1.8 : 0.7);
      return { x: a - pad, y: b - pad, w: c - a + 2 * pad, h: d - b + 2 * pad };
    }
    case "shape": {
      const pad = it.size;
      return { x: Math.min(it.x1, it.x2) - pad, y: Math.min(it.y1, it.y2) - pad, w: Math.abs(it.x2 - it.x1) + 2 * pad, h: Math.abs(it.y2 - it.y1) + 2 * pad };
    }
    case "text":
      return { x: it.x, y: it.y, w: it.w, h: wrapText(it.text, it.w, it.size).length * it.size * 1.3 + 4 };
    case "image":
      return { x: it.x, y: it.y, w: it.w, h: it.h };
  }
}

export function unionBox(items: Item[]): Box | null {
  if (!items.length) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const it of items) {
    const k = bbox(it);
    a = Math.min(a, k.x); b = Math.min(b, k.y); c = Math.max(c, k.x + k.w); d = Math.max(d, k.y + k.h);
  }
  return { x: a, y: b, w: c - a, h: d - b };
}

function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether an eraser or tap at (x, y) with radius r touches the item. */
export function hitItem(it: Item, x: number, y: number, r: number): boolean {
  if (it.type === "stroke") {
    const pad = r + it.size * (it.pen === "highlighter" ? 1.7 : 0.6);
    const p = it.points;
    if (p.length === 1) return Math.hypot(p[0][0] - x, p[0][1] - y) < pad;
    for (let i = 1; i < p.length; i++) if (distSeg(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) < pad) return true;
    return false;
  }
  if (it.type === "shape" && (it.shape === "line" || it.shape === "arrow")) return distSeg(x, y, it.x1, it.y1, it.x2, it.y2) < r + it.size;
  const b = bbox(it);
  return x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r;
}

/** Partial eraser: removes the parts of strokes under the eraser and splits what is left. */
export function eraseAt(items: Item[], x: number, y: number, r: number): Item[] {
  let changed = false;
  const out: Item[] = [];
  for (const it of items) {
    if (it.type !== "stroke") {
      if (it.type !== "image" && hitItem(it, x, y, r)) { changed = true; continue; }
      out.push(it);
      continue;
    }
    if (!hitItem(it, x, y, r)) { out.push(it); continue; }
    changed = true;
    let seg: Pt[] = [];
    const reach = r + it.size * 0.5;
    for (const p of it.points) {
      if (Math.hypot(p[0] - x, p[1] - y) < reach) {
        if (seg.length > 1) out.push({ ...it, id: uid(), points: seg });
        seg = [];
      } else seg.push(p);
    }
    if (seg.length > 1) out.push({ ...it, id: uid(), points: seg });
  }
  return changed ? out : items;
}

export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Items mostly inside a lasso outline. */
export function lassoSelect(items: Item[], poly: [number, number][]): string[] {
  if (poly.length < 3) return [];
  return items.filter((it) => {
    if (it.type === "image" && it.locked) return false;
    const pts: [number, number][] = it.type === "stroke" ? it.points.map((p) => [p[0], p[1]]) : (() => {
      const b = bbox(it);
      return [[b.x + b.w / 2, b.y + b.h / 2], [b.x, b.y], [b.x + b.w, b.y + b.h]];
    })();
    const step = Math.max(1, Math.floor(pts.length / 40));
    let n = 0, inside = 0;
    for (let i = 0; i < pts.length; i += step) { n++; if (pointInPolygon(pts[i][0], pts[i][1], poly)) inside++; }
    return inside / n >= 0.6;
  }).map((it) => it.id);
}

/** Moves and scales an item around an origin. */
export function transform(it: Item, dx: number, dy: number, s = 1, ox = 0, oy = 0): Item {
  const X = (x: number) => ox + (x - ox) * s + dx;
  const Y = (y: number) => oy + (y - oy) * s + dy;
  switch (it.type) {
    case "stroke": return { ...it, size: it.size * s, points: it.points.map(([x, y, p]) => [Math.round(X(x) * 10) / 10, Math.round(Y(y) * 10) / 10, p]) };
    case "shape": return { ...it, x1: X(it.x1), y1: Y(it.y1), x2: X(it.x2), y2: Y(it.y2), size: it.size * Math.sqrt(s) };
    case "text": return { ...it, x: X(it.x), y: Y(it.y), w: it.w * s, size: it.size * s };
    case "image": return { ...it, x: X(it.x), y: Y(it.y), w: it.w * s, h: it.h * s };
  }
}

/**
 * "Hold to straighten": turns a freehand stroke into a clean line, rectangle,
 * circle or triangle when it is close enough to one; otherwise returns null.
 */
export function recognize(points: Pt[], color: string, size: number): ShapeItem | null {
  if (points.length < 4) return null;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
  const diag = Math.hypot(r - l, b - t);
  if (diag < 20) return null;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  const [sx, sy] = points[0], [ex, ey] = points[points.length - 1];
  const chord = Math.hypot(ex - sx, ey - sy);
  const base = { type: "shape" as const, id: uid(), color, size };
  if (chord / length > 0.9) return { ...base, shape: "line", x1: sx, y1: sy, x2: ex, y2: ey };
  if (chord > diag * 0.3) return null; // not closed
  const w = r - l, h = b - t, cx = l + w / 2, cy = t + h / 2;
  const errEllipse = points.reduce((a, [x, y]) => a + Math.abs(Math.hypot((x - cx) / (w / 2 || 1), (y - cy) / (h / 2 || 1)) - 1), 0) / points.length;
  const errRect = points.reduce((a, [x, y]) => a + Math.min(Math.abs(x - l), Math.abs(x - r), Math.abs(y - t), Math.abs(y - b)) / Math.max(w, h), 0) / points.length;
  const tri: [number, number][] = [[cx, t], [r, b], [l, b]];
  const errTri = points.reduce((a, [x, y]) => a + Math.min(distSeg(x, y, ...tri[0], ...tri[1]), distSeg(x, y, ...tri[1], ...tri[2]), distSeg(x, y, ...tri[2], ...tri[0])) / Math.max(w, h), 0) / points.length;
  const best = Math.min(errEllipse * 0.5, errRect, errTri);
  if (best > 0.12) return null;
  const shape: ShapeKind = best === errRect ? "rect" : best === errTri ? "triangle" : "ellipse";
  return { ...base, shape, x1: l, y1: t, x2: r, y2: b };
}

/** Keeps a straight line horizontal, vertical or at 45° when close to it. */
export function snapAngle(x1: number, y1: number, x2: number, y2: number): [number, number] {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const step = Math.PI / 4;
  const snapped = Math.round(a / step) * step;
  if (Math.abs(a - snapped) > 0.08) return [x2, y2];
  const len = Math.hypot(x2 - x1, y2 - y1);
  return [x1 + len * Math.cos(snapped), y1 + len * Math.sin(snapped)];
}

/**
 * A quick back-and-forth scratch (like crossing out on paper): many changes of
 * direction packed into a small area. Used for "scribble to erase".
 */
export function isScribble(points: Pt[]): boolean {
  if (points.length < 12) return false;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  if (Math.max(w, h) < 15) return false;
  let length = 0;
  for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  // Count reversals along the stroke's main direction.
  const axis = w >= h ? 0 : 1;
  let rev = 0, dir = 0;
  for (let i = 3; i < points.length; i += 1) {
    const d = points[i][axis] - points[i - 3][axis];
    if (Math.abs(d) < 3) continue;
    const sg = Math.sign(d);
    if (dir && sg !== dir) rev++;
    dir = sg;
  }
  return rev >= 5 && length > 3.2 * Math.max(w, h);
}

/** Items a scribble covers (locked page pictures are never scribbled away). */
export function scribbleTargets(items: Item[], points: Pt[], r: number): string[] {
  const ids = new Set<string>();
  for (const it of items) {
    if (it.type === "image" && it.locked) continue;
    for (let i = 0; i < points.length; i += 2) if (hitItem(it, points[i][0], points[i][1], r)) { ids.add(it.id); break; }
  }
  return [...ids];
}

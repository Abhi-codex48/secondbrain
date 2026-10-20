import { describe, expect, it } from "vitest";
import { eraseAt, isScribble, itemsOf, scribbleTargets, lassoSelect, recognize, transform, wrapText, type Pt, type StrokeItem } from "../src/lib/ink";

const line = (n = 30): Pt[] => Array.from({ length: n }, (_, i) => [100 + i * 10, 200, 0.5]);
const stroke = (points: Pt[]): StrokeItem => ({ type: "stroke", id: "s", pen: "ballpoint", color: "#000", size: 4, points });

describe("drawing engine", () => {
  it("reads pages saved by the older version", () => {
    const items = itemsOf({ height: 500, strokes: [{ points: line(3), color: "#f00", size: 5, tool: "highlighter" }] });
    expect(items[0]).toMatchObject({ type: "stroke", pen: "highlighter", color: "#f00" });
  });

  it("partial eraser splits a stroke in two", () => {
    const out = eraseAt([stroke(line())], 250, 200, 12);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.type === "stroke" && s.points.every((p) => Math.abs(p[0] - 250) > 12))).toBe(true);
  });

  it("erasing empty space changes nothing", () => {
    const items = [stroke(line())];
    expect(eraseAt(items, 900, 900, 10)).toBe(items);
  });

  it("lasso selects strokes inside the outline only", () => {
    const inside = { ...stroke(line(5)), id: "in" };
    const outside = { ...stroke([[800, 800, 0.5], [820, 820, 0.5]]), id: "out" };
    const ids = lassoSelect([inside, outside], [[50, 150], [400, 150], [400, 250], [50, 250]]);
    expect(ids).toEqual(["in"]);
  });

  it("moves and scales items", () => {
    const t = transform(stroke([[100, 100, 0.5], [200, 100, 0.5]]), 10, 0, 2, 100, 100) as StrokeItem;
    expect(t.points[1][0]).toBe(310);
    expect(t.size).toBe(8);
  });

  it("straightens a wobbly line and recognises a box", () => {
    const wobbly: Pt[] = line().map(([x, y, p], i) => [x, y + (i % 2 ? 2 : -2), p]);
    expect(recognize(wobbly, "#000", 4)?.shape).toBe("line");
    const box: Pt[] = [];
    for (let x = 100; x <= 300; x += 10) box.push([x, 100, 0.5]);
    for (let y = 100; y <= 300; y += 10) box.push([300, y, 0.5]);
    for (let x = 300; x >= 100; x -= 10) box.push([x, 300, 0.5]);
    for (let y = 300; y >= 100; y -= 10) box.push([100, y, 0.5]);
    expect(recognize(box, "#000", 4)?.shape).toBe("rect");
    const circle: Pt[] = Array.from({ length: 60 }, (_, i) => [300 + 100 * Math.cos((i / 59) * 2 * Math.PI), 300 + 100 * Math.sin((i / 59) * 2 * Math.PI), 0.5]);
    expect(recognize(circle, "#000", 4)?.shape).toBe("ellipse");
  });

  it("wraps text to the box width", () => {
    expect(wrapText("one two three four five six", 100, 20).length).toBeGreaterThan(1);
  });
});

describe("scribble to erase", () => {
  const zigzag = (n: number, w = 120, h = 30): Pt[] => Array.from({ length: n * 8 }, (_, i) => {
    const t = i / 8;
    const x = 100 + (Math.floor(t) % 2 === 0 ? (t % 1) * w : w - (t % 1) * w);
    return [x, 200 + (i / (n * 8)) * h, 0.5] as Pt;
  });
  it("spots a back-and-forth scratch", () => {
    expect(isScribble(zigzag(7))).toBe(true);
  });
  it("leaves ordinary writing alone", () => {
    const line: Pt[] = Array.from({ length: 40 }, (_, i) => [100 + i * 5, 200 + Math.sin(i / 3) * 8, 0.5]);
    expect(isScribble(line)).toBe(false);
    const loop: Pt[] = Array.from({ length: 40 }, (_, i) => [200 + Math.cos(i / 6) * 50, 200 + Math.sin(i / 6) * 50, 0.5]);
    expect(isScribble(loop)).toBe(false);
  });
  it("finds the strokes it covers, never a locked page picture", () => {
    const word = { type: "stroke" as const, id: "w", pen: "ballpoint" as const, color: "#000", size: 3, points: [[110, 210, 0.5], [200, 215, 0.5]] as Pt[] };
    const far = { ...word, id: "far", points: [[600, 600, 0.5], [650, 610, 0.5]] as Pt[] };
    const pic = { type: "image" as const, id: "p", x: 0, y: 0, w: 1000, h: 800, src: "", locked: true };
    expect(scribbleTargets([word, far, pic], zigzag(7), 8)).toEqual(["w"]);
  });
});

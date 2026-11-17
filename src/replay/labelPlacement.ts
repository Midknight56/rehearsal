// Label placement for the floor plan and the game view: a pure function of sizes and boxes, in one unit of the caller's choice.
// Every label is tried at its candidate positions in order, kept inside the canvas, and the first one clear of the markers and
// of the labels placed before it wins. A label with no clear candidate is looked for on a coarse grid; if the canvas has no
// room at all, a required label takes its least overlapping candidate and an optional label is dropped (null).

export type Rect = { left: number; top: number; right: number; bottom: number };
export type Point = { x: number; y: number };
export type LabelRequest = { id: string; w: number; h: number; candidates: Point[]; optional?: boolean };

const overlap = (a: Rect, b: Rect): number => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
};

/** The box of a label whose top left corner is at `at`. */
export const boxAt = (at: Point, w: number, h: number): Rect => ({ left: at.x, top: at.y, right: at.x + w, bottom: at.y + h });

/** The top left corner moved the least that puts a w by h box inside the canvas (a box wider than the canvas starts at 0). */
export const clampInto = (at: Point, w: number, h: number, canvas: { w: number; h: number }): Point => ({
  x: Math.max(0, Math.min(at.x, canvas.w - w)),
  y: Math.max(0, Math.min(at.y, canvas.h - h)),
});

/**
 * Places the labels in order. `gap` keeps a clear margin around every marker and earlier label.
 * The result has one entry per request: the top left corner, or null for a dropped optional label.
 */
export function placeLabels(canvas: { w: number; h: number }, obstacles: Rect[], requests: LabelRequest[], gap: number): Map<string, Point | null> {
  const placed: Rect[] = [];
  const out = new Map<string, Point | null>();
  const grow = (r: Rect): Rect => ({ left: r.left - gap, top: r.top - gap, right: r.right + gap, bottom: r.bottom + gap });
  const cost = (box: Rect): number => {
    let total = 0;
    for (const o of obstacles) total += overlap(box, grow(o));
    for (const p of placed) total += overlap(box, grow(p));
    return total;
  };
  for (const req of requests) {
    let best: { at: Point; cost: number } | null = null;
    const consider = (raw: Point): boolean => {
      const at = clampInto(raw, req.w, req.h, canvas);
      const c = cost(boxAt(at, req.w, req.h));
      if (best === null || c < best.cost) best = { at, cost: c };
      return c === 0;
    };
    const found = req.candidates.some(consider);
    if (!found && req.candidates.length > 0) {
      // A grid scan, nearest to the first candidate first.
      const anchor = clampInto(req.candidates[0] as Point, req.w, req.h, canvas);
      const step = Math.max(2, Math.round(Math.min(req.h, 8) / 2));
      const spots: Point[] = [];
      for (let y = 0; y <= canvas.h - req.h; y += step) for (let x = 0; x <= canvas.w - req.w; x += step) spots.push({ x, y });
      spots.sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y));
      spots.some(consider);
    }
    const chosen = best as { at: Point; cost: number } | null;
    if (chosen === null || (req.optional === true && chosen.cost > 0)) {
      out.set(req.id, null);
    } else {
      out.set(req.id, chosen.at);
      placed.push(boxAt(chosen.at, req.w, req.h));
    }
  }
  return out;
}

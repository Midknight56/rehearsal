// Groups blocked cells into rectangles for the Layout panel's list: maximal horizontal runs per row, then runs with the
// same columns in consecutive rows are stacked. Every blocked cell is in exactly one rectangle; the order is by top row, then left column.
import type { Cell } from '../../domain/scenario';

export type BlockedRect = { x0: number; y0: number; x1: number; y1: number; cells: Cell[] };

export function groupBlockedCells(blocked: readonly Cell[]): BlockedRect[] {
  const rows = new Map<number, number[]>();
  for (const [x, y] of blocked) {
    const row = rows.get(y);
    if (row === undefined) rows.set(y, [x]);
    else row.push(x);
  }
  type Run = { x0: number; x1: number; y0: number; y1: number };
  const open = new Map<string, Run>();
  const done: Run[] = [];
  const ys = [...rows.keys()].sort((a, b) => a - b);
  let previousY = Number.NaN;
  for (const y of ys) {
    const xs = [...new Set(rows.get(y) as number[])].sort((a, b) => a - b);
    const runs: [number, number][] = [];
    for (const x of xs) {
      const last = runs[runs.length - 1];
      if (last !== undefined && last[1] === x - 1) last[1] = x;
      else runs.push([x, x]);
    }
    const next = new Map<string, Run>();
    for (const [x0, x1] of runs) {
      const key = `${x0},${x1}`;
      const above = y === previousY + 1 ? open.get(key) : undefined;
      if (above !== undefined) {
        above.y1 = y;
        next.set(key, above);
        open.delete(key);
      } else next.set(key, { x0, x1, y0: y, y1: y });
    }
    for (const run of open.values()) done.push(run);
    open.clear();
    for (const [key, run] of next) open.set(key, run);
    previousY = y;
  }
  for (const run of open.values()) done.push(run);
  done.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  return done.map((r) => {
    const cells: Cell[] = [];
    for (let y = r.y0; y <= r.y1; y += 1) for (let x = r.x0; x <= r.x1; x += 1) cells.push([x, y]);
    return { ...r, cells };
  });
}

/** `(5, 5), 1 cell` or `(16, 20) to (23, 23), 32 cells`. */
export function rectLabel(r: BlockedRect): string {
  const n = r.cells.length;
  const from = `(${r.x0}, ${r.y0})`;
  return n === 1 ? `${from}, 1 cell` : `${from} to (${r.x1}, ${r.y1}), ${n} cells`;
}

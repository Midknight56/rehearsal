// Cell geometry, zoom and pan of the floor plan (requirement 3.8, design "Floor plan"). Pure functions, no DOM.
import type { Cell } from '../../domain/scenario';

/** One cell is 16 user units wide; the SVG is scaled to CSS pixels by the zoom factor. */
export const CELL_UNITS = 16;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** The zoom that fits the whole grid into a viewport (below the 50% of the zoom buttons when a large grid needs it, so the grid is never cut off); 1 when the viewport has no size yet. */
export function fitZoom(cols: number, rows: number, viewportW: number, viewportH: number): number {
  if (viewportW <= 0 || viewportH <= 0) return 1;
  return Math.min(MAX_ZOOM, Math.max(0.1, Math.min(viewportW / (cols * CELL_UNITS), viewportH / (rows * CELL_UNITS))));
}

/** The scroll offsets that keep the grid point under `pointer` (viewport pixels) fixed when the zoom changes. */
export function scrollAfterZoom(scroll: { left: number; top: number }, pointer: { x: number; y: number }, oldZoom: number, newZoom: number): { left: number; top: number } {
  const ratio = newZoom / oldZoom;
  return {
    left: Math.max(0, (scroll.left + pointer.x) * ratio - pointer.x),
    top: Math.max(0, (scroll.top + pointer.y) * ratio - pointer.y),
  };
}

/** The top-left corner of a cell in user units. */
export const cellOrigin = (cell: Cell): { x: number; y: number } => ({ x: cell[0] * CELL_UNITS, y: cell[1] * CELL_UNITS });

/** The centre of a cell in user units. */
export const cellCentre = (cell: Cell): { x: number; y: number } => ({ x: cell[0] * CELL_UNITS + CELL_UNITS / 2, y: cell[1] * CELL_UNITS + CELL_UNITS / 2 });

/** Parses a `data-cell="x,y"` attribute; null when it is not two whole numbers. */
export function parseCellAttr(text: string | null | undefined): Cell | null {
  if (text === null || text === undefined) return null;
  const match = /^(\d+),(\d+)$/.exec(text);
  return match === null ? null : [Number(match[1]), Number(match[2])];
}

/** The cell under a pointer event target: the nearest ancestor carrying `data-cell`. */
export function cellOfTarget(target: EventTarget | null): Cell | null {
  if (!(target instanceof Element)) return null;
  return parseCellAttr(target.closest('[data-cell]')?.getAttribute('data-cell'));
}

export const ARROW_DELTAS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

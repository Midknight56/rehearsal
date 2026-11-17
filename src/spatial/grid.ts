import type { Cell, Layout } from '../domain/scenario';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export function isInBounds(layout: Layout, cell: Cell): boolean {
  return notImplemented('isInBounds');
}

export function isBlocked(layout: Layout, cell: Cell): boolean {
  return notImplemented('isBlocked');
}

export function findPath(layout: Layout, start: Cell, goal: Cell): Cell[] | null {
  return notImplemented('findPath');
}

export function pathDistanceM(cells: Cell[], cellSizeM: number): number {
  return notImplemented('pathDistanceM');
}

export function walkDurationMs(distanceM: number, walkSpeedMps: number): number {
  return notImplemented('walkDurationMs');
}
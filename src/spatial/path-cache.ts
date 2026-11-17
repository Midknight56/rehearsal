import type { Cell, Scenario } from '../domain/scenario';
import type { NodeRef } from '../simulation/heap';
function notImplemented(name: string): never {
  throw new Error(`not implemented: ${name}`);
}
export type CachedPath = { id: number; from: NodeRef; to: NodeRef; cells: Cell[]; distanceM: number; durationMs: number };
export type PathCache = {
  key: string;
  paths: CachedPath[];
  lookup(from: NodeRef, to: NodeRef): CachedPath;
  unreachable: { from: NodeRef; to: NodeRef }[];
  unsafe: { from: NodeRef; to: NodeRef; durationMs: number }[];
};

export function createPathCache(input: Pick<Scenario, 'layout' | 'stations' | 'walkSpeedMps'>): PathCache {
  return notImplemented('createPathCache');
}

export function nodeCell(input: Pick<Scenario, 'layout' | 'stations'>, node: NodeRef): Cell {
  return notImplemented('nodeCell');
}

export function describeNode(input: Pick<Scenario, 'layout' | 'stations'>, node: NodeRef): string {
  return notImplemented('describeNode');
}
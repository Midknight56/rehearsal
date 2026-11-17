// Route polylines and labels (requirement 3.8). One path cache is held per cache.key and rebuilt only when the key changes.
import type { Scenario } from '../../domain/scenario';
import { createPathCache, type CachedPath, type PathCache } from '../../spatial/path-cache';

type NodeRef = CachedPath['from'];

/** '<metres> m · <seconds> s': metres with at most one decimal, seconds rounded to one decimal (3.8). */
export function segmentLabel(distanceM: number, durationMs: number): string {
  const metres = Math.round(distanceM * 10) / 10;
  return `${String(metres)} m \u00b7 ${(durationMs / 1000).toFixed(1)} s`;
}

type CacheInput = Pick<Scenario, 'layout' | 'stations' | 'walkSpeedMps'>;

let held: { inputKey: string; cache: PathCache } | null = null;

/** The path cache for a layout, stations' cells and walking speed; the previous one is reused while the inputs are the same. */
export function pathCacheFor(input: CacheInput): PathCache {
  const inputKey = JSON.stringify([input.layout, input.stations.map((s) => [s.id, s.cell]), input.walkSpeedMps]);
  if (held !== null && held.inputKey === inputKey) return held.cache;
  const cache = createPathCache(input);
  held = { inputKey, cache };
  return cache;
}

export type RouteSegment =
  | { kind: 'path'; from: NodeRef; to: NodeRef; cells: [number, number][]; label: string }
  | { kind: 'no-path'; from: NodeRef; to: NodeRef; fromCell: [number, number]; toCell: [number, number]; label: 'no path' };

const same = (a: NodeRef, b: NodeRef): boolean => a.kind === b.kind && (a.kind !== 'station' || (b.kind === 'station' && a.id === b.id));

/** The segments of the route of one cohort, entrance to exit; a pair in cache.unreachable is never looked up. */
export function routeSegments(scenario: CacheInput & Pick<Scenario, 'cohorts'>, cohortId: string): RouteSegment[] {
  const cohort = scenario.cohorts.find((c) => c.id === cohortId);
  if (cohort === undefined) return [];
  if (!cohort.route.every((id) => scenario.stations.some((s) => s.id === id))) return [];
  const cache = pathCacheFor(scenario);
  const nodes: NodeRef[] = [{ kind: 'entrance' }, ...cohort.route.map((id): NodeRef => ({ kind: 'station', id })), { kind: 'exit' }];
  const cellOf = (node: NodeRef): [number, number] =>
    node.kind === 'entrance' ? scenario.layout.entrance : node.kind === 'exit' ? scenario.layout.exit : (scenario.stations.find((s) => s.id === node.id) as { cell: [number, number] }).cell;
  const segments: RouteSegment[] = [];
  for (let i = 0; i + 1 < nodes.length; i += 1) {
    const from = nodes[i] as NodeRef;
    const to = nodes[i + 1] as NodeRef;
    if (cache.unreachable.some((u) => same(u.from, from) && same(u.to, to))) {
      segments.push({ kind: 'no-path', from, to, fromCell: cellOf(from), toCell: cellOf(to), label: 'no path' });
    } else {
      const path = cache.lookup(from, to);
      segments.push({ kind: 'path', from, to, cells: path.cells, label: segmentLabel(path.distanceM, path.durationMs) });
    }
  }
  return segments;
}

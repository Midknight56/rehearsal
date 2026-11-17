import { readFileSync } from 'node:fs';
import type { Scenario, Station } from '../../src/domain/scenario';
import type { EditorAction, EditorState } from '../../src/ui/state/types';

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rand: () => number, items: readonly T[]): T => items[Math.floor(rand() * items.length)] as T;
const int = (rand: () => number, min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));

export type ScenarioOptions = { maxStations?: number; maxCohorts?: number; maxCols?: number; maxRows?: number };

/**
 * A scenario valid by construction (passes validateScenario with no issue): rows 0 and 1 are free from end to end,
 * the entrance is (0,0), the exit (cols-1,1), stations sit on row 0 and row 1, and blocked cells fall only on rows 2 and below,
 * so every pair of nodes is connected. Station cells never repeat and never use the entrance or the exit.
 */
export function makeScenario(seed: number, options: ScenarioOptions = {}): Scenario {
  const rand = mulberry32(seed);
  const maxStations = Math.min(options.maxStations ?? 10, 10);
  const maxCohorts = Math.min(options.maxCohorts ?? 5, 5);
  const cols = int(rand, 12, Math.min(options.maxCols ?? 80, 80));
  const rows = int(rand, 4, Math.min(options.maxRows ?? 80, 80));
  const stationCount = int(rand, 1, maxStations);
  const stations: Station[] = [];
  for (let i = 0; i < stationCount; i++) {
    const minS = int(rand, 1, 20);
    const modeS = minS + int(rand, 0, 10);
    const maxS = modeS + int(rand, 0, 10);
    stations.push({
      id: `s${i}`,
      label: `Station ${i}`,
      cell: [1 + i, i % 2],
      servers: int(rand, 1, 4),
      service: minS === maxS ? { kind: 'constant', seconds: minS } : { kind: 'triangular', minS, modeS, maxS },
    });
  }
  const horizonMs = int(rand, 20, 120) * 60_000;
  const cohorts: Scenario['cohorts'] = [];
  const cohortCount = int(rand, 1, maxCohorts);
  for (let i = 0; i < cohortCount; i++) {
    const startMs = int(rand, 0, 9) * 60_000;
    const endMs = startMs + int(rand, 1, Math.floor(horizonMs / 60_000) - 10) * 60_000;
    const order = stations.map((s) => s.id).sort(() => rand() - 0.5);
    cohorts.push({
      id: `c${i}`,
      startMs,
      endMs,
      count: int(rand, 0, 200),
      arrivals: pick(rand, ['even', 'uniform'] as const),
      route: order.slice(0, int(rand, 1, Math.min(6, order.length))),
    });
  }
  const blocked = new Map<string, [number, number]>();
  const blockedTarget = rows > 2 ? int(rand, 0, 12) : 0;
  for (let i = 0; i < blockedTarget; i++) {
    const cell: [number, number] = [int(rand, 0, cols - 1), int(rand, 2, rows - 1)];
    blocked.set(`${cell[0]},${cell[1]}`, cell);
  }
  return {
    schemaVersion: 1,
    id: `generated-${seed}`,
    revision: 0,
    title: `Generated ${seed}`,
    modelVersion: '0.1.0',
    baseSeed: `seed-${seed}`,
    horizonMs,
    layout: { cols, rows, cellSizeM: 0.5, blockedCells: [...blocked.values()], entrance: [0, 0], exit: [cols - 1, 1] },
    walkSpeedMps: 1.2,
    stations,
    cohorts,
    notes: '',
  };
}

/** n random committed-edit actions for a scenario; some are refused by the reducer on purpose. */
export function makeEdits(seed: number, n: number, scenario: Scenario): EditorAction[] {
  const rand = mulberry32(seed);
  const edits: EditorAction[] = [];
  for (let i = 0; i < n; i++) {
    const station = pick(rand, scenario.stations);
    const cohort = pick(rand, scenario.cohorts);
    const cell: [number, number] = [int(rand, 0, scenario.layout.cols - 1), int(rand, 0, scenario.layout.rows - 1)];
    edits.push(
      pick(rand, [
        { type: 'station/move', id: station.id, cell, via: 'form' },
        { type: 'station/set', id: station.id, patch: { servers: int(rand, 1, 20) } },
        { type: 'cohort/set', id: cohort.id, patch: { count: int(rand, 0, 300) } },
        { type: 'layout/toggle-blocked', cell },
        { type: 'settings/set', patch: { baseSeed: `edit-${i}` } },
        { type: 'settings/set', patch: { title: `Edit ${i}` } },
      ] as EditorAction[]),
    );
  }
  return edits;
}

/** An EditorState with the given tabs, empty results, no run and no hashes unless provided. */
export function makeState(
  scenarios: Scenario[],
  options: { tabKeys?: string[]; hashes?: (string | null)[]; currentIndex?: number } = {},
): EditorState {
  const currentIndex = options.currentIndex ?? 0;
  const hashes = options.hashes ?? scenarios.map(() => null);
  return {
    stateVersion: 1,
    screen: 'plan',
    scenarios,
    tabKeys: options.tabKeys ?? scenarios.map((s) => s.id),
    currentIndex,
    scenario: scenarios[currentIndex] as Scenario,
    hashes,
    hash: hashes[currentIndex] ?? null,
    selection: { kind: 'none' },
    past: scenarios.map(() => []),
    future: scenarios.map(() => []),
    drag: null,
    results: scenarios.map(() => ({ status: 'none' as const })),
    run: { status: 'idle' },
    replay: { follow: null, selectedAttendee: null, inspectedStation: null, speed: 1, playing: false, clockMs: 0 },
    compare: { baselineKey: null, candidateKey: null, running: false, progress: null, loadingReplication: null, comparison: null, restored: null, message: null },
    importDialog: { open: false, preview: null, busy: false, message: null },
    storage: { saved: [], message: null, unreadable: false, saveError: null },
    prefs: { version: 1, motion: 'system' },
    status: '',
  };
}

export const TAB_KEYS = ['baseline', 'plus-one-checkin', 'shorter-route'] as const;

/** The three Harbor Hall scenarios written by simulation-contract task 15, read from public/examples/harbor-hall/. */
export function harborHall(): { baseline: Scenario; plusOne: Scenario; shorter: Scenario } {
  const read = (name: string): Scenario => JSON.parse(readFileSync(`public/examples/harbor-hall/${name}.json`, 'utf8')) as Scenario;
  return { baseline: read('baseline'), plusOne: read('plus-one-checkin'), shorter: read('shorter-route') };
}

export const HOSTILE_STRINGS = ['<script>alert(1)</script>', '"quoted" & \'single\'', '=HYPERLINK("http://example.org")', '+1', '-2', '@SUM(1)', '<img src=x onerror=alert(1)>'];

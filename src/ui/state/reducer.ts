// Pure editor reducer (requirements 3 and 4). No clock, no storage, no worker: refusals return the same state object and
// their text comes from refusal(). Committed edits push one undo entry per tab; results and hashes are per tab.
import type { Cohort, Scenario, Station } from '../../domain/scenario';
import { LIMITS } from '../../domain/limits';
import type { EditorAction, EditorState, ResultsState, TabKey } from './types';
import { UNDO_DEPTH } from './undo';

const ID_RULE = (id: string): string => `"${id}" must be 1–64 characters and must not contain "|" or "#".`;
const idOk = (id: string): boolean => id.length >= 1 && id.length <= LIMITS.maxIdLength && !id.includes('|') && !id.includes('#');
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const cellKey = (c: readonly [number, number]): string => `${c[0]},${c[1]}`;
const cellText = (c: readonly [number, number]): string => `(${c[0]}, ${c[1]})`;
const grouped = (n: number): string => n.toLocaleString('en-US');

// ---------------------------------------------------------------------------------------------------------------------
// Construction

/** A valid empty scenario for a store that has not loaded anything yet (the landing screen). */
export function blankScenario(): Scenario {
  return {
    schemaVersion: 1, id: 'blank', revision: 0, title: 'Untitled scenario', modelVersion: '0.1.0', baseSeed: 'rehearsal', horizonMs: 2_400_000,
    layout: { cols: 40, rows: 24, cellSizeM: 0.5, blockedCells: [], entrance: [0, 12], exit: [0, 4] },
    walkSpeedMps: 1.2, stations: [], cohorts: [], notes: '',
  };
}

export function initialState(input: { scenarios: Scenario[]; tabKeys: TabKey[]; prefs?: EditorState['prefs']; screen?: EditorState['screen'] }): EditorState {
  const scenarios = input.scenarios.length > 0 ? input.scenarios : [blankScenario()];
  const tabKeys = input.scenarios.length > 0 ? input.tabKeys : ['scenario'];
  return {
    stateVersion: 1,
    screen: input.screen ?? 'plan',
    scenarios,
    tabKeys,
    currentIndex: 0,
    scenario: scenarios[0] as Scenario,
    hashes: scenarios.map(() => null),
    hash: null,
    selection: { kind: 'none' },
    past: scenarios.map(() => []),
    future: scenarios.map(() => []),
    drag: null,
    results: scenarios.map((): ResultsState => ({ status: 'none' })),
    run: { status: 'idle' },
    replay: { follow: null, selectedAttendee: null, inspectedStation: null, speed: 1, playing: false, clockMs: 0 },
    compare: { baselineKey: null, candidateKey: null, running: false, progress: null, loadingReplication: null, comparison: null, restored: null, message: null },
    importDialog: { open: false, preview: null, busy: false, message: null },
    storage: { saved: [], message: null, unreadable: false, saveError: null },
    prefs: input.prefs ?? { version: 1, motion: 'system' },
    status: '',
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Refusals (exact texts of the design's Error Handling table)

function cellRefusal(s: Scenario, cell: readonly [number, number], options: { ignoreStation?: string; ignoreBlocked?: boolean; allow?: 'entrance' | 'exit' } = {}): string | null {
  const { layout } = s;
  const [x, y] = cell;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= layout.cols || y >= layout.rows) {
    return `Cell ${cellText(cell)} is outside the ${layout.cols} × ${layout.rows} grid.`;
  }
  if (options.ignoreBlocked !== true && layout.blockedCells.some((b) => b[0] === x && b[1] === y)) return `Cell ${cellText(cell)} is blocked.`;
  if (options.allow !== 'entrance' && cellKey(layout.entrance) === cellKey(cell)) return `Cell ${cellText(cell)} is the entrance.`;
  if (options.allow !== 'exit' && cellKey(layout.exit) === cellKey(cell)) return `Cell ${cellText(cell)} is the exit.`;
  const occupant = s.stations.find((st) => st.id !== options.ignoreStation && cellKey(st.cell) === cellKey(cell));
  if (occupant !== undefined) return `Cell ${cellText(cell)} is used by ${occupant.label}.`;
  return null;
}

function resizeRefusal(s: Scenario, cols: number, rows: number): string | null {
  const whole = (n: number): boolean => Number.isInteger(n) && n >= 1 && n <= 80;
  if (!whole(cols)) return 'Columns must be a whole number from 1 to 80.';
  if (!whole(rows)) return 'Rows must be a whole number from 1 to 80.';
  const { layout } = s;
  const holder = (axis: 0 | 1, at: number, word: string): string | null => {
    const station = s.stations.find((st) => st.cell[axis] === at);
    if (station !== undefined) return `${word} ${at} is used by ${station.label}.`;
    if (layout.entrance[axis] === at) return `${word} ${at} is the entrance.`;
    if (layout.exit[axis] === at) return `${word} ${at} is the exit.`;
    if (layout.blockedCells.some((b) => b[axis] === at)) return `${word} ${at} is blocked.`;
    return null;
  };
  for (let x = cols; x < layout.cols; x += 1) {
    const found = holder(0, x, 'Column');
    if (found !== null) return found;
  }
  for (let y = rows; y < layout.rows; y += 1) {
    const found = holder(1, y, 'Row');
    if (found !== null) return found;
  }
  return null;
}

function totalAttendees(cohorts: Cohort[]): number {
  return cohorts.reduce((n, c) => n + c.count, 0);
}

function cohortRefusal(s: Scenario, id: string, next: Cohort): string | null {
  if (next.route.length > LIMITS.maxRouteVisits) return `At most ${LIMITS.maxRouteVisits} stations per route.`;
  const seen = new Set<string>();
  for (const token of next.route) {
    if (!s.stations.some((st) => st.id === token)) return `Station "${token}" is not defined.`;
    if (seen.has(token)) return `Station "${token}" appears twice in the route.`;
    seen.add(token);
  }
  if (!Number.isInteger(next.count) || next.count < 0) return `Cohort "${id}": count must be a whole number of 0 or more.`;
  const total = totalAttendees(s.cohorts.map((c) => (c.id === id ? next : c)));
  if (total > LIMITS.maxAttendees) return `At most ${grouped(LIMITS.maxAttendees)} attendees in total (got ${grouped(total)}).`;
  const windowOk = Number.isInteger(next.startMs) && Number.isInteger(next.endMs) && next.startMs >= 0 && next.startMs < next.endMs && next.endMs <= s.horizonMs;
  if (!windowOk) return `Cohort "${id}": the window must start at 0 or later, start before it ends and end by the horizon (${s.horizonMs / 60_000} min).`;
  if (next.arrivals !== 'even' && next.arrivals !== 'uniform') return `Cohort "${id}": arrivals must be "even" or "uniform".`;
  return null;
}

function stationPatchRefusal(st: Station): string | null {
  if (!Number.isInteger(st.servers) || st.servers < LIMITS.minServers || st.servers > LIMITS.maxServers) {
    return `Station "${st.id}": servers must be a whole number from ${LIMITS.minServers} to ${LIMITS.maxServers} (got ${st.servers}).`;
  }
  const max = LIMITS.maxServiceSeconds;
  const v = st.service;
  const ok = v.kind === 'constant'
    ? v.seconds > 0 && v.seconds <= max
    : v.minS > 0 && v.minS <= v.modeS && v.modeS <= v.maxS && v.maxS <= max;
  return ok ? null : `Station "${st.id}": service seconds must be greater than 0, at most ${grouped(max)}, and for a triangular service min ≤ mode ≤ max.`;
}

function settingsRefusal(s: Scenario, patch: Partial<Pick<Scenario, 'title' | 'horizonMs' | 'walkSpeedMps' | 'baseSeed' | 'notes'>>): string | null {
  if (patch.title !== undefined && (patch.title.length < 1 || patch.title.length > 120)) return 'Title must be 1–120 characters.';
  if (patch.baseSeed !== undefined && (patch.baseSeed.length < 1 || patch.baseSeed.length > LIMITS.maxSeedLength || patch.baseSeed.includes('|'))) {
    return 'Seed must be 1–64 characters and must not contain "|".';
  }
  if (patch.walkSpeedMps !== undefined && !(patch.walkSpeedMps > 0 && Number.isFinite(patch.walkSpeedMps))) return 'Walking speed must be greater than 0 metres per second.';
  if (patch.horizonMs !== undefined) {
    if (!Number.isInteger(patch.horizonMs) || patch.horizonMs < 1 || patch.horizonMs > LIMITS.maxHorizonMs) {
      return `Horizon must be a whole number of milliseconds from 1 to ${grouped(LIMITS.maxHorizonMs)} (360 min).`;
    }
    const late = s.cohorts.find((c) => c.endMs > (patch.horizonMs as number));
    if (late !== undefined) return `Horizon must be at least the end of cohort "${late.id}" (${late.endMs / 60_000} min).`;
  }
  return null;
}

/** The exact refusal text for an action the reducer would refuse, or null when the action is allowed. */
export function refusal(state: EditorState, action: EditorAction): string | null {
  const s = state.scenario;
  switch (action.type) {
    case 'station/move': {
      const station = s.stations.find((x) => x.id === action.id);
      return station === undefined ? null : cellRefusal(s, action.cell, { ignoreStation: action.id });
    }
    case 'drag/end': {
      const station = s.stations.find((x) => x.id === action.id);
      return state.drag === null || station === undefined ? null : cellRefusal(s, action.cell, { ignoreStation: action.id });
    }
    case 'station/set': {
      const station = s.stations.find((x) => x.id === action.id);
      return station === undefined ? null : stationPatchRefusal({ ...station, ...action.patch });
    }
    case 'station/rename': {
      if (!idOk(action.newId)) return ID_RULE(action.newId);
      return action.newId !== action.id && s.stations.some((x) => x.id === action.newId) ? `"${action.newId}" is already used.` : null;
    }
    case 'station/add':
      if (s.stations.length >= LIMITS.maxStations) return `${LIMITS.maxStations} of ${LIMITS.maxStations} stations`;
      return findFreeCell(s) === null ? 'There is no free cell on the grid.' : null;
    case 'station/delete': {
      const station = s.stations.find((x) => x.id === action.id);
      const cohort = s.cohorts.find((c) => c.route.includes(action.id));
      return station !== undefined && cohort !== undefined
        ? `${station.label} (${station.id}) is on the route of cohort "${cohort.id}". Remove it from the route before deleting the station.`
        : null;
    }
    case 'cohort/set': {
      const cohort = s.cohorts.find((x) => x.id === action.id);
      return cohort === undefined ? null : cohortRefusal(s, action.id, { ...cohort, ...action.patch });
    }
    case 'cohort/rename': {
      if (!idOk(action.newId)) return ID_RULE(action.newId);
      return action.newId !== action.id && s.cohorts.some((x) => x.id === action.newId) ? `"${action.newId}" is already used.` : null;
    }
    case 'layout/toggle-blocked': {
      const blocked = s.layout.blockedCells.some((b) => b[0] === action.cell[0] && b[1] === action.cell[1]);
      return blocked ? null : cellRefusal(s, action.cell);
    }
    case 'layout/set-entrance':
      return cellRefusal(s, action.cell, { allow: 'entrance' });
    case 'layout/set-exit':
      return cellRefusal(s, action.cell, { allow: 'exit' });
    case 'layout/unblock-and-place-entrance':
      return cellRefusal(s, action.cell, { allow: 'entrance', ignoreBlocked: true });
    case 'layout/unblock-and-place-exit':
      return cellRefusal(s, action.cell, { allow: 'exit', ignoreBlocked: true });
    case 'layout/resize':
      return resizeRefusal(s, action.cols, action.rows);
    case 'settings/set':
      return settingsRefusal(s, action.patch);
    default:
      return null;
  }
}

/** True for the actions that are committed edits (requirement 4.2). */
export function commits(action: EditorAction): boolean {
  switch (action.type) {
    case 'station/move': case 'station/set': case 'station/rename': case 'station/add': case 'station/delete':
    case 'cohort/set': case 'cohort/rename': case 'cohort/add': case 'cohort/delete':
    case 'layout/toggle-blocked': case 'layout/set-entrance': case 'layout/set-exit': case 'layout/resize':
    case 'layout/unblock-and-place-entrance': case 'layout/unblock-and-place-exit':
    case 'settings/set': case 'import/apply': case 'scenario/open': case 'drag/end':
      return true;
    default:
      return false;
  }
}

function findFreeCell(s: Scenario): [number, number] | null {
  for (let y = 0; y < s.layout.rows; y += 1) {
    for (let x = 1; x < s.layout.cols; x += 1) {
      if (cellRefusal(s, [x, y]) === null) return [x, y];
    }
  }
  return null;
}

function freshId(prefix: string, taken: string[]): string {
  for (let n = taken.length + 1; ; n += 1) {
    const id = `${prefix}${n}`;
    if (!taken.includes(id)) return id;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Compare picks: the current tab is the candidate and the first other tab the baseline, unless the picks already name open tabs.

function withDefaultPicks(state: EditorState): EditorState['compare'] {
  const open = (key: TabKey | null): key is TabKey => key !== null && state.tabKeys.includes(key);
  const { baselineKey, candidateKey } = state.compare;
  if (open(baselineKey) && open(candidateKey)) return state.compare;
  const current = state.tabKeys[state.currentIndex] as TabKey;
  const other = state.tabKeys.find((key) => key !== current) ?? current;
  return { ...state.compare, baselineKey: open(baselineKey) ? baselineKey : other, candidateKey: open(candidateKey) ? candidateKey : current };
}

// ---------------------------------------------------------------------------------------------------------------------
// Committing

function setTab<T>(list: T[], index: number, value: T): T[] {
  const copy = list.slice();
  copy[index] = value;
  return copy;
}

/** Push one undo entry and install the next scenario (revision + 1). An unchanged scenario returns the same state. */
function commit(state: EditorState, next: Scenario, options: { keepHash?: boolean; force?: boolean; selection?: EditorState['selection'] } = {}): EditorState {
  if (options.force !== true && same({ ...next, revision: 0 }, { ...state.scenario, revision: 0 })) return state;
  const i = state.currentIndex;
  const scenario: Scenario = { ...next, revision: state.scenario.revision + 1 };
  const past = [...(state.past[i] as Scenario[]), state.scenario];
  if (past.length > UNDO_DEPTH) past.shift();
  return {
    ...state,
    scenario,
    scenarios: setTab(state.scenarios, i, scenario),
    hashes: options.keepHash === true ? state.hashes : setTab(state.hashes, i, null),
    hash: options.keepHash === true ? state.hash : null,
    past: setTab(state.past, i, past),
    future: setTab(state.future, i, []),
    selection: options.selection ?? state.selection,
  };
}

function selectionAfter(state: EditorState, scenario: Scenario): EditorState['selection'] {
  const sel = state.selection;
  if (sel.kind === 'station') return scenario.stations.some((s) => s.id === sel.id) ? sel : { kind: 'none' };
  if (sel.kind === 'cohort') return scenario.cohorts.some((c) => c.id === sel.id) ? sel : { kind: 'none' };
  return sel;
}

function move(state: EditorState, id: string, cell: [number, number]): EditorState {
  if (!state.scenario.stations.some((s) => s.id === id)) return state;
  return commit(state, { ...state.scenario, stations: state.scenario.stations.map((s) => (s.id === id ? { ...s, cell } : s)) });
}

function travel(state: EditorState, direction: 'undo' | 'redo'): EditorState {
  const i = state.currentIndex;
  const from = (direction === 'undo' ? state.past : state.future)[i] as Scenario[];
  if (from.length === 0) return state;
  const target = from[from.length - 1] as Scenario;
  const scenario: Scenario = { ...target, revision: state.scenario.revision + 1 };
  const rest = from.slice(0, -1);
  const other = [...((direction === 'undo' ? state.future : state.past)[i] as Scenario[]), state.scenario];
  const [past, future] = direction === 'undo' ? [rest, other] : [other, rest];
  return {
    ...state,
    scenario,
    scenarios: setTab(state.scenarios, i, scenario),
    hashes: setTab(state.hashes, i, null),
    hash: null,
    past: setTab(state.past, i, past),
    future: setTab(state.future, i, future),
    selection: selectionAfter(state, scenario),
  };
}

function withResult(state: EditorState, tabIndex: number, value: ResultsState): EditorState {
  return { ...state, results: setTab(state.results, tabIndex, value) };
}

export function reduce(state: EditorState, action: EditorAction): EditorState {
  if (refusal(state, action) !== null) return action.type === 'drag/end' ? { ...state, drag: null } : state;
  const s = state.scenario;
  switch (action.type) {
    case 'station/move':
      return move(state, action.id, action.cell);
    case 'station/set':
      return commit(state, { ...s, stations: s.stations.map((x) => (x.id === action.id ? { ...x, ...action.patch } : x)) });
    case 'station/rename':
      return commit(state, {
        ...s,
        stations: s.stations.map((x) => (x.id === action.id ? { ...x, id: action.newId } : x)),
        cohorts: s.cohorts.map((c) => ({ ...c, route: c.route.map((t) => (t === action.id ? action.newId : t)) })),
      }, { selection: state.selection.kind === 'station' && state.selection.id === action.id ? { kind: 'station', id: action.newId } : state.selection });
    case 'station/add': {
      const cell = findFreeCell(s) as [number, number];
      const id = freshId('station', s.stations.map((x) => x.id));
      const station: Station = { id, label: `Station ${s.stations.length + 1}`, cell, servers: 1, service: { kind: 'constant', seconds: 10 } };
      return commit(state, { ...s, stations: [...s.stations, station] }, { selection: { kind: 'station', id } });
    }
    case 'station/delete':
      if (!s.stations.some((x) => x.id === action.id)) return state;
      return commit(state, { ...s, stations: s.stations.filter((x) => x.id !== action.id) }, { selection: { kind: 'none' } });
    case 'cohort/set':
      return commit(state, { ...s, cohorts: s.cohorts.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) });
    case 'cohort/rename':
      return commit(state, { ...s, cohorts: s.cohorts.map((c) => (c.id === action.id ? { ...c, id: action.newId } : c)) });
    case 'cohort/add': {
      const id = freshId('cohort', s.cohorts.map((c) => c.id));
      const cohort: Cohort = { id, startMs: 0, endMs: Math.min(20 * 60_000, s.horizonMs), count: 0, arrivals: 'uniform', route: [] };
      return commit(state, { ...s, cohorts: [...s.cohorts, cohort] }, { selection: { kind: 'cohort', id } });
    }
    case 'cohort/delete':
      return commit(state, { ...s, cohorts: s.cohorts.filter((c) => c.id !== action.id) }, { selection: { kind: 'none' } });
    case 'layout/toggle-blocked': {
      const blocked = s.layout.blockedCells.some((b) => b[0] === action.cell[0] && b[1] === action.cell[1]);
      const blockedCells = blocked
        ? s.layout.blockedCells.filter((b) => !(b[0] === action.cell[0] && b[1] === action.cell[1]))
        : [...s.layout.blockedCells, action.cell];
      return commit(state, { ...s, layout: { ...s.layout, blockedCells } });
    }
    case 'layout/set-entrance':
      return commit(state, { ...s, layout: { ...s.layout, entrance: action.cell } });
    case 'layout/set-exit':
      return commit(state, { ...s, layout: { ...s.layout, exit: action.cell } });
    case 'layout/unblock-and-place-entrance':
    case 'layout/unblock-and-place-exit': {
      const blockedCells = s.layout.blockedCells.filter((b) => !(b[0] === action.cell[0] && b[1] === action.cell[1]));
      const end = action.type === 'layout/unblock-and-place-entrance' ? { entrance: action.cell } : { exit: action.cell };
      return commit(state, { ...s, layout: { ...s.layout, blockedCells, ...end } });
    }
    case 'layout/resize':
      return commit(state, { ...s, layout: { ...s.layout, cols: action.cols, rows: action.rows } });
    case 'settings/set': {
      const keys = Object.keys(action.patch);
      const outsideHash = keys.every((k) => k === 'title' || k === 'notes');
      return commit(state, { ...s, ...action.patch }, { keepHash: outsideHash });
    }
    case 'import/apply':
    case 'scenario/open': {
      const incoming = action.type === 'import/apply' ? action.candidate : action.scenario;
      const next = commit(state, incoming, { force: true });
      const closed = { open: false, preview: null, busy: false, message: null };
      if (action.type === 'import/apply') return { ...next, selection: selectionAfter(state, next.scenario), importDialog: closed };
      return next === state ? state : { ...next, selection: selectionAfter(state, next.scenario) };
    }
    case 'workspace/load': {
      const fresh = initialState({ scenarios: action.scenarios, tabKeys: action.tabKeys, prefs: state.prefs, screen: 'plan' });
      return { ...fresh, storage: state.storage, status: state.status };
    }
    case 'import/open':
      return { ...state, importDialog: { open: true, preview: null, busy: false, message: null } };
    case 'import/close':
      return { ...state, importDialog: { open: false, preview: null, busy: false, message: null } };
    case 'import/busy':
      return { ...state, importDialog: { ...state.importDialog, busy: action.busy } };
    case 'import/preview':
      return { ...state, importDialog: { ...state.importDialog, preview: action.preview, busy: false } };
    case 'screen/set':
      return { ...state, screen: action.screen, ...(action.screen === 'compare' ? { compare: withDefaultPicks(state) } : {}) };
    case 'compare/pick':
      return { ...state, compare: action.side === 'baseline' ? { ...state.compare, baselineKey: action.key } : { ...state.compare, candidateKey: action.key } };
    case 'compare/started':
      return { ...state, compare: { ...state.compare, running: true, progress: { done: 0, total: 0 }, loadingReplication: null, message: null } };
    case 'compare/progress':
      return state.compare.running ? { ...state, compare: { ...state.compare, progress: { done: action.done, total: action.total } } } : state;
    case 'compare/complete':
      return { ...state, compare: { ...state.compare, running: false, progress: null, loadingReplication: null, comparison: action.comparison, restored: null, message: null } };
    case 'compare/ended':
      return { ...state, compare: { ...state.compare, running: false, progress: null, loadingReplication: null, message: action.message } };
    case 'compare/loading':
      return state.compare.comparison === null ? state : { ...state, compare: { ...state.compare, loadingReplication: action.replication, message: null } };
    case 'compare/replicate':
      return { ...state, compare: { ...state.compare, loadingReplication: null, comparison: action.comparison, message: null } };
    case 'compare/replicate-failed':
      return { ...state, compare: { ...state.compare, loadingReplication: null, message: action.message } };
    case 'compare/restore':
      return { ...state, compare: { ...state.compare, running: false, progress: null, loadingReplication: null, comparison: null, restored: action.summary, message: null } };
    case 'scenario/select-tab': {
      if (action.index === state.currentIndex || action.index < 0 || action.index >= state.scenarios.length) return state;
      return {
        ...state, currentIndex: action.index, scenario: state.scenarios[action.index] as Scenario, hash: state.hashes[action.index] ?? null,
        selection: { kind: 'none' }, drag: null,
      };
    }
    case 'undo':
    case 'redo':
      return travel(state, action.type);
    case 'drag/start': {
      const station = s.stations.find((x) => x.id === action.id);
      return station === undefined ? state : { ...state, drag: { stationId: action.id, from: station.cell, current: station.cell } };
    }
    case 'drag/move':
      return state.drag === null || state.drag.stationId !== action.id ? state : { ...state, drag: { ...state.drag, current: action.cell } };
    case 'drag/end': {
      if (state.drag === null || state.drag.stationId !== action.id) return state;
      return move({ ...state, drag: null }, action.id, action.cell);
    }
    case 'drag/cancel':
      return state.drag === null ? state : { ...state, drag: null };
    case 'select':
      return { ...state, selection: action.selection };
    case 'run/started':
      return { ...state, run: { status: 'running', runId: action.runId, tabIndex: action.tabIndex, done: 0, total: 1, startedAt: 0 } };
    case 'run/progress':
      return state.run.status === 'running' && state.run.runId === action.runId ? { ...state, run: { ...state.run, done: action.done, total: action.total } } : state;
    case 'run/result':
      if (action.result.scenarioHash !== action.hash) return state;
      return withResult(state, action.tabIndex, { status: 'fresh', result: action.result, snapshot: action.snapshot, hash: action.hash, completedAt: action.completedAt ?? '' });
    case 'run/cancelling':
      return state.run.status === 'running' && state.run.runId === action.runId ? { ...state, run: { status: 'cancelling', runId: action.runId, tabIndex: state.run.tabIndex, since: 0 } } : state;
    case 'run/finished': {
      if (state.run.status !== 'running' && state.run.status !== 'cancelling') return state;
      if (state.run.runId !== action.runId) return state;
      const o = action.outcome;
      const message = o === 'complete' ? undefined : 'cancelled' in o ? o.cancelled : `Run failed: ${o.error}`;
      return { ...state, run: message === undefined ? { status: 'idle' } : { status: 'idle', message } };
    }
    case 'run/blocked':
      return { ...state, run: { status: 'blocked', message: action.message } };
    case 'hash/computed': {
      const target = state.scenarios[action.tabIndex];
      if (target === undefined || target.revision !== action.revision) return state;
      const hashes = setTab(state.hashes, action.tabIndex, action.hash);
      return { ...state, hashes, hash: hashes[state.currentIndex] ?? null };
    }
    case 'storage/save-failed':
      return { ...state, storage: { ...state.storage, saveError: { reason: action.reason } } };
    case 'storage/listed':
      return { ...state, storage: { ...state.storage, saved: action.saved, unreadable: action.unreadable } };
    case 'storage/save-ok':
      return { ...state, storage: { ...state.storage, saveError: null } };
    case 'prefs/set':
      return state.prefs.motion === action.prefs.motion ? state : { ...state, prefs: action.prefs };
    case 'status/set':
      return state.status === action.text ? state : { ...state, status: action.text };
    default:
      return state;
  }
}

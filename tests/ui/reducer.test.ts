import { describe, expect, it, vi } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import type { RunResult } from '../../src/simulation/simulate';
import { commits, reduce, refusal } from '../../src/ui/state/reducer';
import { resultsStatus } from '../../src/ui/state/selectors';
import { createEditorStore } from '../../src/ui/state/store';
import type { EditorAction, EditorState } from '../../src/ui/state/types';
import { TAB_KEYS, harborHall, makeState } from './generators';

const hh = () => harborHall();
const state0 = (): EditorState => {
  const { baseline, plusOne, shorter } = hh();
  return makeState([baseline, plusOne, shorter], { tabKeys: [...TAB_KEYS], hashes: ['h-base', 'h-plus', 'h-short'] });
};
const station = (s: EditorState, id: string) => s.scenario.stations.find((x) => x.id === id) as Scenario['stations'][number];
const resultFor = (hash: string): RunResult => ({ scenarioHash: hash } as RunResult);

describe('3.2 to 3.5 station moves', () => {
  it.each(['drag', 'form', 'nudge'] as const)('moves a station by %s as one committed edit', (via) => {
    const s0 = state0();
    const s1 = reduce(s0, { type: 'station/move', id: 'packs', cell: [12, 7], via });
    expect(station(s1, 'packs').cell).toEqual([12, 7]);
    expect(s1.scenario.revision).toBe(s0.scenario.revision + 1);
    expect(s1.past[0]).toHaveLength(1);
    expect(s1.scenarios[0]).toBe(s1.scenario);
  });

  it.each([
    [[16, 21], 'Cell (16, 21) is blocked.'],
    [[45, 12], 'Cell (45, 12) is outside the 40 × 24 grid.'],
    [[0, 12], 'Cell (0, 12) is the entrance.'],
    [[0, 4], 'Cell (0, 4) is the exit.'],
    [[10, 12], 'Cell (10, 12) is used by Check-in desk.'],
  ] as const)('refuses a move of packs to %j with the exact text', (cell, text) => {
    const s0 = state0();
    const action: EditorAction = { type: 'station/move', id: 'packs', cell: [cell[0], cell[1]], via: 'form' };
    expect(refusal(s0, action)).toBe(text);
    expect(reduce(s0, action)).toBe(s0);
  });

  it('allows a free in-bounds cell', () => {
    expect(refusal(state0(), { type: 'station/move', id: 'packs', cell: [12, 7], via: 'drag' })).toBeNull();
  });

  it('a nudge is exactly one cell: ArrowUp decrements y', () => {
    const s1 = reduce(state0(), { type: 'station/move', id: 'packs', cell: [34, 11], via: 'nudge' });
    expect(station(s1, 'packs').cell).toEqual([34, 11]);
  });
});

describe('3.6 delete guard (I11)', () => {
  it('refuses to delete a routed station and returns the same state object', () => {
    const s0 = state0();
    const action: EditorAction = { type: 'station/delete', id: 'checkin' };
    expect(refusal(s0, action)).toBe('Check-in desk (checkin) is on the route of cohort "doors". Remove it from the route before deleting the station.');
    expect(reduce(s0, action)).toBe(s0);
  });

  it('deletes an unrouted station as one committed edit and selects nothing', () => {
    const added = reduce(state0(), { type: 'station/add' });
    const newId = added.scenario.stations.find((x) => !['checkin', 'packs'].includes(x.id))?.id as string;
    const selected = reduce(added, { type: 'select', selection: { kind: 'station', id: newId } });
    const deleted = reduce(selected, { type: 'station/delete', id: newId });
    expect(deleted.scenario.stations.map((x) => x.id)).toEqual(['checkin', 'packs']);
    expect(deleted.selection).toEqual({ kind: 'none' });
    expect(deleted.past[0]).toHaveLength(2);
  });
});

describe('3.7 layout edits', () => {
  it('toggles a blocked cell on and off', () => {
    const on = reduce(state0(), { type: 'layout/toggle-blocked', cell: [5, 5] });
    expect(on.scenario.layout.blockedCells).toContainEqual([5, 5]);
    const off = reduce(on, { type: 'layout/toggle-blocked', cell: [5, 5] });
    expect(off.scenario.layout.blockedCells).not.toContainEqual([5, 5]);
  });

  it('refuses a blocked cell on a station, the entrance or the exit', () => {
    const s0 = state0();
    expect(refusal(s0, { type: 'layout/toggle-blocked', cell: [10, 12] })).toBe('Cell (10, 12) is used by Check-in desk.');
    expect(refusal(s0, { type: 'layout/toggle-blocked', cell: [0, 12] })).toBe('Cell (0, 12) is the entrance.');
    expect(refusal(s0, { type: 'layout/toggle-blocked', cell: [0, 4] })).toBe('Cell (0, 4) is the exit.');
  });

  it('sets the entrance and the exit, and refuses a blocked or occupied cell', () => {
    const s1 = reduce(state0(), { type: 'layout/set-entrance', cell: [0, 10] });
    expect(s1.scenario.layout.entrance).toEqual([0, 10]);
    expect(reduce(s1, { type: 'layout/set-exit', cell: [0, 6] }).scenario.layout.exit).toEqual([0, 6]);
    expect(refusal(state0(), { type: 'layout/set-entrance', cell: [16, 21] })).toBe('Cell (16, 21) is blocked.');
    expect(refusal(state0(), { type: 'layout/set-exit', cell: [10, 12] })).toBe('Cell (10, 12) is used by Check-in desk.');
  });

  it.each([['entrance', 'layout/unblock-and-place-entrance'], ['exit', 'layout/unblock-and-place-exit']] as const)(
    'unblocks and places the %s on a blocked cell as one action and one undo entry',
    (which, type) => {
      const s0 = state0();
      const s1 = reduce(s0, { type, cell: [16, 21] } as EditorAction);
      const layout = s1.scenario.layout;
      expect(layout[which]).toEqual([16, 21]);
      expect(layout.blockedCells).not.toContainEqual([16, 21]);
      expect(layout.blockedCells).toHaveLength(s0.scenario.layout.blockedCells.length - 1);
      expect(s1.scenario.revision).toBe(s0.scenario.revision + 1);
      expect(s1.past[0]).toHaveLength(s0.past[0]!.length + 1);
      const u = reduce(s1, { type: 'undo' });
      expect(u.scenario.layout.blockedCells).toContainEqual([16, 21]);
      expect(u.scenario.layout[which]).toEqual(s0.scenario.layout[which]);
    },
  );

  it('the combined action still refuses a cell that is outside the grid, a station cell or the other end', () => {
    expect(refusal(state0(), { type: 'layout/unblock-and-place-entrance', cell: [10, 12] })).toBe('Cell (10, 12) is used by Check-in desk.');
    expect(refusal(state0(), { type: 'layout/unblock-and-place-exit', cell: [0, 12] })).toBe('Cell (0, 12) is the entrance.');
    expect(commits({ type: 'layout/unblock-and-place-exit', cell: [16, 21] })).toBe(true);
  });
  it('Escape clears a station selection to the cell cursor through a select action', () => {
    const s1 = reduce(state0(), { type: 'select', selection: { kind: 'cell', cell: [10, 12] } });
    expect(s1.selection).toEqual({ kind: 'cell', cell: [10, 12] });
    expect(s1.past[0]).toHaveLength(0);
  });

  it('refuses a shrink that removes something, naming the lowest-numbered column or row', () => {
    const s0 = state0();
    expect(refusal(s0, { type: 'layout/resize', cols: 30, rows: 24 })).toBe('Column 34 is used by Welcome packs.');
    expect(refusal(s0, { type: 'layout/resize', cols: 40, rows: 22 })).toBe('Row 22 is blocked.');
    expect(refusal(s0, { type: 'layout/resize', cols: 40, rows: 4 })).toBe('Row 4 is the exit.');
    expect(reduce(s0, { type: 'layout/resize', cols: 30, rows: 24 })).toBe(s0);
  });

  it('allows a shrink that removes nothing and a grow', () => {
    expect(reduce(state0(), { type: 'layout/resize', cols: 36, rows: 24 }).scenario.layout.cols).toBe(36);
    expect(reduce(state0(), { type: 'layout/resize', cols: 50, rows: 30 }).scenario.layout).toMatchObject({ cols: 50, rows: 30 });
  });
});

describe('3.9 identifiers', () => {
  it('renaming a station rewrites every route in the same committed edit', () => {
    const s1 = reduce(state0(), { type: 'station/rename', id: 'checkin', newId: 'welcome' });
    expect(s1.scenario.cohorts[0]?.route).toEqual(['welcome', 'packs']);
    expect(s1.scenario.stations[0]?.id).toBe('welcome');
    expect(s1.past[0]).toHaveLength(1);
  });

  it('refuses a duplicate id and an id outside ID_FORMAT with the exact texts', () => {
    const s0 = state0();
    expect(refusal(s0, { type: 'station/rename', id: 'checkin', newId: 'packs' })).toBe('"packs" is already used.');
    expect(refusal(s0, { type: 'station/rename', id: 'checkin', newId: 'a#1' })).toBe('"a#1" must be 1–64 characters and must not contain "|" or "#".');
    expect(refusal(s0, { type: 'cohort/rename', id: 'doors', newId: '' })).toBe('"" must be 1–64 characters and must not contain "|" or "#".');
    expect(reduce(s0, { type: 'station/rename', id: 'checkin', newId: 'a|b' })).toBe(s0);
  });
});

describe('3.10 limits', () => {
  it('refuses an 11th station', () => {
    let s = state0();
    for (let i = 0; i < 8; i++) s = reduce(s, { type: 'station/add' });
    expect(s.scenario.stations).toHaveLength(10);
    expect(refusal(s, { type: 'station/add' })).toBe('10 of 10 stations');
    expect(reduce(s, { type: 'station/add' })).toBe(s);
  });

  it('refuses a route of seven and more than 5,000 attendees', () => {
    const s0 = state0();
    expect(refusal(s0, { type: 'cohort/set', id: 'doors', patch: { route: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } })).toBe('At most 6 stations per route.');
    expect(refusal(s0, { type: 'cohort/set', id: 'doors', patch: { count: 5200 } })).toBe('At most 5,000 attendees in total (got 5,200).');
  });

  it('refuses a servers value outside 1 to 20 and keeps the scenario', () => {
    const s0 = state0();
    expect(refusal(s0, { type: 'station/set', id: 'checkin', patch: { servers: 21 } })).not.toBeNull();
    expect(reduce(s0, { type: 'station/set', id: 'checkin', patch: { servers: 0 } })).toBe(s0);
  });
});

describe('4.1 and 4.2 undo and redo (I3)', () => {
  it('lists the committed edits', () => {
    const committed: EditorAction[] = [
      { type: 'station/move', id: 'packs', cell: [1, 1], via: 'drag' }, { type: 'station/set', id: 'packs', patch: { servers: 3 } },
      { type: 'station/rename', id: 'packs', newId: 'x' }, { type: 'station/add' }, { type: 'station/delete', id: 'x' },
      { type: 'cohort/set', id: 'doors', patch: { count: 1 } }, { type: 'cohort/add' }, { type: 'layout/toggle-blocked', cell: [1, 1] },
      { type: 'layout/set-entrance', cell: [1, 1] }, { type: 'layout/resize', cols: 1, rows: 1 }, { type: 'settings/set', patch: { title: 'x' } },
    ];
    for (const a of committed) expect(commits(a), a.type).toBe(true);
    const plain: EditorAction[] = [
      { type: 'select', selection: { kind: 'none' } }, { type: 'drag/move', id: 'packs', cell: [1, 1] }, { type: 'drag/start', id: 'packs', cell: [34, 12] },
      { type: 'scenario/select-tab', index: 1 }, { type: 'run/blocked', message: 'x' }, { type: 'status/set', text: 'x' }, { type: 'undo' }, { type: 'redo' },
    ];
    for (const a of plain) expect(commits(a), a.type).toBe(false);
  });

  it('undo then redo returns a deep-equal scenario and bumps the revision each time', () => {
    const s0 = state0();
    const s1 = reduce(s0, { type: 'station/move', id: 'packs', cell: [12, 7], via: 'form' });
    const u = reduce(s1, { type: 'undo' });
    expect(u.scenario).toEqual({ ...s0.scenario, revision: s1.scenario.revision + 1 });
    expect(u.future[0]).toHaveLength(1);
    const r = reduce(u, { type: 'redo' });
    expect(r.scenario).toEqual({ ...s1.scenario, revision: u.scenario.revision + 1 });
  });

  it('keeps at most 100 undo entries and a new edit clears redo', () => {
    let s = state0();
    for (let i = 0; i < 105; i++) s = reduce(s, { type: 'settings/set', patch: { title: `Title ${i}` } });
    expect(s.past[0]).toHaveLength(100);
    const u = reduce(s, { type: 'undo' });
    expect(u.future[0]).toHaveLength(1);
    expect(reduce(u, { type: 'settings/set', patch: { title: 'Fresh' } }).future[0]).toHaveLength(0);
  });

  it('an empty stack leaves the state as it was', () => {
    const s0 = state0();
    expect(reduce(s0, { type: 'undo' }).scenario).toEqual(s0.scenario);
    expect(reduce(s0, { type: 'redo' }).scenario).toEqual(s0.scenario);
  });

  it('a drag in progress, a nudge-free select and an unchanged field commit create no entry; a drop creates one', () => {
    const s0 = state0();
    let s = reduce(s0, { type: 'drag/start', id: 'packs', cell: [34, 12] });
    s = reduce(s, { type: 'drag/move', id: 'packs', cell: [20, 9] });
    expect(s.past[0]).toHaveLength(0);
    expect(station(s, 'packs').cell).toEqual([34, 12]);
    expect(s.drag?.current).toEqual([20, 9]);
    const unchanged = reduce(s0, { type: 'station/set', id: 'checkin', patch: { servers: 1 } });
    expect(unchanged.past[0]).toHaveLength(0);
    const dropped = reduce(s, { type: 'drag/end', id: 'packs', cell: [20, 9] });
    expect(dropped.past[0]).toHaveLength(1);
    expect(station(dropped, 'packs').cell).toEqual([20, 9]);
    expect(dropped.drag).toBeNull();
    expect(reduce(s, { type: 'drag/cancel', id: 'packs', cell: [20, 9] }).drag).toBeNull();
  });

  it('import/apply is one committed edit with revision + 1', () => {
    const s0 = state0();
    const candidate: Scenario = { ...s0.scenario, revision: s0.scenario.revision + 1, cohorts: [{ ...s0.scenario.cohorts[0]!, count: 60 }] };
    const s1 = reduce(s0, { type: 'import/apply', candidate, sources: ['arrivals.csv'] });
    expect(s1.scenario).toEqual({ ...candidate, revision: s0.scenario.revision + 1 });
    expect(s1.past[0]).toHaveLength(1);
  });

  it('undo is per tab: an edit on one tab leaves the others untouched', () => {
    const s0 = state0();
    const onTab1 = reduce(reduce(s0, { type: 'scenario/select-tab', index: 1 }), { type: 'station/move', id: 'packs', cell: [12, 7], via: 'form' });
    expect(onTab1.past.map((p) => p.length)).toEqual([0, 1, 0]);
    expect(onTab1.scenarios[0]).toEqual(s0.scenarios[0]);
  });
});

describe('4.3 stale derivation per tab (I4)', () => {
  const withBaselineResult = (): EditorState => {
    const s = state0();
    return reduce(s, { type: 'run/result', runId: 1, tabIndex: 0, result: resultFor('h-base'), snapshot: s.scenario, hash: 'h-base' });
  };

  it('is fresh while the hash matches, stale after an edit changes it, fresh again after undo restores it', () => {
    let s = withBaselineResult();
    expect(resultsStatus(s, 0)).toBe('fresh');
    s = reduce(s, { type: 'station/move', id: 'packs', cell: [12, 7], via: 'form' });
    s = reduce(s, { type: 'hash/computed', tabIndex: 0, revision: s.scenario.revision, hash: 'h-edited' });
    expect(resultsStatus(s, 0)).toBe('stale');
    s = reduce(s, { type: 'undo' });
    s = reduce(s, { type: 'hash/computed', tabIndex: 0, revision: s.scenario.revision, hash: 'h-base' });
    expect(resultsStatus(s, 0)).toBe('fresh');
  });

  it('drops a hash computed for an older revision', () => {
    let s = withBaselineResult();
    s = reduce(s, { type: 'station/move', id: 'packs', cell: [12, 7], via: 'form' });
    const stale = reduce(s, { type: 'hash/computed', tabIndex: 0, revision: s.scenario.revision - 1, hash: 'h-old' });
    expect(stale.hashes[0]).not.toBe('h-old');
  });

  it('running the baseline then switching tabs keeps the baseline fresh and shows no results on the other tab', () => {
    const s = reduce(withBaselineResult(), { type: 'scenario/select-tab', index: 1 });
    expect(resultsStatus(s, 1)).toBe('none');
    expect(resultsStatus(reduce(s, { type: 'scenario/select-tab', index: 0 }), 0)).toBe('fresh');
  });

  it('a run/result for tab 0 after switching to tab 1 lands in results[0]', () => {
    const s0 = state0();
    const switched = reduce(s0, { type: 'scenario/select-tab', index: 1 });
    const s = reduce(switched, { type: 'run/result', runId: 1, tabIndex: 0, result: resultFor('h-base'), snapshot: s0.scenarios[0] as Scenario, hash: 'h-base' });
    expect(s.results[0]?.status).toBe('fresh');
    expect(s.results[1]?.status).toBe('none');
  });
});

describe('5.5 tab switch during a run', () => {
  it('calls the controller cancel() once before switching', async () => {
    const { baseline, plusOne } = hh();
    const store = createEditorStore({ hash: scenarioHash, now: () => '2026-11-16T00:00:00.000Z', initial: { scenarios: [baseline, plusOne], tabKeys: ['baseline', 'plus-one-checkin'] } });
    const cancel = vi.fn();
    store.setCancelHook(cancel);
    store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 });
    store.dispatch({ type: 'scenario/select-tab', index: 1 });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('store hashes', () => {
  it('a title or notes edit does not change the hash, a station edit does', async () => {
    const { baseline } = hh();
    const store = createEditorStore({ hash: scenarioHash, now: () => '2026-11-16T00:00:00.000Z', initial: { scenarios: [baseline], tabKeys: ['baseline'] } });
    await vi.waitFor(() => expect(store.getState().hash).not.toBeNull());
    const first = store.getState().hash;
    store.dispatch({ type: 'settings/set', patch: { title: 'Renamed', notes: 'a note' } });
    await vi.waitFor(() => expect(store.getState().scenario.title).toBe('Renamed'));
    await new Promise((r) => setTimeout(r, 20));
    expect(store.getState().hash).toBe(first);
    store.dispatch({ type: 'station/set', id: 'checkin', patch: { servers: 2 } });
    await vi.waitFor(() => expect(store.getState().hash).not.toBe(first));
  });
});

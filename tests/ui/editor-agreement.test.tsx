// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { FloorPlan } from '../../src/ui/floorplan/FloorPlan';
import { StationsTable } from '../../src/ui/plan/StationsTable';
import type { EditorStore } from '../../src/ui/state/store';
import type { EditorAction } from '../../src/ui/state/types';
import { makeStore, renderWith } from './render';

function expectAgreement(store: EditorStore): void {
  const scenario: Scenario = store.getState().scenario;
  for (const s of scenario.stations) {
    const x = screen.getByLabelText(`cell_x of ${s.id}`) as HTMLInputElement;
    const y = screen.getByLabelText(`cell_y of ${s.id}`) as HTMLInputElement;
    const marker = document.querySelector(`[data-station="${s.id}"]`);
    expect([Number(x.value), Number(y.value)]).toEqual(s.cell);
    expect(marker?.getAttribute('data-cell')).toBe(`${s.cell[0]},${s.cell[1]}`);
  }
  expect(document.querySelectorAll('[data-station]')).toHaveLength(scenario.stations.length);
}

describe('I1 agreement after every edit kind (requirement 3.1)', () => {
  const edits: [string, EditorAction][] = [
    ['move by drag', { type: 'station/move', id: 'packs', cell: [12, 7], via: 'drag' }],
    ['move by form', { type: 'station/move', id: 'checkin', cell: [11, 12], via: 'form' }],
    ['move by nudge', { type: 'station/move', id: 'checkin', cell: [11, 11], via: 'nudge' }],
    ['station add', { type: 'station/add' }],
    ['station set', { type: 'station/set', id: 'packs', patch: { servers: 4 } }],
    ['station rename', { type: 'station/rename', id: 'packs', newId: 'welcome' }],
    ['undo', { type: 'undo' }],
    ['redo', { type: 'redo' }],
  ];

  it('agrees on the first render', () => {
    const store = makeStore();
    renderWith(store, (s) => <><StationsTable store={s} /><FloorPlan store={s} /></>);
    expectAgreement(store);
  });

  it.each(edits)('agrees after %s', (_name, action) => {
    const store = makeStore();
    renderWith(store, (s) => <><StationsTable store={s} /><FloorPlan store={s} /></>);
    act(() => store.dispatch(action));
    expectAgreement(store);
  });

  it('agrees after a import/apply that replaces the stations', () => {
    const store = makeStore();
    renderWith(store, (s) => <><StationsTable store={s} /><FloorPlan store={s} /></>);
    const base = store.getState().scenario;
    const candidate: Scenario = { ...base, revision: base.revision + 1, stations: base.stations.map((s) => ({ ...s, cell: [s.cell[0] + 1, s.cell[1]] })) };
    act(() => store.dispatch({ type: 'import/apply', candidate, sources: ['stations.csv'] }));
    expectAgreement(store);
  });

  it('agrees after a refused move: nothing changed anywhere', () => {
    const store = makeStore();
    renderWith(store, (s) => <><StationsTable store={s} /><FloorPlan store={s} /></>);
    act(() => store.dispatch({ type: 'station/move', id: 'packs', cell: [16, 21], via: 'form' }));
    expectAgreement(store);
    expect(store.getState().scenario.stations[1]?.cell).toEqual([34, 12]);
  });
});

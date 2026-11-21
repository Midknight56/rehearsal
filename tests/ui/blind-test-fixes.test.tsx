// @vitest-environment jsdom
// Maintenance job "blind test fixes" (2026-11-20): the parts of the fixes that a component test can hold, beside the browser
// checks of tests/e2e/blind-test-fixes.spec.ts. docs/acceptance/blind-test-fixes-2026-11-20.md lists every report.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { buildRunSheetModel } from '../../src/exports/run-sheet';
import { ArrivalsTable } from '../../src/ui/plan/ArrivalsTable';
import { resetInvalidFieldsForTest } from '../../src/ui/plan/invalidFields';
import { StationsTable } from '../../src/ui/plan/StationsTable';
import { RunSheetView } from '../../src/ui/print/RunSheetView';
import type { RunController } from '../../src/ui/run/controller';
import { RunPanel } from '../../src/ui/run/RunPanel';
import type { EditorStore } from '../../src/ui/state/store';
import { harborHall } from './generators';
import { makeStore, renderWith } from './render';

afterEach(() => resetInvalidFieldsForTest());

const ready = (store: EditorStore) => waitFor(() => expect(store.getState().hashes.every((h) => h !== null)).toBe(true));
const fakeController = () => ({ start: vi.fn<RunController['start']>(() => 1), cancel: vi.fn<RunController['cancel']>(), activeRunId: () => null });

describe('Servers 0: Simulate never runs the old value', () => {
  it('a field marked in red blocks Simulate and names the field', async () => {
    const store = makeStore();
    await ready(store);
    const controller = fakeController();
    renderWith(store, (s) => (
      <>
        <StationsTable store={s} />
        <RunPanel store={s} controller={controller} />
      </>
    ));
    const servers = screen.getByRole('textbox', { name: 'servers of checkin' });
    fireEvent.change(servers, { target: { value: '0' } });
    fireEvent.blur(servers);
    expect(store.getState().scenario.stations.find((s) => s.id === 'checkin')?.servers).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    await waitFor(() => expect(store.getState().status).toMatch(/^Run blocked: servers of checkin holds a value the model cannot run/));
    expect(controller.start).not.toHaveBeenCalled();
    expect(within(screen.getByRole('group', { name: 'Run' })).getByText(/Fix the field marked in red/)).toBeTruthy();
  });

  it('once the field holds a value the model can run, Simulate starts the run', async () => {
    const store = makeStore();
    await ready(store);
    const controller = fakeController();
    renderWith(store, (s) => (
      <>
        <StationsTable store={s} />
        <RunPanel store={s} controller={controller} />
      </>
    ));
    const servers = screen.getByRole('textbox', { name: 'servers of checkin' });
    fireEvent.change(servers, { target: { value: '0' } });
    fireEvent.blur(servers);
    fireEvent.change(servers, { target: { value: '3' } });
    fireEvent.blur(servers);
    await ready(store);
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    await waitFor(() => expect(controller.start).toHaveBeenCalledTimes(1));
  });
});

describe('Compare picks read like the landing sentence', () => {
  it('the first tab is the baseline and the current tab the candidate', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'scenario/select-tab', index: 2 }));
    act(() => store.dispatch({ type: 'screen/set', screen: 'compare' }));
    expect(store.getState().compare.baselineKey).toBe('baseline');
    expect(store.getState().compare.candidateKey).toBe('shorter-route');
  });

  it('with the first tab current, the next tab is the candidate', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'screen/set', screen: 'compare' }));
    expect(store.getState().compare.baselineKey).toBe('baseline');
    expect(store.getState().compare.candidateKey).toBe('plus-one-checkin');
  });
});

describe('plain words under the tables', () => {
  it('Arrivals and Stations explain every column a first-time reader stops at', () => {
    const store = makeStore();
    renderWith(store, (s) => (
      <>
        <ArrivalsTable store={s} />
        <StationsTable store={s} />
      </>
    ));
    const arrivals = screen.getByRole('list', { name: 'What the arrivals columns mean' });
    for (const term of ['Cohort ID', 'Arrival pattern', 'Route']) expect(arrivals.textContent).toContain(term);
    const stations = screen.getByRole('list', { name: 'What the stations columns mean' });
    for (const term of ['Servers', 'Service min, mode and max (s)', 'Cell (x, y)']) expect(stations.textContent).toContain(term);
  });

  it('every data cell of the editing tables carries its column name for the phone layout', () => {
    const store = makeStore();
    renderWith(store, (s) => (
      <>
        <ArrivalsTable store={s} />
        <StationsTable store={s} />
      </>
    ));
    for (const name of ['Arrivals', 'Stations']) {
      const table = screen.getByRole('table', { name });
      const headers = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
      for (const row of table.querySelectorAll('tbody tr')) {
        expect([...row.querySelectorAll('td')].map((td) => td.getAttribute('data-label'))).toEqual(headers);
      }
    }
  });
});

describe('run sheet', () => {
  it('shows each table title once (the caption is for a screen reader) and names each table wrapper', async () => {
    const { baseline } = harborHall();
    const model = { ...buildRunSheetModel(baseline, await scenarioHash(baseline)), generatedAt: '2026-11-20T12:00:00.000Z' };
    renderWith(makeStore(), () => <RunSheetView model={model} results="Results: none yet." />);
    for (const caption of document.querySelectorAll('#run-sheet caption')) expect(caption.className).toBe('visually-hidden');
    expect(screen.getByRole('group', { name: 'Cohorts table' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: ' table' })).toBeNull();
  });

  it('keeps the whole hash in the text of the hash line', async () => {
    const { baseline } = harborHall();
    const hash = await scenarioHash(baseline);
    const model = { ...buildRunSheetModel(baseline, hash), generatedAt: '2026-11-20T12:00:00.000Z' };
    renderWith(makeStore(), () => <RunSheetView model={model} results="Results: none yet." />);
    expect(document.querySelector('#run-sheet .hash-line')?.textContent).toBe(`Scenario hash: ${hash}`);
    expect(document.querySelectorAll('#run-sheet .hash-part')).toHaveLength(4);
  });
});

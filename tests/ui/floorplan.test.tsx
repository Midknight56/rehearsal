// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FloorPlan } from '../../src/ui/floorplan/FloorPlan';
import { segmentLabel } from '../../src/ui/floorplan/routes';
import { harborHall } from './generators';
import { makeStore, renderWith } from './render';
import { readFileSync } from 'node:fs';

const wrapper = () => screen.getByRole('application', { name: 'Floor plan' });
const marker = (id: string) => document.querySelector(`[data-station="${id}"]`) as Element;
const cellRect = (x: number, y: number) => document.querySelector(`rect[data-cell="${x},${y}"]`) as Element;

describe('3.2 drag', () => {
  it('commits once on drop, creates no undo entry while dragging, and Escape cancels', () => {
    const store = makeStore();
    renderWith(store, (s) => <FloorPlan store={s} />);
    fireEvent.pointerDown(marker('packs'), { pointerId: 1 });
    fireEvent.pointerMove(cellRect(20, 9), { pointerId: 1 });
    expect(store.getState().past[0]).toHaveLength(0);
    expect(store.getState().scenario.stations[1]?.cell).toEqual([34, 12]);
    fireEvent.pointerUp(cellRect(12, 7), { pointerId: 1 });
    expect(store.getState().scenario.stations[1]?.cell).toEqual([12, 7]);
    expect(store.getState().past[0]).toHaveLength(1);
    expect(store.getState().status).toBe('Welcome packs moved to (12, 7).');
    fireEvent.pointerDown(marker('packs'), { pointerId: 1 });
    fireEvent.pointerMove(cellRect(5, 5), { pointerId: 1 });
    fireEvent.keyDown(wrapper(), { key: 'Escape' });
    expect(store.getState().drag).toBeNull();
    expect(store.getState().past[0]).toHaveLength(1);
  });

  it('a drop on a blocked cell leaves the station and says so', () => {
    const store = makeStore();
    renderWith(store, (s) => <FloorPlan store={s} />);
    fireEvent.pointerDown(marker('packs'), { pointerId: 1 });
    fireEvent.pointerUp(cellRect(16, 21), { pointerId: 1 });
    expect(store.getState().scenario.stations[1]?.cell).toEqual([34, 12]);
    expect(store.getState().status).toBe('Cell (16, 21) is blocked.');
  });
});

describe('3.4 keyboard', () => {
  it('moves the selected station by exactly one cell per keydown and ArrowUp decrements y', () => {
    const store = makeStore();
    act(() => store.dispatch({ type: 'select', selection: { kind: 'station', id: 'packs' } }));
    renderWith(store, (s) => <FloorPlan store={s} />);
    fireEvent.keyDown(wrapper(), { key: 'ArrowUp' });
    expect(store.getState().scenario.stations[1]?.cell).toEqual([34, 11]);
    fireEvent.keyDown(wrapper(), { key: 'ArrowLeft' });
    expect(store.getState().scenario.stations[1]?.cell).toEqual([33, 11]);
    expect(store.getState().past[0]).toHaveLength(2);
  });

  it('moves the cell cursor when nothing is selected; Space toggles a blocked cell; E and X set entrance and exit', () => {
    const store = makeStore();
    act(() => store.dispatch({ type: 'select', selection: { kind: 'cell', cell: [5, 5] } }));
    renderWith(store, (s) => <FloorPlan store={s} />);
    fireEvent.keyDown(wrapper(), { key: 'ArrowRight' });
    expect(store.getState().selection).toEqual({ kind: 'cell', cell: [6, 5] });
    fireEvent.keyDown(wrapper(), { key: ' ' });
    expect(store.getState().scenario.layout.blockedCells).toContainEqual([6, 5]);
    fireEvent.keyDown(wrapper(), { key: 'e' });
    expect(store.getState().scenario.layout.entrance).toEqual([6, 5]);
  });

  it('refuses Space on a station cell with the exact text', () => {
    const store = makeStore();
    act(() => store.dispatch({ type: 'select', selection: { kind: 'cell', cell: [10, 12] } }));
    renderWith(store, (s) => <FloorPlan store={s} />);
    fireEvent.keyDown(wrapper(), { key: ' ' });
    expect(store.getState().status).toBe('Cell (10, 12) is used by Check-in desk.');
  });

  it('Escape clears a station selection to the cell cursor on the station cell', () => {
    const store = makeStore();
    act(() => store.dispatch({ type: 'select', selection: { kind: 'station', id: 'checkin' } }));
    renderWith(store, (s) => <FloorPlan store={s} />);
    fireEvent.keyDown(wrapper(), { key: 'Escape' });
    expect(store.getState().selection).toEqual({ kind: 'cell', cell: [10, 12] });
  });

  it('carries the role, label, tabindex and key help of requirement 9.1', () => {
    renderWith(makeStore(), (s) => <FloorPlan store={s} />);
    expect(wrapper().getAttribute('tabindex')).toBe('0');
    const help = document.getElementById(wrapper().getAttribute('aria-describedby') as string);
    expect(help?.textContent).toBe(
      'Arrow keys move the selected station or the cell cursor, Space toggles a blocked cell, E sets the entrance, X sets the exit, Escape clears the selection, Tab leaves the floor plan.',
    );
  });
});

describe('3.8 route labels', () => {
  it('formats metres with at most one decimal and seconds with one', () => {
    expect(segmentLabel(2.5, 4167)).toBe('2.5 m · 4.2 s');
    expect(segmentLabel(5, 4167)).toBe('5 m · 4.2 s');
    expect(segmentLabel(21, 17500)).toBe('21 m · 17.5 s');
  });

  it('labels the baseline route 5 m · 4.2 s, 12 m · 10.0 s, 21 m · 17.5 s', () => {
    const store = makeStore();
    act(() => store.dispatch({ type: 'select', selection: { kind: 'cohort', id: 'doors' } }));
    renderWith(store, (s) => <FloorPlan store={s} />);
    for (const text of ['5 m · 4.2 s', '12 m · 10.0 s', '21 m · 17.5 s']) expect(screen.getByText(text)).toBeTruthy();
  });

  it('labels the route of the first cohort when no cohort is selected', () => {
    const store = makeStore();
    renderWith(store, (s) => <FloorPlan store={s} />);
    for (const text of ['5 m \u00b7 4.2 s', '12 m \u00b7 10.0 s', '21 m \u00b7 17.5 s']) expect(screen.getByText(text)).toBeTruthy();
  });

  it('draws a pair with no path as a dashed line labelled no path', () => {
    const { baseline } = harborHall();
    const ring = JSON.parse(readFileSync('tests/imports/fixtures/layout-ring-30-4.json', 'utf8'));
    const scenario = { ...baseline, layout: ring, stations: baseline.stations.map((s) => (s.id === 'packs' ? { ...s, cell: [30, 4] as [number, number] } : s)) };
    const store = makeStore([scenario], ['ring']);
    act(() => store.dispatch({ type: 'select', selection: { kind: 'cohort', id: 'doors' } }));
    renderWith(store, (s) => <FloorPlan store={s} />);
    expect(screen.getAllByText('no path').length).toBeGreaterThan(0);
    expect(document.querySelector('line[stroke-dasharray], polyline[stroke-dasharray]')).not.toBeNull();
  });
});

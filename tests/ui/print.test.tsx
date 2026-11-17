// @vitest-environment jsdom
// Task 15 (scenario-editor-and-replay), requirements 2.8, 8.1 to 8.6: the run sheet view over the one RunSheetModel, the Print screen,
// and the Plan screen controls Print run sheet and Export workbook.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { ASSUMPTIONS, LIMITS_TEXT, NOT_A_FORECAST } from '../../src/exports/assumptions-text';
import { buildRunSheetModel, renderRunSheet } from '../../src/exports/run-sheet';
import { simulate } from '../../src/simulation/simulate';
import { downloadBytes, downloadText } from '../../src/ui/download';
import { PrintControls } from '../../src/ui/print/PrintControls';
import { PrintScreen } from '../../src/ui/print/PrintScreen';
import { RunSheetView } from '../../src/ui/print/RunSheetView';
import { STALE_LABEL } from '../../src/ui/state/selectors';
import type { EditorStore } from '../../src/ui/state/store';
import { harborHall } from './generators';
import { makeStore, renderWith } from './render';

vi.mock('../../src/ui/download', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/ui/download')>();
  return { ...original, downloadText: vi.fn(), downloadBytes: vi.fn() };
});

const GENERATED = '2026-11-20T12:34:56.000Z';
const ready = (store: EditorStore) => waitFor(() => expect(store.getState().hashes.every((h) => h !== null)).toBe(true));

async function viewOf(scenario: Scenario, results = 'Results: none yet.'): Promise<{ hash: string; text: string }> {
  const hash = await scenarioHash(scenario);
  const model = { ...buildRunSheetModel(scenario, hash), generatedAt: GENERATED };
  renderWith(makeStore(), () => <RunSheetView model={model} results={results} />);
  return { hash, text: document.getElementById('run-sheet')?.textContent ?? '' };
}

describe('8.1, 8.2 the run sheet view shows the one model with the one rendering rule', () => {
  it('baseline: 4.167 s, 10.000 s, 17.500 s, 31.667 s, 38.0 m per attendee, 2.00 h, hash and model version', async () => {
    const { baseline } = harborHall();
    const { hash, text } = await viewOf(baseline);
    for (const s of ['4.167 s', '10.000 s', '17.500 s', '31.667 s', '38.0 m per attendee', 'Staff-hours: 2.00 h', `Scenario hash: ${hash}`, 'Model version: 0.1.0', '5.0 m', '17.0 m']) {
      expect(text).toContain(s);
    }
    expect(text).toContain(`${baseline.title} (run sheet)`);
    expect(text).toContain('Generated 2026-11-20 12:34');
    expect(text).toContain('checkin \u2192 packs');
    expect(text).toContain('Entrance \u2192 Check-in desk');
  });

  it('the shorter route and the extra-staff scenario', async () => {
    const { shorter, plusOne } = harborHall();
    const a = await viewOf(shorter);
    for (const s of ['4.167 s', '3.334 s', '7.500 s', '15.001 s', '18.0 m per attendee', 'Staff-hours: 2.00 h']) expect(a.text).toContain(s);
    document.body.innerHTML = '';
    const b = await viewOf(plusOne);
    expect(b.text).toContain('Staff-hours: 2.67 h');
  });

  it('prints the assumptions, the limits and the fixed sentence as the footer', async () => {
    const { text } = await viewOf(harborHall().baseline);
    for (const line of ASSUMPTIONS) expect(text).toContain(line);
    expect(text).toContain(LIMITS_TEXT);
    expect(text).toContain(NOT_A_FORECAST);
  });

  it('uses captioned tables with column headers and no live region of its own', async () => {
    await viewOf(harborHall().baseline);
    const tables = screen.getAllByRole('table');
    expect(tables.length).toBeGreaterThanOrEqual(4);
    for (const table of tables) {
      expect(table.querySelector('caption')?.textContent).toBeTruthy();
      expect(table.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0);
    }
    expect(document.querySelector('[aria-live], [role="status"]')).toBeNull();
  });

  it('shows every string of the generator document (8.4: one model, two renderings)', async () => {
    for (const scenario of Object.values(harborHall())) {
      document.body.innerHTML = '';
      const hash = await scenarioHash(scenario);
      const { html } = renderRunSheet(scenario, { generatedAt: GENERATED, scenarioHash: hash });
      const { text } = await viewOf(scenario);
      const parsed = new DOMParser().parseFromString(html, 'text/html');
      const cells = [...parsed.querySelectorAll('h1, h2, caption, th, td, li, p')].map((n) => n.textContent ?? '');
      expect(cells.length).toBeGreaterThan(30);
      const missing = cells.filter((cell) => !text.includes(cell));
      expect(missing).toEqual([]);
    }
  });

  it('shows a station label <script>alert(1)</script> as text, never as an element', async () => {
    const { baseline } = harborHall();
    const hostile = { ...baseline, stations: baseline.stations.map((s) => (s.id === 'checkin' ? { ...s, label: '<script>alert(1)</script>' } : s)) };
    const { text } = await viewOf(hostile);
    expect(text).toContain('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
  });

  it('puts the results line last of the sheet body and carries the label only there', async () => {
    const { baseline } = harborHall();
    await viewOf(baseline, `Results: ${STALE_LABEL}`);
    const sheet = document.getElementById('run-sheet') as HTMLElement;
    expect(sheet.textContent?.split(STALE_LABEL).length).toBe(2);
    const line = within(sheet).getByTestId('run-sheet-results');
    expect(line.textContent).toContain(STALE_LABEL);
    expect(sheet.querySelector('table')?.textContent).not.toContain(STALE_LABEL);
  });
});

describe('8.1, 8.3, 8.4, 8.6 the Print screen', () => {
  beforeEach(() => {
    vi.mocked(downloadText).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders the run sheet of the current tab with Print, Save as HTML and Back to plan', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'screen/set', screen: 'print' }));
    renderWith(store, (s) => <PrintScreen store={s} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Harbor Hall Community Fair: baseline (run sheet)');
    for (const name of ['Print', 'Save as HTML', 'Back to plan']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(document.getElementById('run-sheet')?.textContent).toContain('4.167 s');
  });

  it('Print calls window.print', async () => {
    const store = makeStore();
    await ready(store);
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderWith(store, (s) => <PrintScreen store={s} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('Save as HTML writes run-sheet-<hash8>.html with the generator document', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <PrintScreen store={s} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as HTML' }));
    const hash = store.getState().hash as string;
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [name, text, mime] = vi.mocked(downloadText).mock.calls[0] as [string, string, string];
    expect(name).toBe(`run-sheet-${hash.slice(0, 8)}.html`);
    expect(mime).toBe('text/html');
    expect(text.startsWith('<!doctype html>')).toBe(true);
    expect(text).toContain(hash);
    expect(text).toContain('4.167 s');
    expect(store.getState().status).toContain(`run-sheet-${hash.slice(0, 8)}.html`);
  });

  it('Save as HTML shows a hostile label escaped in the file', async () => {
    const { baseline } = harborHall();
    const hostile = { ...baseline, stations: baseline.stations.map((s) => (s.id === 'checkin' ? { ...s, label: '<script>alert(1)</script>' } : s)) };
    const store = makeStore([hostile], ['hostile']);
    await ready(store);
    renderWith(store, (s) => <PrintScreen store={s} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as HTML' }));
    const text = (vi.mocked(downloadText).mock.calls[0] as [string, string, string])[1];
    expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(text).not.toContain('<script');
  });

  it('Back to plan returns to the Plan screen', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'screen/set', screen: 'print' }));
    renderWith(store, (s) => <PrintScreen store={s} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Screen buttons' })).getByRole('button', { name: 'Back to plan' }));
    expect(store.getState().screen).toBe('plan');
  });

  it('needs no run: the results line says so, and then carries the stale label only after an edit', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <PrintScreen store={s} />);
    expect(screen.getByTestId('run-sheet-results').textContent).toContain('no run needed');
    expect(screen.getByTestId('run-sheet-results').textContent).not.toContain(STALE_LABEL);

    const snapshot = store.getState().scenario;
    const hash = (await scenarioHash(snapshot));
    act(() => store.dispatch({ type: 'run/result', runId: 1, tabIndex: 0, result: simulate(snapshot, 0, { trace: false, scenarioHash: hash }), snapshot, hash }));
    expect(screen.getByTestId('run-sheet-results').textContent).toContain('replication 0');
    expect(screen.getByTestId('run-sheet-results').textContent).not.toContain(STALE_LABEL);

    act(() => store.dispatch({ type: 'station/set', id: 'checkin', patch: { servers: 3 } }));
    await ready(store);
    await waitFor(() => expect(screen.getByTestId('run-sheet-results').textContent).toContain(STALE_LABEL));
    const sheet = document.getElementById('run-sheet') as HTMLElement;
    expect(sheet.textContent?.split(STALE_LABEL).length).toBe(2);
    for (const table of sheet.querySelectorAll('table')) expect(table.textContent).not.toContain(STALE_LABEL);
    expect(sheet.textContent).toContain('Staff-hours: 3.33 h');
  });
});

describe('8.6, 2.8 Print run sheet and Export workbook on the Plan screen', () => {
  beforeEach(() => {
    vi.mocked(downloadBytes).mockClear();
  });

  it('Print run sheet opens the Print screen', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <PrintControls store={s} />);
    fireEvent.click(screen.getByRole('button', { name: 'Print run sheet' }));
    expect(store.getState().screen).toBe('print');
  });

  it('Print run sheet stays focusable with aria-disabled and the 4.4 message while a route has no path', async () => {
    const { baseline } = harborHall();
    // A wall of blocked cells at x = 20 splits the hall, so entrance to check-in is fine and check-in to packs is not.
    const wall = Array.from({ length: 24 }, (_, y) => [20, y] as [number, number]);
    const blocked: Scenario = { ...baseline, layout: { ...baseline.layout, blockedCells: wall } };
    const store = makeStore([blocked], ['blocked']);
    await ready(store);
    renderWith(store, (s) => <PrintControls store={s} />);
    const button = screen.getByRole('button', { name: 'Print run sheet' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.hasAttribute('disabled')).toBe(false);
    const message = 'Run blocked: no path from Check-in desk (checkin) to Welcome packs (packs). Clear a corridor on the floor plan or move a station.';
    expect(document.body.textContent).toContain(message);
    fireEvent.click(button);
    expect(store.getState().screen).not.toBe('print');
    expect(store.getState().status).toBe(message);
  });

  it('Export workbook saves <title-slug>-<hash8>.xlsx with the workbook bytes of the current scenario', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <PrintControls store={s} />);
    fireEvent.click(screen.getByTestId('export-workbook'));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1));
    const hash = store.getState().hash as string;
    const [name, bytes, mime] = vi.mocked(downloadBytes).mock.calls[0] as [string, Uint8Array, string];
    expect(name).toBe(`harbor-hall-community-fair-baseline-${hash.slice(0, 8)}.xlsx`);
    expect(mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x50, 0x4b]);
    await waitFor(() => expect(store.getState().status).toContain(name));
  });
});

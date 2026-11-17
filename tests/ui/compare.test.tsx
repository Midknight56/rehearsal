// @vitest-environment jsdom
// Task 18, requirements 12.1 to 12.6. The Compare screen runs the real comparison through the in-process client of
// tests/comparison (the engine, no worker) and a fake game view; every string is read from src/comparison/labels.ts.
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  COMPLETE_TEXT, COMBINED_NOTE, PER_PERSON_OFF, RANGE_LABEL, REPLAY_NOTE, STALE_TEXT, changesHeader, loadingReplicationText,
  replayLabel, restoredSummaryText, saveErrorText, timingText,
} from '../../src/comparison/labels';
import { formatChange } from '../../src/comparison/paired';
import { GHOST_LEGEND } from '../../src/comparison/replay-contract';
import { toComparisonSummary } from '../../src/comparison/summary';
import { LAYER_CAP, splitLayers } from '../../src/replay/ghost';
import type { Sample } from '../../src/replay/sampler';
import { CompareScreen } from '../../src/ui/compare/CompareScreen';
import { createCompareController, type CompareController } from '../../src/ui/compare/controller';
import { STALE_LABEL } from '../../src/ui/state/selectors';
import type { EditorStore } from '../../src/ui/state/store';
import { createInProcessClient, type InProcessOptions } from '../comparison/helpers/in-process-client';
import { createFakeGameView, type FakeGameView } from './fakeGameView';
import { makeStore, renderWith } from './render';

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failSet: string | null = null;
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void {
    if (this.failSet !== null) throw new DOMException('failed', this.failSet);
    this.data.set(key, value);
  }
}

type Mounted = { store: EditorStore; controller: CompareController; view: FakeGameView; storage: MemoryStorage; client: ReturnType<typeof createInProcessClient> };

async function mount(options: InProcessOptions = {}): Promise<Mounted> {
  const store = makeStore();
  const client = createInProcessClient(options);
  const controller = createCompareController(client, store);
  const view = createFakeGameView();
  const storage = new MemoryStorage();
  await waitFor(() => expect(store.getState().hashes.every((h) => h !== null)).toBe(true));
  act(() => store.dispatch({ type: 'screen/set', screen: 'compare' }));
  renderWith(store, (s) => (
    <CompareScreen store={s} controller={controller} storage={storage} createView={async () => ({ ok: true as const, handle: view })} />
  ));
  return { store, controller, view, storage, client };
}

const pickPlusOne = (): void => {
  fireEvent.click(screen.getByTestId('pick-baseline-baseline'));
  fireEvent.click(screen.getByTestId('pick-candidate-plus-one-checkin'));
};
const status = (): string => screen.getByTestId('compare-status').textContent ?? '';
const runToComplete = async (): Promise<void> => {
  pickPlusOne();
  fireEvent.click(screen.getByTestId('run-comparison'));
  await waitFor(() => expect(status()).toBe(COMPLETE_TEXT), { timeout: 60_000 });
};

describe('12.1 the screen and its picks', () => {
  it('STALE_TEXT is the one stale label of the app', () => {
    expect(STALE_TEXT).toBe(STALE_LABEL);
  });

  it('preselects the current tab as candidate and the first other tab as baseline, one toggle pair per tab', async () => {
    await mount();
    expect(screen.getByTestId('pick-candidate-baseline').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('pick-baseline-plus-one-checkin').getAttribute('aria-pressed')).toBe('true');
    for (const key of ['baseline', 'plus-one-checkin', 'shorter-route']) {
      expect(screen.getByTestId(`pick-baseline-${key}`)).toBeTruthy();
      expect(screen.getByTestId(`pick-candidate-${key}`)).toBeTruthy();
    }
    expect(within(screen.getByRole('group', { name: 'Screen buttons' })).getByRole('button', { name: 'Back to plan' })).toBeTruthy();
  });

  it('keeps run-comparison focusable with aria-disabled while the picks are equal', async () => {
    await mount();
    fireEvent.click(screen.getByTestId('pick-baseline-baseline'));
    const run = screen.getByTestId('run-comparison');
    expect(run.getAttribute('aria-disabled')).toBe('true');
    expect(run.hasAttribute('disabled')).toBe(false);
  });
});

describe('12.2 a complete comparison', () => {
  it('renders the change list, cards, hashes, tables, timing and the one export control of this task', async () => {
    const { store, view } = await mount();
    await runToComplete();
    const list = screen.getByTestId('change-list');
    expect(list.tagName).toBe('OL');
    expect(list.getAttribute('data-kind')).toBe('single');
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Station "Check-in desk": servers 1 → 2']);
    expect(screen.getByText(changesHeader('single', 1))).toBeTruthy();
    expect(screen.queryByTestId('population-change')).toBeNull();
    expect(screen.queryByText(COMBINED_NOTE)).toBeNull();

    const hashes = store.getState().hashes;
    expect(screen.getByTestId('scenario-hash-baseline').textContent).toContain(hashes[0] as string);
    expect(screen.getByTestId('scenario-hash-candidate').textContent).toContain(hashes[1] as string);
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);

    const card = screen.getByTestId('metric-card-queueWait.mean');
    const metric = store.getState().compare.comparison?.metrics.find((m) => m.key === 'queueWait.mean');
    expect(metric?.n).toBe(30);
    expect(card.querySelector('[data-field=mean-change]')?.textContent).toBe(formatChange(metric?.meanChange ?? null, 'ms'));
    expect(card.querySelector('[data-field=range]')?.textContent).toMatch(new RegExp(`^.+ to .+, ${RANGE_LABEL}$`));
    expect(card.querySelector('[data-field=runs]')?.textContent).toMatch(
      /^Candidate had lower mean queue wait in \d+ of 30 runs; the same simulated attendees and random draws were used in both\.$/,
    );
    expect(card.textContent).toContain('n = 30');
    expect(screen.getByTestId('metric-card-staffHours').querySelector('[data-field=runs]')?.textContent).toMatch(/^No better direction is defined/);

    expect(screen.getByRole('table', { name: 'Stations compared' })).toBeTruthy();
    expect(screen.getByText(/^30 paired runs took [\d.]+ s on this device$/)).toBeTruthy();
    expect(screen.getByTestId('export-scenario-json')).toBeTruthy();
    for (const id of ['export-results-csv', 'export-comparison-csv', 'export-workbook', 'open-printable-comparison', 'open-run-sheet']) {
      expect(screen.queryByTestId(id), `${id} is rendered once task 15 has run`).not.toBeNull();
    }
    await waitFor(() => expect(view.callsOf('load').length).toBe(1));
    expect(store.getState().status).toBe(COMPLETE_TEXT);
  });

  it('every label shown comes from src/comparison/labels.ts', async () => {
    const { store } = await mount();
    await runToComplete();
    expect(screen.getByTestId('replay-label').textContent).toBe(replayLabel(0));
    expect(screen.getByTestId('ghost-legend').textContent).toBe(GHOST_LEGEND);
    expect(screen.getByTestId('replay-note').textContent).toBe(REPLAY_NOTE);
    expect(screen.getByTestId('replay-layer-baseline').getAttribute('data-replication')).toBe('0');
    expect(screen.getByTestId('replay-layer-candidate').getAttribute('data-replication')).toBe('0');
    expect(screen.getByText(timingText(store.getState().compare.comparison?.timing.pairedMs ?? -1))).toBeTruthy();
  });

  it('a population change is highlighted and turns the runs sentences into group language', async () => {
    const { store } = await mount();
    act(() => store.dispatch({ type: 'scenario/select-tab', index: 1 }));
    act(() => store.dispatch({ type: 'cohort/set', id: 'doors', patch: { count: 130 } }));
    await waitFor(() => expect(store.getState().hashes[1]).not.toBeNull());
    await runToComplete();
    expect(screen.getByTestId('population-change').textContent).toContain('Cohort "doors": count 120 → 130 people');
    expect(screen.getByTestId('metric-card-queueWait.mean').querySelector('[data-field=runs]')?.textContent).toContain(
      'the attendee populations differ (120 vs 130 people)',
    );
  });
});

describe('12.3 cancelled, failed and stale', () => {
  it('shows the cancel message verbatim in compare-status and the status region', async () => {
    const { store } = await mount({ delayMs: 5 });
    pickPlusOne();
    fireEvent.click(screen.getByTestId('run-comparison'));
    await waitFor(() => expect(status()).toMatch(/^Running paired replications: \d+ of 62$/));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel comparison' }));
    await waitFor(() => expect(status()).toBe('Comparison cancelled.'), { timeout: 30_000 });
    expect(store.getState().status).toBe('Comparison cancelled.');
    expect(screen.queryByTestId('change-list')).toBeNull();
  });

  it('shows Stale, rerun after an edit, keeps the cards readable and enables run-comparison again', async () => {
    const { store } = await mount();
    await runToComplete();
    act(() => store.dispatch({ type: 'scenario/select-tab', index: 0 }));
    act(() => store.dispatch({ type: 'station/set', id: 'checkin', patch: { servers: 2 } }));
    await waitFor(() => expect(status()).toBe(STALE_TEXT));
    expect(screen.getByTestId('change-list')).toBeTruthy();
    expect(screen.getByTestId('run-comparison').getAttribute('aria-disabled')).toBeNull();
  });
});

describe('12.4 the replay layers', () => {
  it('loads the candidate trace and the baseline ghost on one clock', async () => {
    const { view } = await mount();
    await runToComplete();
    await waitFor(() => expect(view.callsOf('load').length).toBe(1));
    const [load] = view.callsOf('load');
    const input = load?.[0] as { label: string; endMs: number; trace: unknown };
    expect(input.label).toBe(replayLabel(0));
    expect(input.endMs).toBeGreaterThan(0);
    const [ghost] = view.callsOf('setGhost');
    expect(ghost?.[0]).toBeTruthy();
    expect(ghost?.[0]).not.toBe(input.trace);
  });

  it('splits 500 + 500: each layer draws at most LAYER_CAP and the rest is counted for badges', () => {
    const attendees = (prefix: string, n: number): Sample['attendees'] =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}#${String(i).padStart(4, '0')}`, phase: 'walking' as const, position: [1, 1] as [number, number] }));
    const mk = (prefix: string, n: number): Sample => ({ tMs: 0, attendees: attendees(prefix, n), perStation: {}, arrived: n, exited: 0 });
    const split = splitLayers(mk('c', 800), mk('b', 700));
    expect(LAYER_CAP).toBe(500);
    expect(split.candidate.drawn.length).toBe(500);
    expect(split.baseline.drawn.length).toBe(500);
    expect(split.candidate.drawn.length + split.baseline.drawn.length).toBeLessThanOrEqual(1000);
    expect(split.candidate.aggregated.reduce((n, g) => n + g.walking, 0)).toBe(300);
    expect(split.baseline.aggregated.reduce((n, g) => n + g.walking, 0)).toBe(200);
    const small = splitLayers(mk('c', 10), mk('b', 20));
    expect([small.candidate.drawn.length, small.baseline.drawn.length]).toEqual([10, 20]);
  });
});

describe('12.5 the replicate selector', () => {
  it('lists 0 to 29, keeps the previous selection until complete, then replaces both layers', async () => {
    const { view } = await mount();
    await runToComplete();
    const select = screen.getByTestId('replicate-select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(Array.from({ length: 30 }, (_, i) => String(i)));
    fireEvent.change(select, { target: { value: '7' } });
    await waitFor(() => expect(status()).toBe(loadingReplicationText(7)));
    expect(screen.getByTestId('replay-label').textContent).toBe(replayLabel(0));
    expect(screen.getByTestId('replay-layer-candidate').getAttribute('data-replication')).toBe('0');
    await waitFor(() => expect(screen.getByTestId('replay-layer-candidate').getAttribute('data-replication')).toBe('7'), { timeout: 30_000 });
    expect(screen.getByTestId('replay-layer-baseline').getAttribute('data-replication')).toBe('7');
    expect(screen.getByTestId('replay-label').textContent).toBe(replayLabel(7));
    expect(status()).toBe(COMPLETE_TEXT);
    await waitFor(() => expect(view.callsOf('load').length).toBe(2));
    expect(view.callsOf('setGhost').length).toBe(2);
  });
});

describe('12.6 save and restore', () => {
  it('stores toComparisonSummary under rehearsal.comparisons.v1 and restores it without replicate-select or replay', async () => {
    const { store, storage } = await mount();
    await runToComplete();
    fireEvent.click(screen.getByTestId('save-scenario'));
    await waitFor(() => expect(storage.getItem('rehearsal.comparisons.v1')).not.toBeNull());
    const raw = storage.getItem('rehearsal.comparisons.v1') as string;
    const saved = JSON.parse(raw) as { version: number; summaries: { key: string }[] };
    expect(saved.version).toBe(1);
    expect(saved.summaries).toHaveLength(1);
    expect(raw).not.toContain('"differences"');
    expect(raw).not.toContain('"segments"');
    const comparison = store.getState().compare.comparison;
    expect(saved.summaries[0]?.key).toBe(comparison?.key);

    act(() => store.dispatch({ type: 'compare/restore', summary: toComparisonSummary(comparison as NonNullable<typeof comparison>) }));
    expect(screen.queryByTestId('replicate-select')).toBeNull();
    expect(screen.queryByTestId('replay-label')).toBeNull();
    expect(status()).toBe(restoredSummaryText((comparison as NonNullable<typeof comparison>).createdAt));
    expect(screen.getByTestId('change-list')).toBeTruthy();
    expect(screen.getByTestId('metric-card-queueWait.mean')).toBeTruthy();
    expect(screen.getByTestId('run-comparison').getAttribute('aria-disabled')).toBeNull();
  });

  it('a failed save shows the reason text and leaves the comparison on screen', async () => {
    const { store, storage } = await mount();
    await runToComplete();
    storage.failSet = 'QuotaExceededError';
    fireEvent.click(screen.getByTestId('save-scenario'));
    expect(screen.getByTestId('save-error').textContent).toBe(saveErrorText('quota'));
    expect(store.getState().status).toBe(saveErrorText('quota'));
    expect(screen.getByTestId('change-list')).toBeTruthy();
  });
});

describe('PER_PERSON_OFF', () => {
  it('is the one sentence used when the populations differ', () => {
    expect(PER_PERSON_OFF).toBe('Per-person comparison is off because the attendee populations differ.');
  });
});

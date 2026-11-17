// @vitest-environment jsdom
import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { formatMetricValue } from '../../src/simulation/metrics';
import { simulate, type RunResult } from '../../src/simulation/simulate';
import { ResultTables } from '../../src/ui/results/ResultTables';
import { STALE_LABEL } from '../../src/ui/state/selectors';
import type { EditorStore } from '../../src/ui/state/store';
import { harborHall } from './generators';
import { makeStore, renderWith } from './render';

const load = async (store: EditorStore, result?: RunResult): Promise<RunResult> => {
  const snapshot = store.getState().scenario;
  const hash = await scenarioHash(snapshot);
  const r = result ?? simulate(snapshot, 0, { trace: false, scenarioHash: hash });
  act(() => {
    store.dispatch({ type: 'hash/computed', tabIndex: 0, revision: snapshot.revision, hash });
    store.dispatch({ type: 'run/result', runId: 1, tabIndex: 0, result: r, snapshot, hash });
  });
  return r;
};

describe('result tables (requirement 9.1, plan section 7)', () => {
  it('renders every headline metric through formatMetricValue with its unit and N', async () => {
    const store = makeStore();
    renderWith(store, (s) => <ResultTables store={s} />);
    const r = await load(store);
    const text = document.body.textContent ?? '';
    for (const m of [r.metrics.completedByClosing, r.metrics.queueWait.mean, r.metrics.queueWait.p95, r.metrics.journeyTime.mean, r.metrics.walkingTime.mean, r.metrics.staffHours]) {
      expect(text).toContain(formatMetricValue(m));
    }
    expect(text).toContain('2.00 h');
    expect(text).toMatch(/n = 120|N = 120/i);
    expect(screen.getAllByRole('table').every((t) => t.querySelector('caption') !== null)).toBe(true);
  });

  it('shows — for an undefined average and never 0 or NaN', async () => {
    const { baseline } = harborHall();
    const empty = { ...baseline, cohorts: baseline.cohorts.map((c) => ({ ...c, count: 0 })) };
    const store = makeStore([empty], ['empty']);
    renderWith(store, (s) => <ResultTables store={s} />);
    const r = await load(store);
    expect(r.metrics.queueWait.mean.value).toBeNull();
    expect(document.body.textContent).toContain('—');
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('marks a conditioned value with * and its note', async () => {
    const store = makeStore();
    renderWith(store, (s) => <ResultTables store={s} />);
    const base = simulate(store.getState().scenario, 0, { trace: false, scenarioHash: await scenarioHash(store.getState().scenario) });
    const note = 'from 100 of 120 admitted attendees; 20 unfinished at the drain cap';
    const mean = { ...base.metrics.queueWait.mean, value: 30_000, conditioned: true, note };
    await load(store, { ...base, completion: 'drain-capped', unfinished: ['doors#0001'], metrics: { ...base.metrics, queueWait: { ...base.metrics.queueWait, mean } } });
    expect(document.body.textContent).toContain('30.0 s*');
    expect(document.body.textContent).toContain(note);
  });
});

describe('Stale — rerun label (4.3)', () => {
  it('follows results.status: absent while fresh, present after an edit changes the hash, gone after undo', async () => {
    const store = makeStore();
    renderWith(store, (s) => <ResultTables store={s} />);
    await load(store);
    expect(within(document.body).queryByText(STALE_LABEL)).toBeNull();
    act(() => store.dispatch({ type: 'station/set', id: 'checkin', patch: { servers: 2 } }));
    const edited = store.getState().scenario;
    act(() => store.dispatch({ type: 'hash/computed', tabIndex: 0, revision: edited.revision, hash: 'edited-hash' }));
    expect(screen.getAllByText(STALE_LABEL).length).toBeGreaterThan(0);
    act(() => store.dispatch({ type: 'undo' }));
    const restored = await scenarioHash(store.getState().scenario);
    act(() => store.dispatch({ type: 'hash/computed', tabIndex: 0, revision: store.getState().scenario.revision, hash: restored }));
    expect(within(document.body).queryByText(STALE_LABEL)).toBeNull();
  });
});

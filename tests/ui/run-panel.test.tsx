// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { simulate, type RunResult } from '../../src/simulation/simulate';
import type { RunController } from '../../src/ui/run/controller';
import { RunPanel } from '../../src/ui/run/RunPanel';
import { harborHall } from './generators';
import { makeStore, renderWith } from './render';

const fakeController = () => {
  const start = vi.fn<RunController['start']>(() => 1);
  const cancel = vi.fn<RunController['cancel']>();
  return { start, cancel, activeRunId: () => null };
};

const realResult = async (): Promise<RunResult> => {
  const { baseline } = harborHall();
  return simulate(baseline, 0, { trace: false, scenarioHash: await scenarioHash(baseline) });
};

describe('5.1 Simulate and Cancel', () => {
  it('Simulate starts a run on the current tab with its snapshot and hash', async () => {
    const store = makeStore();
    const controller = fakeController();
    renderWith(store, (s) => <RunPanel store={s} controller={controller} />);
    await vi.waitFor(() => expect(store.getState().hash).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    expect(controller.start).toHaveBeenCalledWith(store.getState().scenario, store.getState().hash, 0);
  });

  it('while running: Simulate is aria-disabled (never disabled), Cancel appears and progress text updates', () => {
    const store = makeStore();
    renderWith(store, (s) => <RunPanel store={s} controller={fakeController()} />);
    act(() => store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 }));
    const simulateButton = screen.getByRole('button', { name: 'Simulate' });
    expect(simulateButton.getAttribute('aria-disabled')).toBe('true');
    expect(simulateButton.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByText('Simulating… 0 of 1')).toBeTruthy();
    act(() => store.dispatch({ type: 'run/progress', runId: 1, done: 1, total: 1 }));
    expect(screen.getByText('Simulating… 1 of 1')).toBeTruthy();
  });

  it('Simulate during a run cancels the run (5.5)', () => {
    const store = makeStore();
    const controller = fakeController();
    renderWith(store, (s) => <RunPanel store={s} controller={controller} />);
    act(() => store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Simulate' }));
    expect(controller.cancel).toHaveBeenCalledTimes(1);
    expect(controller.start).not.toHaveBeenCalled();
  });

  it('Cancel calls the controller and shows Cancelling…', () => {
    const store = makeStore();
    const controller = fakeController();
    renderWith(store, (s) => <RunPanel store={s} controller={controller} />);
    act(() => store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(controller.cancel).toHaveBeenCalledTimes(1);
    act(() => store.dispatch({ type: 'run/cancelling', runId: 1 }));
    expect(screen.getByText('Cancelling…')).toBeTruthy();
  });
});

describe('5.2 and 5.3 outcomes', () => {
  it('announces completion with the attendee count, replication and hash prefix', async () => {
    const store = makeStore();
    renderWith(store, (s) => <RunPanel store={s} controller={fakeController()} />);
    const result = await realResult();
    act(() => {
      store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 });
      store.dispatch({ type: 'run/result', runId: 1, tabIndex: 0, result, snapshot: store.getState().scenario, hash: result.scenarioHash });
      store.dispatch({ type: 'run/finished', runId: 1, outcome: 'complete' });
    });
    expect(store.getState().status).toBe(`Run complete: 120 attendees, replication 0, hash ${result.scenarioHash.slice(0, 8)}.`);
    expect(screen.getByRole('button', { name: 'Simulate' }).getAttribute('aria-disabled')).not.toBe('true');
  });

  it('appends the unfinished count for a drain-capped result', async () => {
    const store = makeStore();
    renderWith(store, (s) => <RunPanel store={s} controller={fakeController()} />);
    const result = { ...(await realResult()), completion: 'drain-capped' as const, unfinished: ['doors#0001', 'doors#0002', 'doors#0003'] };
    act(() => {
      store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 });
      store.dispatch({ type: 'run/result', runId: 1, tabIndex: 0, result, snapshot: store.getState().scenario, hash: result.scenarioHash });
      store.dispatch({ type: 'run/finished', runId: 1, outcome: 'complete' });
    });
    expect(store.getState().status).toBe(`Run complete: 120 attendees, replication 0, hash ${result.scenarioHash.slice(0, 8)}; 3 attendees unfinished at the drain cap.`);
  });

  it.each(['Simulation cancelled.', 'Simulation cancelled. The simulation worker did not respond within 250 ms and was restarted.'])(
    'a cancelled run says Run cancelled. in the status region and %s in the panel',
    (message) => {
      const store = makeStore();
      renderWith(store, (s) => <RunPanel store={s} controller={fakeController()} />);
      act(() => {
        store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 });
        store.dispatch({ type: 'run/finished', runId: 1, outcome: { cancelled: message } });
      });
      expect(store.getState().status).toBe('Run cancelled.');
      expect(screen.getByText(message)).toBeTruthy();
    },
  );
});

describe('4.4 and 4.5 messages', () => {
  it('shows a blocked route in the panel and the status text', () => {
    const store = makeStore();
    renderWith(store, (s) => <RunPanel store={s} controller={fakeController()} />);
    const message = 'Run blocked: no path from Check-in desk (checkin) to Welcome packs (packs). Clear a corridor on the floor plan or move a station.';
    act(() => store.dispatch({ type: 'run/blocked', message }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(store.getState().status).toBe(message);
  });

  it('shows Run failed: <message> and re-enables Simulate', () => {
    const store = makeStore();
    renderWith(store, (s) => <RunPanel store={s} controller={fakeController()} />);
    act(() => {
      store.dispatch({ type: 'run/started', runId: 1, tabIndex: 0 });
      store.dispatch({ type: 'run/finished', runId: 1, outcome: { error: 'Simulation failed: boom' } });
    });
    expect(screen.getByText('Run failed: Simulation failed: boom')).toBeTruthy();
    expect(store.getState().status).toBe('Run failed: Simulation failed: boom');
    expect(screen.getByRole('button', { name: 'Simulate' }).getAttribute('aria-disabled')).not.toBe('true');
  });
});

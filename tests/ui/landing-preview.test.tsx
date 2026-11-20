// @vitest-environment jsdom
// Landing preview (spec landing-preview, requirements 1 to 4): the landing loads the Harbor Hall files, replays replication 0
// in the game view and shows the paired result line. The game view and the port are the fakes of tests/ui.
import { readFileSync } from 'node:fs';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import { simulate } from '../../src/simulation/simulate';
import { Landing } from '../../src/ui/landing/Landing';
import { createEditorStore } from '../../src/ui/state/store';
import type { SimulationClient } from '../../src/workers/client';
import { createInProcessClient } from '../comparison/helpers/in-process-client';
import { createFakeGameView } from './fakeGameView';
import { createFakePort } from './fakePort';
import { makeLandingStore, renderWith } from './render';

const okFetch = (): typeof fetch =>
  vi.fn(async (url: string | URL | Request) => {
    const name = String(url).split('/').pop() as string;
    return new Response(readFileSync(`public/examples/harbor-hall/${name}`, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;

function setup(client: SimulationClient, options: { reduced?: boolean; fetchImpl?: typeof fetch } = {}) {
  const view = createFakeGameView();
  const createView = vi.fn(async () => ({ ok: true as const, handle: view }));
  const fetchImpl = options.fetchImpl ?? okFetch();
  const store = options.reduced
    ? createEditorStore({ hash: scenarioHash, now: () => '2026-11-20T00:00:00.000Z', prefs: { version: 1, motion: 'reduce' } })
    : makeLandingStore();
  const utils = renderWith(store, (s) => <Landing store={s} fetchImpl={fetchImpl} baseUrl="/" preview={{ client, createView }} />);
  return { view, createView, fetchImpl, store, ...utils };
}

const completeReplay = async (port: ReturnType<typeof createFakePort>): Promise<void> => {
  await waitFor(() => expect(port.runs.length).toBeGreaterThanOrEqual(1));
  const scenario = port.runs[0]!.scenario;
  const result = simulate(scenario, 0, { trace: true, scenarioHash: await scenarioHash(scenario) });
  await act(async () => port.runs[0]!.resolve({ status: 'complete', results: [result] }));
};

describe('4.1 no preview without the prop', () => {
  it('fetches nothing, runs nothing and draws no preview', () => {
    const fetchImpl = okFetch();
    renderWith(makeLandingStore(), (s) => <Landing store={s} fetchImpl={fetchImpl} baseUrl="/" />);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.queryByTestId('landing-preview')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('1.1 the replay', () => {
  it('fetches the three files once, runs replication 0 of the baseline with a trace and seeks to 04:00 and plays it at 4x', async () => {
    const port = createFakePort();
    const { view, fetchImpl } = setup(port);
    await waitFor(() => expect(port.runs.length).toBe(1));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(port.runs[0]!.scenario.title).toBe('Harbor Hall Community Fair: baseline');
    expect(port.runs[0]!.replications).toEqual([0]);
    expect(port.runs[0]!.options.trace).toBe(true);
    await completeReplay(port);
    await waitFor(() => expect(view.callsOf('load')).toHaveLength(1));
    const input = view.callsOf('load')[0]![0] as { trace: unknown; label: string };
    expect(input.trace).toBeDefined();
    expect(view.callsOf('play')).toHaveLength(1);
    expect(view.callsOf('pause')).toHaveLength(0);
    expect(view.callsOf('seek')).toEqual([[240000]]);
    expect(view.callsOf('setSpeed')).toEqual([[4]]);
    const order = view.calls.map((c) => c.method).filter((m) => ['load', 'seek', 'setSpeed', 'play'].includes(m));
    expect(order).toEqual(['load', 'seek', 'setSpeed', 'play']);
    expect(screen.getByTestId('landing-clock').textContent).toContain('04:00');
    expect(screen.getByTestId('landing-clock').textContent).toContain('playing at 4\u00d7');
  });

  it('shows the existing replay label, the legend and the fictional note, with no dash between words', async () => {
    const port = createFakePort();
    setup(port);
    await completeReplay(port);
    const panel = await screen.findByTestId('landing-preview');
    expect(panel.textContent).toContain('Replay of replication 0, one example run');
    expect(panel.textContent).toContain('Line colour shows simulated waiting, not measured crowd density.');
    expect(panel.textContent).toContain('fictional and illustrative');
    expect(panel.textContent).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('6 the loop between 04:00 and 16:00', () => {
  it('shows the real clock and speed, seeks back to 04:00 when the clock reports 16:00, and keeps playing', async () => {
    const port = createFakePort();
    const { view } = setup(port);
    await completeReplay(port);
    await waitFor(() => expect(view.callsOf('play')).toHaveLength(1));
    act(() => view.emitClock(252_000, true));
    expect(screen.getByTestId('landing-clock').textContent).toBe('Simulated time 04:12, playing at 4\u00d7');
    act(() => view.emitClock(959_900, true));
    expect(view.callsOf('seek')).toEqual([[240000]]);
    act(() => view.emitClock(960_000, true));
    expect(view.callsOf('seek')).toEqual([[240000], [240000]]);
    act(() => view.emitClock(1_000_000, true));
    expect(view.callsOf('seek')).toHaveLength(3);
    expect(view.callsOf('pause')).toHaveLength(0);
    expect(view.callsOf('play')).toHaveLength(1);
    expect(view.callsOf('setSpeed')).toEqual([[4]]);
  });

  it('destroys the view on unmount and no clock callback acts after it', async () => {
    const port = createFakePort();
    const { view, unmount } = setup(port);
    await completeReplay(port);
    await waitFor(() => expect(view.callsOf('play')).toHaveLength(1));
    unmount();
    expect(view.callsOf('destroy')).toHaveLength(1);
    const seeks = view.callsOf('seek').length;
    view.emitClock(960_000, true);
    expect(view.callsOf('seek')).toHaveLength(seeks);
  });

  it('under reduced motion it never loops: one seek to 05:00, paused', async () => {
    const port = createFakePort();
    const { view } = setup(port, { reduced: true });
    await completeReplay(port);
    await waitFor(() => expect(view.callsOf('load')).toHaveLength(1));
    act(() => view.emitClock(960_000, false));
    expect(view.callsOf('seek')).toEqual([[300000]]);
    expect(view.callsOf('play')).toHaveLength(0);
  });
});
describe('1.3 reduced motion', () => {
  it('loads one paused frame at 05:00 and never plays', async () => {
    const port = createFakePort();
    const { view } = setup(port, { reduced: true });
    await completeReplay(port);
    await waitFor(() => expect(view.callsOf('load')).toHaveLength(1));
    expect(view.callsOf('seek')).toEqual([[300000]]);
    expect(view.callsOf('pause').length).toBeGreaterThanOrEqual(1);
    expect(view.callsOf('play')).toHaveLength(0);
    expect(screen.getByTestId('landing-clock').textContent).toContain('05:00');
  });
});

describe('2 the result line', () => {
  it('is built from the paired result with compareHeadline', async () => {
    const client = createInProcessClient();
    const { view } = setup(client);
    const line = await screen.findByTestId('landing-result', undefined, { timeout: 90_000 });
    expect(line.textContent).toBe('One more check-in desk cuts the mean wait by 297.4 s. Lower in 30 of 30 paired runs.');
    expect(view.callsOf('play')).toHaveLength(1);
    expect(screen.getByTestId('landing-preview').getAttribute('data-paired')).toBe('done');
  }, 120_000);

  it('is not shown when the paired run fails, and the replay stays', async () => {
    const port = createFakePort();
    const { view } = setup(port);
    await completeReplay(port);
    await waitFor(() => expect(port.runs.length).toBe(2));
    await act(async () => port.runs[1]!.resolve({ status: 'error', message: 'worker lost' }));
    await waitFor(() => expect(screen.getByTestId('landing-preview').getAttribute('data-paired')).toBe('failed'));
    expect(screen.queryByTestId('landing-result')).toBeNull();
    expect(view.callsOf('play')).toHaveLength(1);
    expect(view.callsOf('destroy')).toHaveLength(0);
  });
});

describe('3 the landing keeps its job', () => {
  it('keeps the buttons in order with Try the community fair first, and the canvas is not a focus stop', async () => {
    const port = createFakePort();
    setup(port);
    await completeReplay(port);
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names[0]).toBe('Try the community fair');
    expect(names[1]).toBe('Import a spreadsheet or CSV');
    const picture = await screen.findByRole('img', { name: /community fair/i });
    expect(picture.getAttribute('tabindex')).toBeNull();
    expect(picture.querySelector('[tabindex]')).toBeNull();
    const described = picture.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    expect(document.getElementById(described as string)?.textContent?.length).toBeGreaterThan(20);
  });

  it('reuses the fetched files: Try the community fair makes no new request and opens the Plan screen', async () => {
    const port = createFakePort();
    const { fetchImpl, store } = setup(port);
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(port.runs.length).toBe(1));
    fireEvent.click(screen.getByTestId('try-community-fair'));
    await waitFor(() => expect(store.getState().screen).toBe('plan'));
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(store.getState().tabKeys).toEqual(['baseline', 'plus-one-checkin', 'shorter-route']);
  });

  it('shows the failure text on activation when a fetch fails, keeps the landing and draws no result line', async () => {
    const failing = vi.fn(async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const port = createFakePort();
    const { store } = setup(port, { fetchImpl: failing });
    const button = screen.getByTestId('try-community-fair');
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(store.getState().status).toBe('The community fair example could not be loaded (500). Reload the page, or import a spreadsheet.'));
    expect(store.getState().screen).toBe('landing');
    expect(port.runs).toHaveLength(0);
    expect(screen.queryByTestId('landing-result')).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe('4.3 unmount', () => {
  it('cancels the run in flight and destroys the view', async () => {
    const port = createFakePort();
    const { view, unmount } = setup(port);
    await waitFor(() => expect(port.runs.length).toBe(1));
    await waitFor(() => expect(within(screen.getByTestId('landing-preview')).queryByTestId('landing-canvas')).not.toBeNull());
    unmount();
    expect(port.cancelCalls).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(view.callsOf('destroy')).toHaveLength(1));
  });

  it('destroys the view once after a finished replay, and starts nothing after unmount', async () => {
    const port = createFakePort();
    const { view, unmount } = setup(port);
    await completeReplay(port);
    await waitFor(() => expect(port.runs.length).toBe(2));
    unmount();
    expect(view.callsOf('destroy')).toHaveLength(1);
    const runs = port.runs.length;
    await act(async () => port.runs[1]!.resolve({ status: 'cancelled', message: 'Simulation cancelled.' }));
    expect(port.runs.length).toBe(runs);
  });

  it('destroys a view that finishes starting after the unmount', async () => {
    const port = createFakePort();
    const view = createFakeGameView();
    let release: () => void = () => undefined;
    const createView = vi.fn(() => new Promise<{ ok: true; handle: typeof view }>((resolve) => { release = () => resolve({ ok: true, handle: view }); }));
    const { unmount } = renderWith(makeLandingStore(), (s) => <Landing store={s} fetchImpl={okFetch()} baseUrl="/" preview={{ client: port, createView }} />);
    await waitFor(() => expect(createView).toHaveBeenCalled());
    unmount();
    await act(async () => release());
    expect(view.callsOf('destroy')).toHaveLength(1);
  });
});

describe('4.4 a preview that cannot run does not break the landing', () => {
  it('keeps the landing, shows no result line and unmounts without an error when the client throws', async () => {
    const throwing = { ...createFakePort(), run: () => { throw new ReferenceError('Worker is not defined'); }, cancel: () => { throw new ReferenceError('Worker is not defined'); } } as unknown as SimulationClient;
    const { unmount } = setup(throwing);
    await waitFor(() => expect(screen.getByTestId('landing-preview').getAttribute('data-paired')).toBe('failed'));
    expect(screen.getByRole('heading', { level: 1, name: 'Rehearsal' })).toBeTruthy();
    expect(screen.queryByTestId('landing-result')).toBeNull();
    expect(() => unmount()).not.toThrow();
  });
});
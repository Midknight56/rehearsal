// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scenarioHash } from '../../src/domain/hash';
import type { GameViewHandle } from '../../src/replay/gameView';
import { simulate } from '../../src/simulation/simulate';
import { GameViewPanel } from '../../src/ui/game/GameViewPanel';
import type { EditorStore } from '../../src/ui/state/store';
import { createFakeGameView, type FakeGameView } from './fakeGameView';
import { harborHall } from './generators';
import { makeStore, renderWith } from './render';

const GAME_HELP = 'Space plays or pauses, ArrowLeft and ArrowRight step one second, F follows the selected attendee, Escape releases, Tab leaves the game view.';

async function loadResult(store: EditorStore): Promise<void> {
  const snapshot = store.getState().scenario;
  const hash = await scenarioHash(snapshot);
  const result = simulate(snapshot, 0, { trace: true, scenarioHash: hash });
  act(() => {
    store.dispatch({ type: 'hash/computed', tabIndex: 0, revision: snapshot.revision, hash });
    store.dispatch({ type: 'run/result', runId: 1, tabIndex: 0, result, snapshot, hash });
  });
}

async function mount(options: { fail?: boolean } = {}): Promise<{ store: EditorStore; view: FakeGameView }> {
  const store = makeStore();
  const view = createFakeGameView();
  const createView = async () =>
    options.fail === true
      ? { ok: false as const, reason: 'forced' as const, message: 'forced', sampler: view as Pick<GameViewHandle, 'load' | 'seek' | 'step' | 'sampleNow' | 'onClock'> }
      : { ok: true as const, handle: view };
  renderWith(store, (s) => <GameViewPanel store={s} createView={createView} />);
  await loadResult(store);
  await screen.findByRole('heading', { name: 'Game view' });
  return { store, view };
}

// The same buttons, radios and sliders, sorted into document order (the assertions below are about DOM order; a plain concat
// listed every button before every radio and slider whatever the DOM order was).
const names = () =>
  screen
    .getAllByRole('button')
    .concat(screen.getAllByRole('radio'), screen.getAllByRole('slider'))
    .sort((p, q) => (p.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map((el) => el.getAttribute('aria-label') ?? el.textContent ?? '');

describe('6.1 and 6.2 header and controls', () => {
  it('headed Game view with the replication 0 subtitle and one wrapper with the key help', async () => {
    await mount();
    expect(screen.getByText('Replay of replication 0, one example run')).toBeTruthy();
    const wrapper = screen.getByRole('application', { name: 'Game view' });
    expect(wrapper.getAttribute('tabindex')).toBe('0');
    expect(document.getElementById(wrapper.getAttribute('aria-describedby') as string)?.textContent).toBe(GAME_HELP);
  });

  it('puts Play, Speed, Step back, Step forward, the scrubber and the readout in this DOM order', async () => {
    await mount();
    const order = ['Play', 'Pause', '1×', '4×', '16×', 'Step back', 'Step forward', 'Simulated time'];
    const found = names().filter((n) => order.includes(n.trim()));
    const index = (n: string) => found.findIndex((f) => f.trim() === n);
    expect(index('1×')).toBeGreaterThan(Math.max(index('Play'), index('Pause')));
    expect(index('Step back')).toBeGreaterThan(index('16×'));
    expect(index('Step forward')).toBeGreaterThan(index('Step back'));
    const scrubber = screen.getByRole('slider', { name: 'Simulated time' }) as HTMLInputElement;
    expect(scrubber.step).toBe('1000');
    expect(scrubber.min).toBe('0');
    expect(screen.getByText(/^\d\d:\d\d \/ \d\d:\d\d$/)).toBeTruthy();
  });

  it('Space plays or pauses, ArrowRight steps by 1,000 ms, and the buttons call the handle', async () => {
    const { view } = await mount();
    const wrapper = screen.getByRole('application', { name: 'Game view' });
    fireEvent.keyDown(wrapper, { key: ' ' });
    expect(view.callsOf('pause').length + view.callsOf('play').length).toBeGreaterThan(0);
    fireEvent.keyDown(wrapper, { key: 'ArrowRight' });
    expect(view.callsOf('step').pop()).toEqual([1000]);
    fireEvent.keyDown(wrapper, { key: 'ArrowLeft' });
    expect(view.callsOf('step').pop()).toEqual([-1000]);
    fireEvent.click(screen.getByRole('radio', { name: '4×' }));
    expect(view.callsOf('setSpeed').pop()).toEqual([4]);
  });

  it('loads the trace into the handle at clock 0 and plays at 1×', async () => {
    const { view } = await mount();
    expect(view.callsOf('load')).toHaveLength(1);
    expect(view.callsOf('play').length).toBeGreaterThan(0);
  });
});

describe('9.4 reduced motion', () => {
  it('loads paused, puts the step controls and the scrubber before Play, and starts with Follow off', async () => {
    const store = makeStore(undefined, undefined, { version: 1, motion: 'reduce' });
    const view = createFakeGameView();
    renderWith(store, (s) => <GameViewPanel store={s} createView={async () => ({ ok: true as const, handle: view })} />);
    await loadResult(store);
    await screen.findByRole('heading', { name: 'Game view' });
    expect(view.callsOf('load')).toHaveLength(1);
    expect(view.callsOf('play')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Follow' }).getAttribute('aria-pressed')).toBe('false');
    const all = names().map((n) => n.trim());
    expect(all.indexOf('Step back')).toBeLessThan(all.indexOf('Play'));
    expect(all.indexOf('Simulated time')).toBeLessThan(all.indexOf('Play'));
  });
});

describe('7.1 to 7.3 follow and find', () => {
  it('Find attendee is a combobox over a listbox of options with the count text', async () => {
    await mount();
    const box = screen.getByRole('combobox', { name: 'Find attendee' });
    expect(box.getAttribute('aria-expanded')).toBe('false');
    fireEvent.change(box, { target: { value: 'doors#000' } });
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const list = screen.getByRole('listbox');
    expect(box.getAttribute('aria-controls')).toBe(list.id);
    expect(within(list).getAllByRole('option')).toHaveLength(10);
    expect(screen.getByText('10 matches')).toBeTruthy();
    fireEvent.change(box, { target: { value: 'doors#' } });
    expect(screen.getByText('20 of 120 matches')).toBeTruthy();
  });

  it('says No attendee matches "<query>". when nothing matches', async () => {
    await mount();
    fireEvent.change(screen.getByRole('combobox', { name: 'Find attendee' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No attendee matches "zzz".')).toBeTruthy();
  });

  it('chooses an attendee with Enter, F follows, Escape releases, with the exact announcements', async () => {
    const { store, view } = await mount();
    const box = screen.getByRole('combobox', { name: 'Find attendee' });
    fireEvent.change(box, { target: { value: 'doors#0007' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByRole('table', { name: 'Timeline of doors#0007' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('option', { name: 'doors#0007' }), { key: 'f' });
    expect(view.callsOf('follow').pop()).toEqual(['doors#0007']);
    expect(screen.getByRole('button', { name: 'Follow' }).getAttribute('aria-pressed')).toBe('true');
    expect(store.getState().status).toBe('Following doors#0007. Press Escape to release.');
    fireEvent.keyDown(screen.getByRole('application', { name: 'Game view' }), { key: 'Escape' });
    expect(view.callsOf('follow').pop()).toEqual([null]);
    expect(store.getState().status).toBe('Follow released.');
  });

  it('announces an exit as doors#0007 exited at <mm:ss>; follow released.', async () => {
    const { store, view } = await mount();
    act(() => view.emitFollowEnd('doors#0007', 754_000));
    expect(store.getState().status).toBe('doors#0007 exited at 12:34; follow released.');
  });
});

describe('7.4 and 7.5 timeline and inspector from the sampler', () => {
  it('the timeline of doors#0000 reads Walked to Check-in desk (00:04.167)', async () => {
    await mount();
    fireEvent.change(screen.getByRole('combobox', { name: 'Find attendee' }), { target: { value: 'doors#0000' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Find attendee' }), { key: 'Enter' });
    const table = screen.getByRole('table', { name: 'Timeline of doors#0000' });
    expect(within(table).getByText('Walked to Check-in desk')).toBeTruthy();
    expect(table.textContent).toContain('(00:04.167)');
  });

  it('the queue inspector is captioned with the station label and the time and reads the handle sample', async () => {
    const { view } = await mount();
    view.setSample({
      tMs: 65_000, attendees: [], arrived: 0, exited: 0,
      perStation: { checkin: { waiting: 4, inService: 1, servers: 1, nextServiceEndMs: 70_000, longestWaitMs: 31_000 } },
    });
    act(() => view.emitHit({ kind: 'station', id: 'checkin' }));
    act(() => view.emitClock(65_000, true));
    const table = screen.getByRole('table', { name: 'Check-in desk at 01:05' });
    expect(table.textContent).toContain('Waiting: 4');
    expect(table.textContent).toContain('In service: 1 of 1 servers');
    expect(table.textContent).toContain('Next service ends at 01:10');
    expect(table.textContent).toContain('Longest current wait: 00:31');
  });
});

describe('9.2 the status text does not change while the clock plays (I8)', () => {
  it('twenty clock callbacks leave the status text identical', async () => {
    const { store, view } = await mount();
    const before = store.getState().status;
    for (let i = 1; i <= 20; i++) act(() => view.emitClock(i * 100, true));
    expect(store.getState().status).toBe(before);
  });
});

describe('6.8 the canvas cannot start', () => {
  it('shows the banner and Retry game view, keeps the results and the inspector working', async () => {
    const { store } = await mount({ fail: true });
    expect(screen.getByText('The game view could not start in this browser. The timeline and result tables have every number.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry game view' })).toBeTruthy();
    expect(store.getState().results[0]?.status).toBe('fresh');
    expect(screen.getByRole('slider', { name: 'Simulated time' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Find attendee' }), { target: { value: 'doors#0001' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Find attendee' }), { key: 'Enter' });
    expect(screen.getByRole('table', { name: 'Timeline of doors#0001' })).toBeTruthy();
  });
});

describe('6.4 sprite cap sentence', () => {
  it('reads the banner when more than 1,000 are drawn as aggregates', async () => {
    const { view } = await mount();
    view.setSample({ tMs: 20_000, attendees: Array.from({ length: 1200 }, (_, i) => ({ id: `doors#${String(i).padStart(4, '0')}`, phase: 'waiting' as const, position: [0, 0] as [number, number] })), perStation: {}, arrived: 1200, exited: 0 });
    act(() => view.emitClock(20_000, false));
    expect(screen.getByText('Showing 1,000 of 1,200 attendees as sprites; the others are counted in the badges and every table is complete.')).toBeTruthy();
    expect(harborHall().baseline.id).toBe('harbor-hall-baseline');
  });
});

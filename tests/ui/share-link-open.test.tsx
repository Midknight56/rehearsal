// @vitest-environment jsdom
// Spec share-link, requirements 2 and 3: opening a share link on load and on hashchange, the review dialog for warnings, and the
// way a bad link stops without a crash.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app';
import { scenarioHash } from '../../src/domain/hash';
import type { Scenario } from '../../src/domain/scenario';
import { buildShareLink } from '../../src/exports/share-link';
import { readShareLink } from '../../src/imports/shareLink';
import { harborHall } from './generators';
import { makeLandingStore, makeStore } from './render';

const BASE = 'http://localhost:3000/';
const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(readFileSync(`public/examples/harbor-hall/${String(url).split('/').pop()}`, 'utf8'), { status: 200 })) as unknown as typeof fetch;

async function hashFor(scenario: Scenario): Promise<string> {
  const built = await buildShareLink(scenario, BASE);
  if (!built.ok) throw new Error('expected a link');
  return built.url.slice(built.url.indexOf('#'));
}
const setHash = (hash: string): void => window.history.replaceState(null, '', `/${hash}`);
const status = (): string => screen.getByRole('status').textContent ?? '';

beforeEach(() => setHash(''));
afterEach(() => setHash(''));

describe('2.1, 2.4, 2.5 a link that holds a clean plan', () => {
  it('opens on the Plan screen at once, says so, and clears the hash, even in StrictMode', async () => {
    const { plusOne } = harborHall();
    setHash(await hashFor(plusOne));
    const store = makeLandingStore();
    render(<StrictMode><App store={store} fetchImpl={fetchImpl} /></StrictMode>);
    await waitFor(() => expect(store.getState().screen).toBe('plan'));
    expect(store.getState().scenario.title).toBe(plusOne.title);
    await waitFor(async () => expect(store.getState().hashes[store.getState().currentIndex]).toBe(await scenarioHash(plusOne)));
    expect(status()).toBe(`Opened "${plusOne.title}".`);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.hash).toBe('');
    expect(store.getState().scenarios).toHaveLength(1);
  });

  it('replaces the open plan as one edit that Undo reverses', async () => {
    const { plusOne } = harborHall();
    const store = makeStore();
    const original = store.getState().scenario.title;
    render(<App store={store} fetchImpl={fetchImpl} />);
    act(() => setHash(''));
    window.location.hash = await hashFor(plusOne);
    await waitFor(() => expect(store.getState().scenario.title).toBe(plusOne.title));
    expect(store.getState().past[store.getState().currentIndex]).toHaveLength(1);
    act(() => store.dispatch({ type: 'undo' }));
    expect(store.getState().scenario.title).toBe(original);
  });
});

describe('2.3 a link that holds a plan with warnings', () => {
  it('shows the Open JSON review dialog, opens only after Open, and Cancel opens nothing', async () => {
    const old = { ...harborHall().baseline, modelVersion: '0.0.1' };
    const hash = await hashFor(old);
    const read = await readShareLink(hash);
    if (read === null || !read.ok) throw new Error('expected a plan');
    expect(read.warnings.length).toBeGreaterThan(0);

    setHash(hash);
    const store = makeLandingStore();
    const before = store.getState().scenarios;
    render(<App store={store} fetchImpl={fetchImpl} />);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(`${old.title}, hash ${read.hash.slice(0, 8)}, model ${old.modelVersion}`)).toBeTruthy();
    for (const warning of read.warnings) expect(within(dialog).getByText(warning.message)).toBeTruthy();
    expect(store.getState().screen).toBe('landing');
    expect(window.location.hash).toBe('');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(store.getState().screen).toBe('landing');
    expect(store.getState().scenarios).toBe(before);
  });

  it('Open loads the plan on the Plan screen', async () => {
    const old = { ...harborHall().baseline, modelVersion: '0.0.1' };
    setHash(await hashFor(old));
    const store = makeLandingStore();
    render(<App store={store} fetchImpl={fetchImpl} />);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(store.getState().screen).toBe('plan'));
    expect(store.getState().scenario.title).toBe(old.title);
    expect(status()).toBe(`Opened "${old.title}".`);
  });
});

describe('3 a link that stops safely', () => {
  const cases: Array<{ name: string; hash: () => Promise<string> | string; text: string | RegExp }> = [
    { name: 'damaged text', hash: () => '#plan=v1.@@@@', text: 'This share link is damaged, so no plan was opened. Ask for a new link, or open a JSON file.' },
    { name: 'not deflate data', hash: () => '#plan=v1.AAAA', text: 'This share link is damaged, so no plan was opened. Ask for a new link, or open a JSON file.' },
    { name: 'another version tag', hash: () => '#plan=v2.AAAA', text: 'This share link was made by a different version of Rehearsal, so no plan was opened.' },
    { name: 'a plan the app refuses', hash: async () => hashFor({ ...harborHall().baseline, layout: { ...harborHall().baseline.layout, cols: 0 } }), text: /^This share link holds a plan Rehearsal cannot open: / },
  ];
  for (const { name, hash, text } of cases) {
    it(`${name}: stays on the landing screen, says why, opens nothing`, async () => {
      setHash(await hash());
      const store = makeLandingStore();
      const before = store.getState().scenarios;
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      render(<App store={store} fetchImpl={fetchImpl} />);
      await waitFor(() => expect(status()).not.toBe(''));
      if (typeof text === 'string') expect(status()).toBe(text);
      else expect(status()).toMatch(text);
      expect(store.getState().screen).toBe('landing');
      expect(screen.getByRole('heading', { level: 1, name: 'Rehearsal' })).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store.getState().scenarios).toBe(before);
      expect(window.location.hash).toBe('');
      expect(errors).not.toHaveBeenCalled();
      errors.mockRestore();
    });
  }
});

describe('2.6 other hashes', () => {
  it('leaves them alone and writes no status', async () => {
    setHash('#top');
    const store = makeLandingStore();
    render(<App store={store} fetchImpl={fetchImpl} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(window.location.hash).toBe('#top');
    expect(status()).toBe('');
    expect(store.getState().screen).toBe('landing');
  });
});

describe('2.2 hashchange on the landing screen', () => {
  it('opens a link set while the page is open', async () => {
    const { shorter } = harborHall();
    const store = makeLandingStore();
    render(<App store={store} fetchImpl={fetchImpl} />);
    window.location.hash = await hashFor(shorter);
    await waitFor(() => expect(store.getState().screen).toBe('plan'));
    expect(store.getState().scenario.title).toBe(shorter.title);
  });
});

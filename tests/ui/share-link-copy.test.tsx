// @vitest-environment jsdom
// Spec share-link, requirement 1: the Copy share link button on the Plan screen and its status texts.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app';
import { SHARE_COPIED_TEXT, SHARE_COPY_FAILED_TEXT, SHARE_LINK_MAX_CHARS, SHARE_PREFIX, SHARE_TOO_LARGE_TEXT } from '../../src/exports/share-link';
import { readShareLink } from '../../src/imports/shareLink';
import type { EditorStore } from '../../src/ui/state/store';
import { harborHall } from './generators';
import { makeStore } from './render';
import { bigScenario } from './shareFixtures';

const ready = (store: EditorStore) => waitFor(() => expect(store.getState().hashes.every((h) => h !== null)).toBe(true));

function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('1.1 the button', () => {
  it('is named Copy share link and comes after Export JSON and Save in the toolbar', async () => {
    const store = makeStore();
    await ready(store);
    render(<App store={store} />);
    const share = screen.getByRole('button', { name: 'Copy share link' });
    const order = ['Export JSON', 'Save'].map((name) => screen.getByRole('button', { name }));
    for (const before of order) expect(before.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(share.hasAttribute('disabled')).toBe(false);
  });
});

describe('1.2, 1.3, 1.6 a plan that fits', () => {
  it('writes the link to the clipboard, says Share link copied and keeps focus on the button', async () => {
    const writes: string[] = [];
    stubClipboard(async (text) => { writes.push(text); });
    const store = makeStore();
    await ready(store);
    render(<App store={store} />);
    const button = screen.getByRole('button', { name: 'Copy share link' });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(store.getState().status).toBe(SHARE_COPIED_TEXT));
    expect(SHARE_COPIED_TEXT).toBe('Share link copied');
    expect(screen.getByRole('status').textContent).toBe('Share link copied');
    expect(writes).toHaveLength(1);
    const url = writes[0] as string;
    expect(url.startsWith(`${window.location.origin}${window.location.pathname}${SHARE_PREFIX}`)).toBe(true);
    expect(url.length).toBeLessThanOrEqual(SHARE_LINK_MAX_CHARS);
    const read = await readShareLink(url.slice(url.indexOf('#')));
    expect(read?.ok && read.scenario).toEqual(store.getState().scenario);
    expect(document.activeElement).toBe(button);
  });

  it('holds the plan as edited, not the plan as loaded', async () => {
    const writes: string[] = [];
    stubClipboard(async (text) => { writes.push(text); });
    const store = makeStore();
    await ready(store);
    render(<App store={store} />);
    act(() => store.dispatch({ type: 'station/set', id: 'checkin', patch: { servers: 3 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const url = writes[0] as string;
    const read = await readShareLink(url.slice(url.indexOf('#')));
    expect(read?.ok && read.scenario.stations.find((s) => s.id === 'checkin')?.servers).toBe(3);
  });
});

describe('1.4 a plan that is too large', () => {
  it('copies nothing and says to save a JSON file instead', async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    const store = makeStore([bigScenario()], ['big']);
    await ready(store);
    render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(store.getState().status).toBe(SHARE_TOO_LARGE_TEXT));
    expect(SHARE_TOO_LARGE_TEXT).toBe('This plan is too large to share as a link. Save it as a JSON file instead.');
    expect(writeText).not.toHaveBeenCalled();
  });
});

describe('1.5 a refused clipboard', () => {
  it('says so and leaves the plan alone', async () => {
    stubClipboard(async () => { throw new DOMException('denied', 'NotAllowedError'); });
    const store = makeStore();
    await ready(store);
    render(<App store={store} />);
    const before = store.getState().scenario;
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(store.getState().status).toBe(SHARE_COPY_FAILED_TEXT));
    expect(SHARE_COPY_FAILED_TEXT).toBe('The share link could not be copied. Save the plan as a JSON file instead.');
    expect(store.getState().scenario).toBe(before);
  });

  it('says so when the browser has no clipboard at all', async () => {
    Reflect.deleteProperty(navigator, 'clipboard');
    const store = makeStore();
    await ready(store);
    render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => expect(store.getState().status).toBe(SHARE_COPY_FAILED_TEXT));
  });
});

describe('4.2 text', () => {
  it('uses no dash between words in the share link texts', () => {
    for (const text of [SHARE_COPIED_TEXT, SHARE_COPY_FAILED_TEXT, SHARE_TOO_LARGE_TEXT]) expect(text).not.toMatch(/[\u2013\u2014]|\w-\w/);
    expect(harborHall().baseline.title.length).toBeGreaterThan(0);
  });
});

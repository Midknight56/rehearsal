// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Landing } from '../../src/ui/landing/Landing';
import { loadExample } from '../../src/ui/landing/loadExample';
import { makeLandingStore, makeStore, renderWith } from './render';

const FILES = ['baseline', 'plus-one-checkin', 'shorter-route'];
const okFetch = (): typeof fetch =>
  vi.fn(async (url: string | URL | Request) => {
    const name = String(url).split('/').pop() as string;
    return new Response(readFileSync(`public/examples/harbor-hall/${name}`, 'utf8'), { status: 200 });
  }) as unknown as typeof fetch;

describe('10.1 landing', () => {
  it('shows the heading, the pitch line and the local-data sentence without the unrecorded claim', () => {
    renderWith(makeStore(), (s) => <Landing store={s} fetchImpl={okFetch()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Rehearsal' })).toBeTruthy();
    expect(screen.getByText('A spreadsheet, a floor plan and a game engine, stitched into an event rehearsal.')).toBeTruthy();
    expect(screen.getByText('Everything runs in this browser.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('no account and nothing uploaded');
  });

  it('has Try the community fair first and Import a spreadsheet or CSV second, and no modal', () => {
    renderWith(makeStore(), (s) => <Landing store={s} fetchImpl={okFetch()} />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons.slice(0, 2)).toEqual(['Try the community fair', 'Import a spreadsheet or CSV']);
    expect(screen.getByRole('button', { name: 'Try the community fair' }).getAttribute('data-testid')).toBe('try-community-fair');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('10.2 the community fair example', () => {
  it('fetches the three files relative to the base, in order', async () => {
    const fetchImpl = okFetch();
    renderWith(makeStore(), (s) => <Landing store={s} fetchImpl={fetchImpl} baseUrl="/" />);
    fireEvent.click(screen.getByTestId('try-community-fair'));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(3));
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]))).toEqual(
      FILES.map((f) => `/examples/harbor-hall/${f}.json`),
    );
  });

  it('opens three tabs with the baseline current and the tab keys by example stem', async () => {
    const result = await loadExample(okFetch(), '/');
    expect(result.ok && result.tabKeys).toEqual(FILES);
    expect(result.ok && result.scenarios.map((s) => s.title)).toEqual([
      'Harbor Hall Community Fair: baseline',
      'Harbor Hall Community Fair: extra check-in staff',
      'Harbor Hall Community Fair: shorter walking route',
    ]);
  });

  it('opens the Plan screen with three tabs and the baseline current after the three fetches', async () => {
    const store = makeLandingStore();
    renderWith(store, (s) => <Landing store={s} fetchImpl={okFetch()} />);
    fireEvent.click(screen.getByTestId('try-community-fair'));
    await waitFor(() => expect(store.getState().screen).toBe('plan'));
    expect(store.getState().tabKeys).toEqual(FILES);
    expect(store.getState().scenario.title).toBe('Harbor Hall Community Fair: baseline');
    expect(store.getState().currentIndex).toBe(0);
  });

  it('keeps the landing screen and shows the failure text for a non-200 status', async () => {
    const failing = vi.fn(async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    const store = makeLandingStore();
    renderWith(store, (s) => <Landing store={s} fetchImpl={failing} />);
    const button = screen.getByTestId('try-community-fair');
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(store.getState().status).toBe('The community fair example could not be loaded (500). Reload the page, or import a spreadsheet.'));
    expect(document.activeElement).toBe(button);
    expect(store.getState().screen).toBe('landing');
  });

  it('names the error for a network failure and for a file that is not a scenario', async () => {
    const network = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await loadExample(network, '/')).toEqual({ ok: false, message: 'The community fair example could not be loaded (TypeError). Reload the page, or import a spreadsheet.' });
    const junk = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const result = await loadExample(junk, '/');
    expect(result.ok).toBe(false);
    act(() => undefined);
  });
});

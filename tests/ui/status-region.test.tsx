// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app';
import { StatusRegion } from '../../src/ui/StatusRegion';
import { makeStore, renderWith } from './render';

describe('9.2 the one status region', () => {
  it('is a role="status" element that shows the store status text', () => {
    const store = makeStore();
    renderWith(store, (s) => <StatusRegion store={s} />);
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => store.setStatus('Imported 1 cohorts and 2 stations from stations.csv.'));
    expect(screen.getByRole('status').textContent).toBe('Imported 1 cohorts and 2 stations from stations.csv.');
    act(() => store.setStatus('Run cancelled.'));
    expect(screen.getByRole('status').textContent).toBe('Run cancelled.');
  });

  it('changes only through setStatus: dispatching other actions leaves the text alone', () => {
    const store = makeStore();
    renderWith(store, (s) => <StatusRegion store={s} />);
    act(() => store.setStatus('Hello'));
    act(() => store.dispatch({ type: 'select', selection: { kind: 'station', id: 'packs' } }));
    act(() => store.dispatch({ type: 'replay-clock' } as never));
    expect(screen.getByRole('status').textContent).toBe('Hello');
  });

  it('the rendered app holds exactly one live region on the landing screen and on the Plan screen', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => new Response(readFileSync(`public/examples/harbor-hall/${String(url).split('/').pop()}`, 'utf8'), { status: 200 })) as unknown as typeof fetch;
    const { container } = render(<App fetchImpl={fetchImpl} />);
    const live = () => container.querySelectorAll('[role="status"], [aria-live], output');
    expect(live()).toHaveLength(1);
    fireEvent.click(screen.getByTestId('try-community-fair'));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Harbor Hall Community Fair: baseline' })).toBeTruthy());
    expect(live()).toHaveLength(1);
    expect(container.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });
});

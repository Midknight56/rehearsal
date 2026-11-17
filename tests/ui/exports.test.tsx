// @vitest-environment jsdom
// Task 15 (scenario-editor-and-replay), requirement 12.2 and 10.5: the export controls of the Compare screen and
// `Download comparison CSV` in the save-failure block. The files come from src/exports; nothing is recomputed in src/ui.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import Papa from 'papaparse';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comparison } from '../../src/comparison/comparison';
import { RANGE_LABEL } from '../../src/comparison/labels';
import { runPairedComparison } from '../../src/comparison/runner';
import { toComparisonSummary } from '../../src/comparison/summary';
import { LIMITS_TEXT, NOT_A_FORECAST } from '../../src/exports/assumptions-text';
import { downloadBytes, downloadText, openHtmlInNewTab } from '../../src/ui/download';
import { ExportControls } from '../../src/ui/compare/ExportControls';
import { SaveError } from '../../src/ui/SaveError';
import type { EditorStore } from '../../src/ui/state/store';
import { createInProcessClient } from '../comparison/helpers/in-process-client';
import { harborHall } from './generators';
import { makeStore, renderWith } from './render';

vi.mock('../../src/ui/download', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/ui/download')>();
  return { ...original, downloadText: vi.fn(), downloadBytes: vi.fn(), openHtmlInNewTab: vi.fn() };
});

let comparison: Comparison;
beforeAll(async () => {
  const { baseline, plusOne } = harborHall();
  const outcome = await runPairedComparison(createInProcessClient(), baseline, plusOne).done;
  if (outcome.status !== 'complete') throw new Error('comparison did not complete');
  comparison = outcome.comparison;
});
beforeEach(() => {
  vi.mocked(downloadText).mockClear();
  vi.mocked(downloadBytes).mockClear();
  vi.mocked(openHtmlInNewTab).mockClear();
});

const ready = (store: EditorStore) => waitFor(() => expect(store.getState().hashes.every((h) => h !== null)).toBe(true));
const ids = ['export-scenario-json', 'export-results-csv', 'export-comparison-csv', 'export-workbook', 'open-printable-comparison', 'open-run-sheet'];
const has = (id: string): boolean => screen.queryByTestId(id) !== null;

describe('12.2 export controls of the Compare screen', () => {
  it('before a comparison: JSON, workbook and the run sheet of the current tab only', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <ExportControls store={s} />);
    expect(ids.filter(has)).toEqual(['export-scenario-json', 'export-workbook', 'open-run-sheet']);
  });

  it('after a comparison: all six', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'compare/complete', comparison }));
    renderWith(store, (s) => <ExportControls store={s} />);
    expect(ids.filter(has)).toEqual(ids);
  });

  it('a restored summary offers the comparison CSV and the printable but not the results CSV', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'compare/restore', summary: toComparisonSummary(comparison) }));
    renderWith(store, (s) => <ExportControls store={s} />);
    expect(ids.filter(has)).toEqual(['export-scenario-json', 'export-comparison-csv', 'export-workbook', 'open-printable-comparison', 'open-run-sheet']);
  });

  it('export-results-csv saves 1,140 rows', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'compare/complete', comparison }));
    renderWith(store, (s) => <ExportControls store={s} />);
    fireEvent.click(screen.getByTestId('export-results-csv'));
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1));
    const [name, text, mime] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}\.csv$/);
    expect(name).toContain('results');
    expect(mime).toBe('text/csv');
    expect(Papa.parse(text, { header: true, skipEmptyLines: true }).data).toHaveLength(1140);
    expect(store.getState().status).toContain(name);
  });

  it('export-comparison-csv saves the 19 metric rows with the range label', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'compare/complete', comparison }));
    renderWith(store, (s) => <ExportControls store={s} />);
    fireEvent.click(screen.getByTestId('export-comparison-csv'));
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1));
    const [name, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toMatch(/\.csv$/);
    const rows = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true }).data;
    expect(rows).toHaveLength(19);
    expect(rows.every((r) => r.range_label === RANGE_LABEL)).toBe(true);
  });

  it('export-workbook saves the xlsx of the current tab', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <ExportControls store={s} />);
    fireEvent.click(screen.getByTestId('export-workbook'));
    await waitFor(() => expect(downloadBytes).toHaveBeenCalledTimes(1));
    expect(vi.mocked(downloadBytes).mock.calls[0]![0]).toMatch(/\.xlsx$/);
  });

  it('open-printable-comparison opens the generated document with the range label, the limits and the fixed sentence', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'compare/complete', comparison }));
    renderWith(store, (s) => <ExportControls store={s} />);
    fireEvent.click(screen.getByTestId('open-printable-comparison'));
    await waitFor(() => expect(openHtmlInNewTab).toHaveBeenCalledTimes(1));
    const html = vi.mocked(openHtmlInNewTab).mock.calls[0]![0];
    expect(html.startsWith('<!doctype html>')).toBe(true);
    for (const text of [RANGE_LABEL, NOT_A_FORECAST, LIMITS_TEXT, comparison.baseline.scenarioHash]) expect(html).toContain(text);
  });

  it('open-run-sheet opens the generator document of the current tab', async () => {
    const store = makeStore();
    await ready(store);
    renderWith(store, (s) => <ExportControls store={s} />);
    fireEvent.click(screen.getByTestId('open-run-sheet'));
    await waitFor(() => expect(openHtmlInNewTab).toHaveBeenCalledTimes(1));
    const html = vi.mocked(openHtmlInNewTab).mock.calls[0]![0];
    expect(html).toContain('4.167 s');
    expect(html).toContain(store.getState().hash as string);
  });
});

describe('10.5 Download comparison CSV in the save-failure block', () => {
  it('is absent without a comparison and present with one', async () => {
    const store = makeStore();
    await ready(store);
    act(() => store.dispatch({ type: 'storage/save-failed', reason: 'quota' }));
    renderWith(store, (s) => <SaveError store={s} onRetry={() => undefined} />);
    expect(screen.getByTestId('save-error')).toBeTruthy();
    expect(has('download-comparison-csv')).toBe(false);
    act(() => store.dispatch({ type: 'compare/complete', comparison }));
    expect(has('download-comparison-csv')).toBe(true);
    fireEvent.click(screen.getByTestId('download-comparison-csv'));
    await waitFor(() => expect(downloadText).toHaveBeenCalledTimes(1));
    expect((vi.mocked(downloadText).mock.calls[0]!)[1]).toContain(RANGE_LABEL);
    expect(store.getState().compare.comparison).toBe(comparison);
  });
});

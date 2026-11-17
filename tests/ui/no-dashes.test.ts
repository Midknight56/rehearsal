// @vitest-environment jsdom
// Maintenance: no dashes in shown text. No text a person sees in the app, its exports or README.md contains an en dash (U+2013)
// or an em dash (U+2014). Code comments may keep them. This file renders the main screens and builds every export for Harbor Hall
// and fails on either character, scans the string literals of src/ and public/examples/, and reads README.md.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactElement } from 'react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Comparison } from '../../src/comparison/comparison';
import { runPairedComparison } from '../../src/comparison/runner';
import { scenarioHash } from '../../src/domain/hash';
import { validateScenario } from '../../src/domain/validate';
import { exportArrivalsCsv, exportComparisonCsv, exportResultsCsv, exportStationsCsv } from '../../src/exports/csv';
import { renderComparisonHtml } from '../../src/exports/printable-comparison';
import { renderRunSheet } from '../../src/exports/run-sheet';
import { exportScenarioJson } from '../../src/exports/scenario-json';
import { workbookRows } from '../../src/exports/xlsx';
import { simulate } from '../../src/simulation/simulate';
import { CompareScreen } from '../../src/ui/compare/CompareScreen';
import { createCompareController } from '../../src/ui/compare/controller';
import { GameViewPanel } from '../../src/ui/game/GameViewPanel';
import { Landing } from '../../src/ui/landing/Landing';
import { ArrivalsTable } from '../../src/ui/plan/ArrivalsTable';
import { AssumptionsPanel } from '../../src/ui/plan/AssumptionsPanel';
import { LayoutPanel } from '../../src/ui/plan/LayoutPanel';
import { ScenarioTabs } from '../../src/ui/plan/ScenarioTabs';
import { StationsTable } from '../../src/ui/plan/StationsTable';
import { PrintControls } from '../../src/ui/print/PrintControls';
import { PrintScreen } from '../../src/ui/print/PrintScreen';
import { ResultTables } from '../../src/ui/results/ResultTables';
import { RunPanel } from '../../src/ui/run/RunPanel';
import type { EditorStore } from '../../src/ui/state/store';
import { createInProcessClient } from '../comparison/helpers/in-process-client';
import { createFakeGameView } from './fakeGameView';
import { harborHall } from './generators';
import { makeStore } from './render';

const DASH = /[\u2013\u2014]/;
const find = (text: string): string[] => [...text.matchAll(/[\u2013\u2014]/g)].map((m) => `U+${(m[0].codePointAt(0) as number).toString(16).toUpperCase()} near "${text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40)}"`);
const GENERATED = '2026-11-20T12:34:56.000Z';

afterEach(() => cleanup());

const ready = (store: EditorStore) => waitFor(() => expect(store.getState().hashes.every((h) => h !== null)).toBe(true));
const shown = (): string => document.body.innerHTML;

function files(dir: string, extension: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path, extension) : extension.test(path) ? [path] : [];
  });
}

/** The source without comments: block comments, whole-line comments and trailing ` // ` comments are removed. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => (line.trim().startsWith('//') ? '' : line.replace(/\s\/\/\s.*$/, '')))
    .join('\n');
}

describe('README.md and the files shipped with the app', () => {
  it('README.md has no en dash and no em dash', () => {
    expect(find(readFileSync('README.md', 'utf8'))).toEqual([]);
  });

  it('public/examples (templates, scenarios, expected values) has none', () => {
    const hits = files('public', /\.(csv|json|html|txt|md)$/).flatMap((file) => find(readFileSync(file, 'utf8')).map((hit) => `${file}: ${hit}`));
    expect(hits).toEqual([]);
  });

  it('index.html has none', () => {
    expect(find(readFileSync('index.html', 'utf8'))).toEqual([]);
  });
});

describe('source literals under src/ (comments may keep dashes)', () => {
  it('has no en or em dash character, and no \\u2013 or \\u2014 escape, outside comments', () => {
    const hits = files('src', /\.(ts|tsx|css|html)$/).flatMap((file) => {
      const code = withoutComments(readFileSync(file, 'utf8'));
      const escapes = [...code.matchAll(/\\u\{?(2013|2014)\}?|&[mn]dash;|&#(8211|8212);|fromCharCode\(\s*(8211|8212)\s*\)/gi)].map((m) => `escape ${m[0]}`);
      return [...find(code), ...escapes].map((hit) => `${file}: ${hit}`);
    });
    expect(hits).toEqual([]);
  });

  it('would catch a dash in a literal and skip a comment', () => {
    expect(find(withoutComments("const a = 'servers 1\u201320'; // 1\u201320 in a comment\n"))).toHaveLength(1);
    expect(find(withoutComments("const a = 'servers 1 to 20'; // 1\u201320 in a comment\n"))).toEqual([]);
  });
});

describe('screens rendered for Harbor Hall', () => {
  it('the landing screen', () => {
    render(createElement(Landing, { store: makeStore(), fetchImpl: async () => new Response('{}') }) as ReactElement);
    expect(screen.getByRole('heading', { name: 'Rehearsal' })).toBeTruthy();
    expect(find(shown())).toEqual([]);
  });

  it('the Plan screen panels: tabs, tables, layout, assumptions, run panel, controls', async () => {
    const store = makeStore();
    await ready(store);
    const controller = { start: () => null, cancel: () => undefined, activeRunId: () => null };
    render(
      createElement('div', null,
        createElement(ScenarioTabs, { store }),
        createElement(ArrivalsTable, { store }),
        createElement(StationsTable, { store }),
        createElement(LayoutPanel, { store }),
        createElement(AssumptionsPanel, { store }),
        createElement(RunPanel, { store, controller }),
        createElement(PrintControls, { store })),
    );
    expect(screen.getByText(/Scenario hash:/)).toBeTruthy();
    expect(find(shown())).toEqual([]);
  });

  it('the result tables and the Game view, with a result and with an empty scenario', async () => {
    const { baseline } = harborHall();
    const empty = { ...baseline, id: 'empty', cohorts: baseline.cohorts.map((c) => ({ ...c, count: 0 })) };
    const store = makeStore([baseline, empty], ['baseline', 'empty']);
    await ready(store);
    for (const index of [0, 1]) {
      const snapshot = store.getState().scenarios[index] as typeof baseline;
      const hash = await scenarioHash(snapshot);
      act(() => {
        store.dispatch({ type: 'run/result', runId: index + 1, tabIndex: index, result: simulate(snapshot, 0, { trace: true, scenarioHash: hash }), snapshot, hash });
      });
    }
    const view = createFakeGameView();
    const createView = async () => ({ ok: true as const, handle: view });
    const { rerender } = render(createElement('div', null, createElement(ResultTables, { store }), createElement(GameViewPanel, { store, createView })));
    await screen.findByRole('heading', { name: 'Game view' });
    expect(find(shown())).toEqual([]);
    act(() => store.dispatch({ type: 'scenario/select-tab', index: 1 }));
    rerender(createElement('div', null, createElement(ResultTables, { store }), createElement(GameViewPanel, { store, createView })));
    expect(shown()).toContain('n/a');
    expect(find(shown())).toEqual([]);
  });

  it('a stale result carries the label "Stale, rerun"', async () => {
    const store = makeStore();
    await ready(store);
    const snapshot = store.getState().scenario;
    const hash = await scenarioHash(snapshot);
    act(() => store.dispatch({ type: 'run/result', runId: 1, tabIndex: 0, result: simulate(snapshot, 0, { trace: false, scenarioHash: hash }), snapshot, hash }));
    act(() => store.dispatch({ type: 'station/set', id: 'checkin', patch: { servers: 2 } }));
    render(createElement(ResultTables, { store }));
    await waitFor(() => expect(shown()).toContain('Stale, rerun'));
    expect(find(shown())).toEqual([]);
  });

  it('the Print screen', async () => {
    const store = makeStore();
    await ready(store);
    render(createElement(PrintScreen, { store }));
    expect(document.getElementById('run-sheet')).not.toBeNull();
    expect(find(shown())).toEqual([]);
  });

  it('the validation messages of the editor', async () => {
    const store = makeStore();
    await ready(store);
    const messages: string[] = [];
    for (const action of [
      { type: 'settings/set', patch: { title: '' } },
      { type: 'settings/set', patch: { baseSeed: '' } },
      { type: 'station/rename', id: 'checkin', newId: 'a|b' },
      { type: 'cohort/rename', id: 'doors', newId: '' },
    ] as const) {
      act(() => store.dispatch(action));
      messages.push(store.getState().status);
    }
    const bad = { ...harborHall().baseline, baseSeed: '' };
    const checked = validateScenario(bad);
    if (!checked.ok) messages.push(...checked.issues.map((issue) => issue.message));
    expect(messages.filter((m) => m !== '').length).toBeGreaterThanOrEqual(4);
    expect(find(messages.join('\n'))).toEqual([]);
    expect(messages.join('\n')).toContain('1 to 64 characters');
    expect(messages.join('\n')).toContain('Title must be 1 to 120 characters');
  });
});

describe('the Compare screen and the exports for Harbor Hall', () => {
  let comparison: Comparison;
  beforeAll(async () => {
    const { baseline, plusOne } = harborHall();
    const outcome = await runPairedComparison(createInProcessClient(), baseline, plusOne).done;
    if (outcome.status !== 'complete') throw new Error('comparison did not complete');
    comparison = outcome.comparison;
  });

  it('the Compare screen with a comparison, a null change and a conditioned metric', async () => {
    const store = makeStore();
    await ready(store);
    const controller = createCompareController(createInProcessClient(), store);
    const edited = structuredClone(comparison);
    const wait = edited.metrics.find((m) => m.key === 'queueWait.p95');
    if (wait === undefined) throw new Error('metric missing');
    wait.meanChange = null;
    wait.rangeP10 = null;
    wait.rangeP90 = null;
    wait.baselineMean = null;
    const journey = edited.metrics.find((m) => m.key === 'journeyTime.mean');
    if (journey !== undefined) {
      journey.conditioned = true;
      journey.note = 'from 100 of 120 admitted attendees; 20 unfinished at the drain cap';
    }
    act(() => {
      store.dispatch({ type: 'screen/set', screen: 'compare' });
      store.dispatch({ type: 'compare/complete', comparison: edited });
    });
    const view = createFakeGameView();
    render(createElement(CompareScreen, { store, controller, storage: null, createView: async () => ({ ok: true as const, handle: view }) }));
    expect(screen.getByTestId('metric-card-queueWait.p95').textContent).toContain('n/a');
    expect(find(shown())).toEqual([]);
  });

  it('CSV, workbook rows, scenario JSON, printable comparison and run sheet', async () => {
    const { baseline } = harborHall();
    const hash = await scenarioHash(baseline);
    const nullish = structuredClone(comparison);
    const target = nullish.metrics.find((m) => m.key === 'queueWait.p95');
    if (target !== undefined) {
      target.meanChange = null;
      target.rangeP10 = null;
      target.rangeP90 = null;
      target.baselineMean = null;
      target.candidateMean = null;
    }
    nullish.baselineResults[0]!.metrics.queueWait.mean.value = null;
    const outputs: Record<string, string> = {
      arrivalsCsv: exportArrivalsCsv(baseline),
      stationsCsv: exportStationsCsv(baseline),
      resultsCsv: exportResultsCsv(nullish),
      comparisonCsv: exportComparisonCsv(nullish),
      workbook: JSON.stringify(workbookRows(baseline)),
      scenarioJson: exportScenarioJson({ scenario: baseline, scenarioHash: hash, results: [simulate(baseline, 0, { trace: false, scenarioHash: hash })], generatedAt: GENERATED }),
      printable: renderComparisonHtml(nullish, { generatedAt: GENERATED }),
      runSheet: renderRunSheet(baseline, { generatedAt: GENERATED, scenarioHash: hash }).html,
    };
    for (const [name, text] of Object.entries(outputs)) expect(find(text), name).toEqual([]);
    expect(outputs.printable).toContain('10th to 90th range (variation across these simulated runs)');
    expect(outputs.printable).toContain('30 replications (indices 0 to 29)');
    expect(outputs.printable).toContain('n/a');
    expect(outputs.runSheet).toContain('Harbor Hall Community Fair: baseline (run sheet)');
    expect(outputs.runSheet).toContain('0 to 20 min');
    expect(DASH.test(outputs.runSheet)).toBe(false);
  });
});

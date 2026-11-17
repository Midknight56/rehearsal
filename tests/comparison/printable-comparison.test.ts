import { beforeAll, describe, expect, it } from 'vitest';
import type { Comparison } from '../../src/comparison/comparison';
import { RANGE_LABEL } from '../../src/comparison/labels';
import { runPairedComparison } from '../../src/comparison/runner';
import { toComparisonSummary } from '../../src/comparison/summary';
import { ASSUMPTIONS, LIMITS_TEXT, NOT_A_FORECAST } from '../../src/exports/assumptions-text';
import { escapeHtml } from '../../src/exports/html-escape';
import { renderComparisonHtml } from '../../src/exports/printable-comparison';
import { hostile } from './fixtures/hostile';
import { baseline, harborPlusOne, population130 } from './fixtures/pairs';
import { createInProcessClient } from './helpers/in-process-client';
import { badgeWords, forbiddenMarkup, generatedAt } from './helpers/render';

async function compare(pair: { baseline: typeof baseline; candidate: typeof baseline }): Promise<Comparison> {
  const outcome = await runPairedComparison(createInProcessClient(), pair.baseline, pair.candidate).done;
  if (outcome.status !== 'complete') throw new Error(`comparison failed: ${JSON.stringify(outcome)}`);
  return outcome.comparison;
}

const hostilePair = {
  baseline: hostile,
  candidate: { ...hostile, id: 'hostile-2', stations: hostile.stations.map((s) => (s.id === 'evil' ? { ...s, servers: 2 } : s)) },
};

describe('printable comparison, Harbor Hall baseline against the extra desk (requirement 8.3)', () => {
  let comparison: Comparison;
  let html: string;
  beforeAll(async () => {
    comparison = await compare(harborPlusOne);
    html = renderComparisonHtml(comparison, { generatedAt });
  });

  it('is a complete document with one inline style and no active markup', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html).toContain('@page { margin: 12mm }');
    expect(html).not.toMatch(forbiddenMarkup);
  });

  it('carries the heading, the seed, both hashes, the model version and the window', () => {
    expect(html).toContain(`Rehearsal comparison: ${baseline.title} vs ${harborPlusOne.candidate.title}`);
    expect(html).toContain('harbor-hall-2026');
    expect(html).toContain(comparison.baseline.scenarioHash);
    expect(html).toContain(comparison.candidate.scenarioHash);
    expect(html).toContain('0.1.0');
    expect(html).toContain('40 min');
    expect(html).toContain('30 replications (indices 0 to 29)');
    expect(html).toContain('Replay of replication 0, one example run');
    expect(html).toContain(generatedAt.slice(0, 10));
    expect(html).not.toContain(generatedAt.slice(11));
  });

  it('has the metric headers verbatim and the range label', () => {
    expect(html).toContain('10th to 90th range (variation across these simulated runs)');
    for (const header of ['Metric', 'Baseline mean', 'Candidate mean', 'Mean paired change', 'n', 'Runs improved']) {
      expect(html).toContain(`<th scope="col">${header}</th>`);
    }
    expect(html).toContain(RANGE_LABEL);
  });

  it('prints the means and changes through the shared formatters and the count sentences from the labels', () => {
    const wait = comparison.metrics.find((m) => m.key === 'queueWait.mean')!;
    expect(html).toContain(`Candidate had lower mean queue wait in ${wait.improved} of ${wait.n} runs; the same simulated attendees and random draws were used in both.`);
    expect(html).toContain('No better direction is defined for staff-hours; read the values.');
    expect(html).toContain('+0.67 h');
  });

  it('lists every assumption line, the limits, the fixed sentence and the model version in the footer', () => {
    for (const line of ASSUMPTIONS) expect(html).toContain(escapeHtml(line));
    expect(html).toContain(escapeHtml(LIMITS_TEXT));
    expect(html).toContain(NOT_A_FORECAST);
    expect(html).toContain('Model version 0.1.0');
  });

  it('orders the sections scenarios, changes, metrics, stations, assumptions and omits the drain-cap note when no run was capped', () => {
    const at = ['scenarios', 'changes', 'metrics', 'stations', 'assumptions'].map((id) => html.indexOf(`id="${id}"`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).not.toContain('id="drain-cap"');
    expect(html).not.toContain('*');
  });

  it('adds the drain-cap section between stations and assumptions, with the star and the note on conditioned rows', () => {
    const capped = structuredClone(comparison);
    capped.completion = { baselineCapped: 0, candidateCapped: 1 };
    const note = '0 of 30 baseline runs and 1 of 30 candidate runs hit the drain cap; completed-journey metrics count completed attendees only';
    for (const metric of capped.metrics.filter((m) => m.population === 'completedJourney')) {
      metric.conditioned = true;
      metric.note = note;
    }
    const doc = renderComparisonHtml(capped, { generatedAt });
    const at = ['stations', 'drain-cap', 'assumptions'].map((id) => doc.indexOf(`id="${id}"`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(doc).toContain(note);
    expect(doc).toMatch(/\d\.\d s\*/);
  });

  it('renders a saved summary like the comparison it came from', () => {
    const summary = renderComparisonHtml(toComparisonSummary(comparison), { generatedAt });
    expect(summary).toBe(html);
  });
});

describe('hostile strings (matrix row 27, HTML half)', () => {
  it('escapes the station label and the title and leaves no <script', async () => {
    const doc = renderComparisonHtml(await compare(hostilePair), { generatedAt });
    expect(doc).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(doc).toContain('=SUM(A1:A3)');
    expect(doc).toContain('-Harbor');
    expect(doc).not.toMatch(forbiddenMarkup);
  });
});

describe('population change (matrix row 25)', () => {
  it('puts <li class="population"> first in #changes and never says "the same simulated attendees"', async () => {
    const doc = renderComparisonHtml(await compare({ baseline, candidate: population130 }), { generatedAt });
    const changes = doc.slice(doc.indexOf('id="changes"'), doc.indexOf('id="metrics"'));
    expect(changes.indexOf('<li class="population">')).toBeGreaterThan(-1);
    expect(changes.indexOf('<li')).toBe(changes.indexOf('<li class="population">'));
    expect(changes).toContain('count 120 \u2192 130 people');
    expect(doc).not.toContain('the same simulated attendees');
    expect(doc).toContain('the attendee populations differ (120 vs 130 people)');
    expect(doc).not.toMatch(badgeWords);
    expect(doc).not.toMatch(/confidence interval|prediction interval/i);
  });
});

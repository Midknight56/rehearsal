// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SlopeChart, slopeGeometry, slopeSummary, type SlopePair } from '../../src/ui/compare/SlopeChart';
import { summaryFixture } from './compareFixtures';
import { runPairedComparison } from '../../src/comparison/runner';
import { createInProcessClient } from '../comparison/helpers/in-process-client';
import { harborHall } from './generators';

afterEach(() => cleanup());

const pairs = (): SlopePair[] =>
  Array.from({ length: 30 }, (_, r) => ({ replication: r, baselineMs: 400_000 + r * 1000, candidateMs: 100_000 + r * 500 }));

describe('the slope chart of paired runs', () => {
  it('draws one line per replication from its baseline value to its candidate value', () => {
    const data = pairs();
    render(<SlopeChart pairs={data} />);
    const lines = [...document.querySelectorAll('[data-testid="slope-line"]')];
    expect(lines).toHaveLength(30);
    const geometry = slopeGeometry(data);
    lines.forEach((line, i) => {
      expect(Number(line.getAttribute('data-replication'))).toBe(i);
      expect(Number(line.getAttribute('data-baseline-ms'))).toBe(data[i]!.baselineMs);
      expect(Number(line.getAttribute('data-candidate-ms'))).toBe(data[i]!.candidateMs);
      expect(Number(line.getAttribute('y1'))).toBeCloseTo(geometry.lines[i]!.y1, 6);
      expect(Number(line.getAttribute('y2'))).toBeCloseTo(geometry.lines[i]!.y2, 6);
    });
  });

  it('maps values on one scale from 0: a value twice as large sits twice as far from the bottom', () => {
    const geometry = slopeGeometry([{ replication: 0, baselineMs: 200_000, candidateMs: 100_000 }]);
    const line = geometry.lines[0]!;
    expect(geometry.bottom - line.y1).toBeCloseTo(2 * (geometry.bottom - line.y2), 6);
    expect(geometry.maxS * 1000).toBeGreaterThanOrEqual(200_000);
  });

  it('skips a replication with an undefined value and says how many were drawn', () => {
    const data: SlopePair[] = [...pairs().slice(0, 3), { replication: 3, baselineMs: null, candidateMs: 5000 }];
    render(<SlopeChart pairs={data} />);
    expect(document.querySelectorAll('[data-testid="slope-line"]')).toHaveLength(3);
    expect(screen.getByText(/3 paired runs, same guests in both/)).toBeTruthy();
  });

  it('has a caption built from the count and a summary sentence from the same numbers; the drawing is hidden from readers', () => {
    const data = pairs();
    render(<SlopeChart pairs={data} />);
    expect(screen.getByText('30 paired runs, same guests in both')).toBeTruthy();
    expect(screen.getByText(slopeSummary(data))).toBeTruthy();
    expect(slopeSummary(data)).toBe('Mean queue wait per run, baseline 400.0 s to 429.0 s, candidate 100.0 s to 114.5 s.');
    expect(document.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws nothing for no data', () => {
    const { container } = render(<SlopeChart pairs={[]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('is drawn from the real Harbor Hall comparison: every line equals that replication of queueWait.mean', async () => {
    const { baseline, plusOne } = harborHall();
    const outcome = await runPairedComparison(createInProcessClient(), baseline, plusOne).done;
    if (outcome.status !== 'complete') throw new Error('comparison did not complete');
    const metric = outcome.comparison.metrics.find((m) => m.key === 'queueWait.mean')!;
    const data = metric.differences.map((d): SlopePair => ({ replication: d.replication, baselineMs: d.baseline, candidateMs: d.candidate }));
    render(<SlopeChart pairs={data} />);
    const lines = [...document.querySelectorAll('[data-testid="slope-line"]')];
    expect(lines).toHaveLength(metric.n);
    lines.forEach((line, i) => {
      expect(Number(line.getAttribute('data-baseline-ms'))).toBe(outcome.comparison.baselineResults[i]!.metrics.queueWait.mean.value);
      expect(Number(line.getAttribute('data-candidate-ms'))).toBe(outcome.comparison.candidateResults[i]!.metrics.queueWait.mean.value);
    });
    expect((await summaryFixture()).metrics.find((m) => m.key === 'queueWait.mean')!.n).toBe(metric.n);
  });
});
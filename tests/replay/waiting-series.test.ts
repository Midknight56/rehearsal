import { describe, expect, it } from 'vitest';
import { sampleAt } from '../../src/replay/sampler';
import { buildIndex } from '../../src/replay/traceIndex';
import { waitingPerMinute, waitingSummary } from '../../src/replay/waitingSeries';
import { makeTrace } from './generators';

describe('people waiting, minute by minute', () => {
  const made = makeTrace({ attendees: 60, stations: 2, seed: 7 });
  const index = buildIndex(made.trace, made.stations);

  it('has one value per simulated minute from 0 to the last event, each the sampler waiting count at that minute', () => {
    const series = waitingPerMinute(index);
    expect(series).toHaveLength(Math.floor(index.endMs / 60_000) + 1);
    series.forEach((people, minute) => {
      const sample = sampleAt(index, minute * 60_000);
      expect(people).toBe(Object.values(sample.perStation).reduce((n, s) => n + s.waiting, 0));
    });
  });

  it('a run that lasts under a minute has the single value at minute 0', () => {
    expect(waitingPerMinute(index)[0]).toBe(0);
  });

  it('is pure: the trace is unchanged', () => {
    const before = JSON.stringify(made.trace);
    waitingPerMinute(index);
    expect(JSON.stringify(made.trace)).toBe(before);
  });

  it('summarises the peak and the last minute in one sentence from the same numbers', () => {
    expect(waitingSummary([0, 3, 14, 6, 0])).toBe('Most people waiting: 14, at 02:00. Waiting at 04:00: 0.');
    expect(waitingSummary([0])).toBe('Nobody is waiting at any simulated minute.');
    expect(waitingSummary([2, 2, 1])).toBe('Most people waiting: 2, at 00:00. Waiting at 02:00: 1.');
  });
});
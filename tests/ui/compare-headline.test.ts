import { describe, expect, it } from 'vitest';
import { compareHeadline, type HeadlineMetric } from '../../src/ui/compare/headline';
import { summaryFixture } from './compareFixtures';

const metric = (patch: Partial<HeadlineMetric>): HeadlineMetric => ({
  label: 'Mean queue wait', unit: 'ms', meanChange: -297_400, improved: 30, worsened: 0, n: 30, conditioned: false, note: null, ...patch,
});

describe('Compare headline from the paired queueWait.mean metric', () => {
  it('Harbor Hall values: 297.4 s lower, in 30 of 30 runs', () => {
    expect(compareHeadline(metric({}))).toEqual({ headline: 'Mean queue wait drops by 297.4 s.', detail: 'Lower in 30 of 30 runs.', note: null });
  });

  it('a made up rising case reads rises and Higher in', () => {
    expect(compareHeadline(metric({ meanChange: 12_345, improved: 3, worsened: 25, n: 30 }))).toEqual({
      headline: 'Mean queue wait rises by 12.3 s.', detail: 'Higher in 25 of 30 runs.', note: null,
    });
  });

  it('an unchanged case reads does not change, with no count line', () => {
    expect(compareHeadline(metric({ meanChange: 0, improved: 0, worsened: 0 }))).toEqual({ headline: 'Mean queue wait does not change.', detail: null, note: null });
  });

  it('has no headline when the change is undefined', () => {
    expect(compareHeadline(metric({ meanChange: null, improved: null, worsened: null }))).toBeNull();
  });

  it('carries the conditioned note of a conditioned metric', () => {
    const result = compareHeadline(metric({ conditioned: true, note: 'from 90 of 120 admitted attendees; 30 unfinished at the drain cap' }));
    expect(result?.note).toBe('* from 90 of 120 admitted attendees; 30 unfinished at the drain cap');
  });

  it('is built from the real Harbor Hall comparison, never typed in', async () => {
    const summary = await summaryFixture();
    const real = summary.metrics.find((m) => m.key === 'queueWait.mean');
    expect(real).toBeDefined();
    const seconds = (Math.abs(real!.meanChange as number) / 1000).toFixed(1);
    const result = compareHeadline(real as HeadlineMetric);
    expect(result?.headline).toBe(`Mean queue wait ${(real!.meanChange as number) < 0 ? 'drops' : 'rises'} by ${seconds} s.`);
    expect(result?.detail).toBe(`${(real!.meanChange as number) < 0 ? 'Lower' : 'Higher'} in ${(real!.meanChange as number) < 0 ? real!.improved : real!.worsened} of ${real!.n} runs.`);
    console.log(`Harbor Hall headline from the real run: ${result?.headline} ${result?.detail}`);
  });
});
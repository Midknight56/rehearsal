import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { previewHeadline, type HeadlineSource } from '../../src/ui/landing/previewHeadline';

const station = (id: string, label: string, servers: number) => ({ id, label, servers, cell: [1, 1], service: { kind: 'constant', seconds: 10 } });
const scenario = (stations: ReturnType<typeof station>[]): Scenario => ({ stations } as unknown as Scenario);
const metric = (over: Partial<HeadlineSource['metrics'][number]>): HeadlineSource['metrics'][number] => ({
  key: 'queueWait.mean', label: 'Mean queue wait', unit: 'ms', meanChange: -297_432, improved: 28, worsened: 2, n: 30, conditioned: false, note: null, ...over,
});
const source = (m: ReturnType<typeof metric>, candidateServers = 2): HeadlineSource => ({
  metrics: [m],
  baselineScenario: scenario([station('checkin', 'Check-in desk', 1), station('packs', 'Welcome packs', 2)]),
  candidateScenario: scenario([station('checkin', 'Check-in desk', candidateServers), station('packs', 'Welcome packs', 2)]),
});

describe('previewHeadline', () => {
  it('words the drop around the number and the counts of compareHeadline', () => {
    expect(previewHeadline(source(metric({})))?.text).toBe('One more check-in desk cuts the mean wait by 297.4 s. Lower in 28 of 30 paired runs.');
    expect(previewHeadline(source(metric({ meanChange: -1_000, improved: 30 })))?.text).toBe('One more check-in desk cuts the mean wait by 1.0 s. Lower in 30 of 30 paired runs.');
  });

  it('takes every number from the metric', () => {
    const text = previewHeadline(source(metric({ meanChange: -12_345, improved: 17, n: 30 })))?.text ?? '';
    expect(text).toContain('12.3 s');
    expect(text).toContain('17 of 30');
  });

  it('says rises when the candidate waits longer, and does not say cuts', () => {
    const text = previewHeadline(source(metric({ meanChange: 5_000, improved: 3, worsened: 25 })))?.text ?? '';
    expect(text).toBe('One more check-in desk raises the mean wait by 5.0 s. Higher in 25 of 30 paired runs.');
  });

  it('has no line when the change is undefined or the metric is missing', () => {
    expect(previewHeadline(source(metric({ meanChange: null })))).toBeNull();
    expect(previewHeadline({ ...source(metric({})), metrics: [] })).toBeNull();
  });

  it('does not claim one more desk when the scenarios differ in another way', () => {
    const s = source(metric({}), 3);
    expect(previewHeadline(s)?.text).toBe('The candidate cuts the mean wait by 297.4 s. Lower in 28 of 30 paired runs.');
  });

  it('has no dash between words', () => {
    expect(previewHeadline(source(metric({})))?.text).not.toMatch(/[\u2013\u2014]/);
  });
});

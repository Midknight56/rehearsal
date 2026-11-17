import { describe, expect, it } from 'vitest';
import { compileAttendees } from '../../src/simulation/arrivals';
import { compileServiceSampler } from '../../src/simulation/sampling';
import { baseline, plusOneCheckin, shorterRoute } from './fixtures/harbor-hall';

function draws(input: typeof baseline, replication: number) {
  const sampler = compileServiceSampler(input, replication);
  return compileAttendees(input, replication).map((a) => ({
    id: a.id,
    arrivalMs: a.arrivalMs,
    checkinMs: sampler(a.id, 'checkin'),
    packsMs: sampler(a.id, 'packs'),
  }));
}

describe('row 9: common random inputs', () => {
  for (const replication of [0, 7]) {
    it(`the three Harbor Hall scenarios share arrivals and service durations at replication ${replication}`, () => {
      const base = draws(baseline, replication);
      expect(base).toHaveLength(120);
      expect(draws(plusOneCheckin, replication)).toEqual(base);
      expect(draws(shorterRoute, replication)).toEqual(base);
    });
  }

  it('replications 0 and 7 draw different values', () => {
    expect(draws(baseline, 0)).not.toEqual(draws(baseline, 7));
  });
});
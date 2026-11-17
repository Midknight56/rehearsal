import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { runOnce } from './helpers/run';
import { baseline } from './fixtures/harbor-hall';

describe('row 10: determinism (engine side)', () => {
  it('three runs of baseline replication 0 are byte-identical', async () => {
    const first = JSON.stringify(await runOnce(baseline, 0, true));
    const second = JSON.stringify(await runOnce(baseline, 0, true));
    const roundTripped = JSON.stringify(await runOnce(JSON.parse(JSON.stringify(baseline)) as Scenario, 0, true));
    expect(second).toBe(first);
    expect(roundTripped).toBe(first);
  });

  it('trace false gives identical metrics', async () => {
    const withTrace = await runOnce(baseline, 0, true);
    const withoutTrace = await runOnce(baseline, 0, false);
    expect(withoutTrace.trace).toBeUndefined();
    expect(JSON.stringify(withoutTrace.metrics)).toBe(JSON.stringify(withTrace.metrics));
  });
});
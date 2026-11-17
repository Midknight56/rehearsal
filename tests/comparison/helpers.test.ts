import { describe, expect, it } from 'vitest';
import { createInProcessClient } from './helpers/in-process-client';
import { rowOnePair } from './fixtures/pairs';
import { REPLICATION_INDICES } from '../../src/comparison/replications';

describe('in-process client', () => {
  it('resolves 30 results for one run and records the call', async () => {
    const client = createInProcessClient();
    const seen: number[] = [];
    const handle = client.run(rowOnePair.baseline, [...REPLICATION_INDICES], { trace: false, onResult: (r) => seen.push(r.replication) });
    const outcome = await handle.done;
    expect(outcome.status).toBe('complete');
    if (outcome.status === 'complete') expect(outcome.results).toHaveLength(30);
    expect(seen).toHaveLength(30);
    expect(client.runs).toHaveLength(1);
    expect(client.runs[0]?.trace).toBe(false);
    expect(client.runs[0]?.scenarioHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resolves cancelled when cancel() is called during a run', async () => {
    const client = createInProcessClient({ delayMs: 1 });
    const handle = client.run(rowOnePair.baseline, [...REPLICATION_INDICES], { trace: false });
    client.cancel();
    const outcome = await handle.done;
    expect(outcome.status).toBe('cancelled');
  });
});

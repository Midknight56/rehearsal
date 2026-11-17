import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runOnce } from './helpers/run';
import { harborHall } from './fixtures/harbor-hall';

const EXPECTED = resolve(import.meta.dirname, '../../public/examples/harbor-hall/expected.json');

describe('row 11.3: regression snapshot of replication 0', () => {
  it('matches public/examples/harbor-hall/expected.json', async () => {
    const actual: Record<string, unknown> = {};
    for (const [name, fixture] of Object.entries(harborHall)) {
      const result = await runOnce(fixture, 0, false);
      actual[name] = { scenarioHash: result.scenarioHash, completion: result.completion, unfinished: result.unfinished, metrics: result.metrics };
    }
    const snapshot = JSON.parse(JSON.stringify(actual)) as unknown;

    // Regenerate only when a semantic of the model changes (see units-and-determinism.md), never to make a test pass.
    if (process.env.UPDATE_EXPECTED === '1') {
      const file = {
        label: 'Regression snapshot of the accepted engine at R1, replication 0; not hand-calculated',
        modelVersion: '0.1.0',
        generatedOn: new Date().toISOString().slice(0, 10),
        scenarios: snapshot,
      };
      writeFileSync(EXPECTED, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    }

    expect(existsSync(EXPECTED), 'public/examples/harbor-hall/expected.json is written at task 15').toBe(true);
    const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as { scenarios: unknown };
    expect(snapshot).toEqual(expected.scenarios);
  });
});
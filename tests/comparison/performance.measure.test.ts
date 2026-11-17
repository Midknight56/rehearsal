import { describe, expect, it } from 'vitest';
import type { Scenario } from '../../src/domain/scenario';
import { scenarioHash } from '../../src/domain/hash';
import { validateScenario } from '../../src/domain/validate';
import { simulate } from '../../src/simulation/simulate';
import { perfScenario } from './fixtures/perf';

// A measurement, not a check: it runs only with MEASURE=1 and asserts no timing. Run in PowerShell:
//   $env:MEASURE = '1'; npx vitest run tests/comparison/performance.measure.test.ts; Remove-Item Env:MEASURE
// It prints the `| Case | Median ms | Target |` table that is pasted into docs/performance.md.
const WARMUPS = 2;
const TIMED = 5;

type Prepared = { scenario: Scenario; hash: string };

async function prepare(input: Scenario): Promise<Prepared> {
  const validated = validateScenario(input);
  if (!validated.ok) throw new Error(`invalid perf scenario: ${validated.issues.map((issue) => issue.message).join(' ')}`);
  return { scenario: validated.scenario, hash: await scenarioHash(validated.scenario) };
}

function runAll(prepared: Prepared[], replications: readonly number[]): void {
  for (const { scenario, hash } of prepared) {
    for (const replication of replications) simulate(scenario, replication, { trace: false, scenarioHash: hash });
  }
}

function medianMs(work: () => void): number {
  for (let i = 0; i < WARMUPS; i += 1) work();
  const samples: number[] = [];
  for (let i = 0; i < TIMED; i += 1) {
    const started = performance.now();
    work();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

const plusOne = (scenario: Scenario): Scenario => ({
  ...scenario,
  id: `${scenario.id}-plus-one`,
  stations: scenario.stations.map((station) => (station.id === 'checkin' ? { ...station, servers: station.servers + 1 } : station)),
});

describe.skipIf(process.env.MEASURE !== '1')('performance measurement (plan section 9, matrix row 29)', () => {
  it('prints the median of five timed runs after two warm-ups', async () => {
    const single = await prepare(perfScenario(500));
    const candidate = await prepare(plusOne(perfScenario(500)));
    const big = await prepare(perfScenario(5000));
    const thirty = Array.from({ length: 30 }, (_, index) => index);

    const rows: Array<[string, number, string]> = [
      ['one 500-attendee simulate call', medianMs(() => runAll([single], [0])), 'under 500 ms'],
      ['30 paired 500-attendee replications (60 calls)', medianMs(() => runAll([single, candidate], thirty)), 'within 5,000 ms'],
      ['one 5,000-attendee simulate call', medianMs(() => runAll([big], [0])), 'may take longer; must stay cancellable'],
    ];

    const table = ['| Case | Median ms | Target |', '| --- | --- | --- |', ...rows.map(([name, ms, target]) => `| ${name} | ${ms.toFixed(1)} | ${target} |`)].join('\n');
    console.log(`\n${table}\n`);
    expect(rows).toHaveLength(3);
  }, 300_000);
});

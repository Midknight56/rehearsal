import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as fc from 'fast-check';

/*
 * fast-check 4.10.2 names, read from node_modules/fast-check/lib/fast-check.d.ts (verified at task 1):
 *   Parameters:  numRuns (number), seed (number), path (string, "0:1:0" style), endOnFailure (boolean).
 *   fc.check(property, params) resolves/returns RunDetails; fc.asyncProperty(arbitrary, predicate) for async predicates.
 *   RunDetails fields: failed (boolean), interrupted, numRuns, numShrinks, seed (number), counterexample (tuple or null),
 *                      counterexamplePath (string or null), errorInstance (unknown or null).
 */

export const DEFAULT_SEEDS_FILE = 'tests/model/failing-seeds.json';
export const DEFAULT_NUM_RUNS = 200;

export type FailingSeed = { property: string; seed: number; path: string; counterexample: string; date: string };
export type CheckPropertyOptions = { seedsFile?: string; numRuns?: number };

function readSeeds(file: string): FailingSeed[] {
  if (!existsSync(file)) return [];
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file} must hold a JSON array`);
  return parsed as FailingSeed[];
}

function describeFailure(name: string, details: { seed: number; counterexamplePath: string | null; errorInstance: unknown }): string {
  const error = details.errorInstance instanceof Error ? details.errorInstance.message : String(details.errorInstance);
  return `Property "${name}" failed: seed ${details.seed}, path ${details.counterexamplePath}, ${error}`;
}

/** Replays every recorded failure of this property first, then runs generated cases; appends a new failure to the seeds file. */
export async function checkProperty<T>(
  name: string,
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void | Promise<boolean | void>,
  options: CheckPropertyOptions = {},
): Promise<void> {
  const seedsFile = options.seedsFile ?? DEFAULT_SEEDS_FILE;
  const property = fc.asyncProperty(arbitrary, async (value) => {
    const outcome = await predicate(value);
    if (outcome === false) throw new Error('predicate returned false');
  });

  for (const entry of readSeeds(seedsFile).filter((recorded) => recorded.property === name)) {
    const replay = await fc.check(property, { seed: entry.seed, path: entry.path, endOnFailure: true });
    if (replay.failed) throw new Error(`Recorded failure still reproduces. ${describeFailure(name, replay)}`);
  }

  const details = await fc.check(property, { numRuns: options.numRuns ?? DEFAULT_NUM_RUNS });
  if (!details.failed) return;

  const seeds = readSeeds(seedsFile);
  seeds.push({
    property: name,
    seed: details.seed,
    path: details.counterexamplePath ?? '',
    counterexample: JSON.stringify(details.counterexample?.[0] ?? null),
    date: new Date().toISOString().slice(0, 10),
  });
  writeFileSync(seedsFile, `${JSON.stringify(seeds, null, 2)}\n`, 'utf8');
  throw new Error(describeFailure(name, details));
}
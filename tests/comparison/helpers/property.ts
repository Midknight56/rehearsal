import * as fc from 'fast-check';
import { checkProperty as engineCheckProperty } from '../../model/helpers/property';

export const SEEDS_FILE = 'tests/comparison/failing-seeds.json';

/** The engine's checkProperty with this suite's seeds file and 200 runs. */
export function checkProperty<T>(
  name: string,
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void | Promise<boolean | void>,
  options: { numRuns?: number } = {},
): Promise<void> {
  return engineCheckProperty(name, arbitrary, predicate, { seedsFile: SEEDS_FILE, numRuns: options.numRuns ?? 200 });
}

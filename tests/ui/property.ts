import { checkProperty as baseCheckProperty, type CheckPropertyOptions } from '../model/helpers/property';
import type * as fc from 'fast-check';

export const UI_SEEDS_FILE = 'tests/ui/failing-seeds.json';

/** checkProperty of tests/model/helpers/property.ts with the UI seeds file: 200 runs, recorded failures replayed first. */
export function checkProperty<T>(
  name: string,
  arbitrary: fc.Arbitrary<T>,
  predicate: (value: T) => boolean | void | Promise<boolean | void>,
  options: CheckPropertyOptions = {},
): Promise<void> {
  return baseCheckProperty(name, arbitrary, predicate, { seedsFile: UI_SEEDS_FILE, ...options });
}

import { toComparisonSummary, type ComparisonSummary } from '../../src/comparison/summary';
import { runPairedComparison } from '../../src/comparison/runner';
import { createInProcessClient } from '../comparison/helpers/in-process-client';
import { harborHall } from './generators';

let cached: Promise<ComparisonSummary> | null = null;

/** The summary of Harbor Hall baseline against plus-one check-in, from a real run through the in-process client (memoised). */
export function summaryFixture(): Promise<ComparisonSummary> {
  cached ??= (async () => {
    const { baseline, plusOne } = harborHall();
    const outcome = await runPairedComparison(createInProcessClient(), baseline, plusOne).done;
    if (outcome.status !== 'complete') throw new Error(`fixture comparison did not complete: ${JSON.stringify(outcome)}`);
    return toComparisonSummary(outcome.comparison);
  })();
  return cached;
}

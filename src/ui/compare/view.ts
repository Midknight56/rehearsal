// What the Compare screen reads: a live Comparison and a restored ComparisonSummary both fit this shape, so the change list,
// the cards and the station table render from either without a second code path.
import type { ComparisonSummary } from '../../comparison/summary';

export type CompareView = Pick<ComparisonSummary, 'diff' | 'population' | 'languageMode' | 'metrics' | 'stations' | 'baseline' | 'candidate' | 'timing' | 'completion'>;
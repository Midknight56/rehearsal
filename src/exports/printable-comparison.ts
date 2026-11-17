import type { Comparison } from '../comparison/comparison';
import type { ComparisonSummary } from '../comparison/summary';

export function renderComparisonHtml(comparison: Comparison | ComparisonSummary, options: { generatedAt: string }): string {
  void comparison;
  void options;
  throw new Error('not implemented: renderComparisonHtml');
}

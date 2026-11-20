// The result line of the landing preview. The size of the change and the run counts come from compareHeadline over the paired
// mean queue wait; this file only words the sentence around them. Nothing numeric is typed here.
import type { Comparison } from '../../comparison/comparison';
import { compareHeadline, splitHeadlineNumber } from '../compare/headline';

export type HeadlineSource = Pick<Comparison, 'baselineScenario' | 'candidateScenario'> & { metrics: Pick<Comparison['metrics'][number], 'key' | 'label' | 'unit' | 'meanChange' | 'improved' | 'worsened' | 'n' | 'conditioned' | 'note'>[] };
export type PreviewHeadline = { text: string; note: string | null };

/** `One more check-in desk` when exactly one station has one more server and nothing else about the stations' servers differs. */
function subject(source: HeadlineSource): string {
  const before = source.baselineScenario.stations;
  const after = source.candidateScenario.stations;
  if (before.length !== after.length) return 'The candidate';
  const changed = after.filter((s) => before.find((b) => b.id === s.id)?.servers !== s.servers);
  const only = changed.length === 1 ? changed[0] : undefined;
  if (only === undefined || only.servers - (before.find((b) => b.id === only.id)?.servers ?? only.servers) !== 1) return 'The candidate';
  const label = only.label.toLowerCase();
  return label.endsWith('desk') ? `One more ${label}` : `One more server at ${only.label}`;
}

export function previewHeadline(source: HeadlineSource): PreviewHeadline | null {
  const metric = source.metrics.find((m) => m.key === 'queueWait.mean');
  if (metric === undefined) return null;
  const headline = compareHeadline(metric);
  if (headline === null) return null;
  const parts = splitHeadlineNumber(headline.headline);
  const detail = headline.detail === null ? '' : ` ${headline.detail.replace(/ runs\.$/, ' paired runs.')}`;
  if (parts === null || (!parts.before.endsWith(' drops by ') && !parts.before.endsWith(' rises by '))) {
    return { text: `${headline.headline}${detail}`, note: headline.note };
  }
  const verb = parts.before.endsWith(' drops by ') ? 'cuts' : 'raises';
  return { text: `${subject(source)} ${verb} the mean wait by ${parts.number}${parts.after}${detail}`, note: headline.note };
}

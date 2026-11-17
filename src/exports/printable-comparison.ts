import type { Comparison } from '../comparison/comparison';
import { EMPTY_VALUE, formatMinutes } from '../comparison/format';
import { COMBINED_NOTE, RANGE_LABEL, changesHeader, countSentence, replayLabel } from '../comparison/labels';
import { formatChange, formatMean } from '../comparison/paired';
import { REPLICATIONS, REPLICATION_INDICES } from '../comparison/replications';
import type { ComparisonSummary, SummaryMetric } from '../comparison/summary';
import { ASSUMPTIONS, LIMITS_TEXT, NOT_A_FORECAST, modelVersionLine } from './assumptions-text';
import { el, htmlDocument } from './document';
import { escapeHtml } from './html-escape';

type Source = Comparison | ComparisonSummary;

const RANGE_HEADER = `10th to 90th range (${RANGE_LABEL})`;
const first = REPLICATION_INDICES[0];
const last = REPLICATION_INDICES[REPLICATION_INDICES.length - 1];
const REPLICATIONS_TEXT = `${REPLICATIONS} replications (indices ${first} to ${last})`;

const star = (m: SummaryMetric): string => (m.conditioned ? '*' : '');
const th = (text: string): string => `<th scope="col">${escapeHtml(text)}</th>`;
const td = (text: string): string => `<td>${escapeHtml(text)}</td>`;
const table = (caption: string, head: string[], rows: string[][]): string =>
  [
    '<table>',
    `<caption>${escapeHtml(caption)}</caption>`,
    `<thead><tr>${head.map(th).join('')}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${row.join('')}</tr>`).join('\n')}</tbody>`,
    '</table>',
  ].join('\n');

const runsImproved = (m: SummaryMetric): string => (m.improved === null ? EMPTY_VALUE : `${m.improved} of ${m.n}`);

function scenariosSection(c: Source): string {
  const row = (role: string, ref: Source['baseline']): string[] => [
    `<th scope="row">${escapeHtml(role)}</th>`, td(ref.title), td(ref.scenarioHash), td(c.baseSeed), td(c.modelVersion),
    td(formatMinutes(c.horizonMs)), td(REPLICATIONS_TEXT), td(replayLabel(c.replay.replication)),
  ];
  return [
    '<section id="scenarios">',
    el('h2', 'Scenarios'),
    table('Scenarios compared', ['Role', 'Title', 'Scenario hash', 'Seed', 'Model version', 'Observation window', 'Replications', 'Replay'], [
      row('Baseline', c.baseline),
      row('Candidate', c.candidate),
    ]),
    '</section>',
  ].join('\n');
}

function changesSection(c: Source): string {
  const real = c.diff.changes.filter((change) => !change.derived).length;
  return [
    '<section id="changes">',
    el('h2', changesHeader(c.diff.kind, real)),
    c.diff.kind === 'combined' ? el('p', COMBINED_NOTE) : '',
    '<ol>',
    ...c.diff.changes.map((change) =>
      `<li${change.highlight ? ' class="population"' : ''}>${escapeHtml(change.text)}</li>`),
    '</ol>',
    '</section>',
  ].filter((line) => line !== '').join('\n');
}

function sentence(c: Source, m: SummaryMetric): string {
  return countSentence({
    direction: m.betterDirection,
    metricLabel: m.label.toLowerCase(),
    improved: m.improved,
    n: m.n,
    languageMode: c.languageMode,
    baselineCount: c.population.baselineCount,
    candidateCount: c.population.candidateCount,
  });
}

function metricsSection(c: Source): string {
  const rows = c.metrics.map((m) => [
    `<th scope="row">${escapeHtml(m.label)}</th>`,
    td(`${formatMean(m.baselineMean, m.unit)}${star(m)}`),
    td(`${formatMean(m.candidateMean, m.unit)}${star(m)}`),
    td(`${formatChange(m.meanChange, m.unit)}${star(m)}`),
    td(`${formatChange(m.rangeP10, m.unit)} to ${formatChange(m.rangeP90, m.unit)}`),
    td(String(m.n)),
    td(runsImproved(m)),
  ]);
  const note = c.metrics.find((m) => m.conditioned && m.note !== null)?.note ?? null;
  return [
    '<section id="metrics">',
    el('h2', 'Metrics'),
    table('Metrics, candidate minus baseline', ['Metric', 'Baseline mean', 'Candidate mean', 'Mean paired change', RANGE_HEADER, 'n', 'Runs improved'], rows),
    note === null ? '' : el('p', `* ${note}`),
    '<ul>',
    ...c.metrics.map((m) => el('li', sentence(c, m))),
    '</ul>',
    '</section>',
  ].filter((line) => line !== '').join('\n');
}

const PRESENCE = { both: '', 'baseline-only': ' (baseline only)', 'candidate-only': ' (candidate only)' } as const;

function stationsSection(c: Source): string {
  const rows = c.stations.flatMap((station) =>
    station.metrics.map((m) => [
      `<th scope="row">${escapeHtml(`${station.label}${PRESENCE[station.presence]}`)}</th>`,
      td(m.label),
      td(`${formatMean(m.baselineMean, m.unit)}${star(m)}`),
      td(`${formatMean(m.candidateMean, m.unit)}${star(m)}`),
      td(`${formatChange(m.meanChange, m.unit)}${star(m)}`),
      td(`${formatChange(m.rangeP10, m.unit)} to ${formatChange(m.rangeP90, m.unit)}`),
      td(String(m.n)),
      td(runsImproved(m)),
    ]));
  return [
    '<section id="stations">',
    el('h2', 'Stations'),
    table('Stations compared', ['Station', 'Metric', 'Baseline mean', 'Candidate mean', 'Mean paired change', RANGE_HEADER, 'n', 'Runs improved'], rows),
    '</section>',
  ].join('\n');
}

function drainCapSection(c: Source): string {
  if (c.completion.baselineCapped + c.completion.candidateCapped === 0) return '';
  const note = c.metrics.find((m) => m.note !== null)?.note
    ?? `${c.completion.baselineCapped} of ${REPLICATIONS} baseline runs and ${c.completion.candidateCapped} of ${REPLICATIONS} candidate runs hit the drain cap; completed-journey metrics count completed attendees only`;
  return ['<section id="drain-cap">', el('h2', 'Drain cap reached'), el('p', note), '</section>'].join('\n');
}

function assumptionsSection(c: Source): string {
  return [
    '<section id="assumptions">',
    el('h2', 'Assumptions and limits'),
    '<ul>',
    ...ASSUMPTIONS.map((line) => el('li', line)),
    '</ul>',
    el('p', LIMITS_TEXT),
    el('p', NOT_A_FORECAST),
    el('p', modelVersionLine(c.modelVersion)),
    el('p', `Baseline scenario hash ${c.baseline.scenarioHash}`),
    el('p', `Candidate scenario hash ${c.candidate.scenarioHash}`),
    '</section>',
  ].join('\n');
}

/** The printable comparison: a complete HTML document from a live comparison or a restored summary. Reads no clock. */
export function renderComparisonHtml(comparison: Source, options: { generatedAt: string }): string {
  const heading = `Rehearsal comparison: ${comparison.baseline.title} vs ${comparison.candidate.title}`;
  const body = [
    el('h1', heading),
    el('p', `Generated ${options.generatedAt.slice(0, 10)}`),
    scenariosSection(comparison),
    changesSection(comparison),
    metricsSection(comparison),
    stationsSection(comparison),
    drainCapSection(comparison),
    assumptionsSection(comparison),
  ].filter((part) => part !== '').join('\n');
  return htmlDocument(heading, body);
}

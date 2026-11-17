// The slope chart of the paired runs: one thin line per replication from the baseline value to the candidate value of the
// mean queue wait of that replication, on one scale from 0. The values are the paired metric's own per-replication numbers.
// The drawing is hidden from assistive technology; the sentence under it is its text alternative.
import type { ReactElement } from 'react';

export type SlopePair = { replication: number; baselineMs: number | null; candidateMs: number | null };

const WIDTH = 320;
const HEIGHT = 170;
/** The category names sit below the plot with their own band, clear of the lowest scale label. */
const CATEGORY_Y = 164;
const TOP = 12;
const BOTTOM = 138;
const LEFT_X = 48;
const RIGHT_X = 272;
const STEP_S = 50;

export type SlopeLine = { replication: number; baselineMs: number; candidateMs: number; x1: number; y1: number; x2: number; y2: number };
export type SlopeGeometry = { width: number; height: number; top: number; bottom: number; maxS: number; ticks: { s: number; y: number }[]; lines: SlopeLine[] };

type Drawn = { replication: number; baselineMs: number; candidateMs: number };
const drawable = (pairs: SlopePair[]): Drawn[] =>
  pairs.flatMap((p) => (p.baselineMs === null || p.candidateMs === null ? [] : [{ replication: p.replication, baselineMs: p.baselineMs, candidateMs: p.candidateMs }]));

export function slopeGeometry(pairs: SlopePair[]): SlopeGeometry {
  const drawn = drawable(pairs);
  const peakS = Math.max(0, ...drawn.flatMap((p) => [p.baselineMs, p.candidateMs])) / 1000;
  const maxS = Math.max(STEP_S, Math.ceil(peakS / STEP_S) * STEP_S);
  const y = (ms: number): number => BOTTOM - (ms / 1000 / maxS) * (BOTTOM - TOP);
  const ticks = [0, maxS / 2, maxS].map((s) => ({ s, y: y(s * 1000) }));
  return {
    width: WIDTH, height: HEIGHT, top: TOP, bottom: BOTTOM, maxS, ticks,
    lines: drawn.map((p) => ({ ...p, x1: LEFT_X, y1: y(p.baselineMs), x2: RIGHT_X, y2: y(p.candidateMs) })),
  };
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** The text alternative: the range of the per-run baseline values and of the candidate values. */
export function slopeSummary(pairs: SlopePair[]): string {
  const drawn = drawable(pairs);
  if (drawn.length === 0) return 'No paired run has a mean queue wait to draw.';
  const range = (values: number[]): string => `${seconds(Math.min(...values))} to ${seconds(Math.max(...values))}`;
  return `Mean queue wait per run, baseline ${range(drawn.map((p) => p.baselineMs))}, candidate ${range(drawn.map((p) => p.candidateMs))}.`;
}

export function SlopeChart({ pairs }: { pairs: SlopePair[] }): ReactElement | null {
  const drawn = drawable(pairs);
  if (drawn.length === 0) return null;
  const g = slopeGeometry(pairs);
  return (
    <figure className="chart slope-chart" data-testid="slope-chart">
      <figcaption>{`${drawn.length} paired runs, same guests in both`}</figcaption>
      <svg viewBox={`0 0 ${g.width} ${g.height}`} aria-hidden="true" focusable="false">
        {g.ticks.map((t) => (
          <g key={t.s}>
            <line className="chart-grid" x1={LEFT_X - 8} x2={RIGHT_X + 8} y1={t.y} y2={t.y} />
            <text className="chart-tick" x={LEFT_X - 12} y={t.y + 4} textAnchor="end">{`${t.s} s`}</text>
          </g>
        ))}
        {g.lines.map((line, i) => (
          <line
            key={line.replication}
            data-testid="slope-line"
            data-replication={line.replication}
            data-baseline-ms={line.baselineMs}
            data-candidate-ms={line.candidateMs}
            className="slope-line"
            style={{ animationDelay: `${i * 20}ms` }}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            pathLength={1}
          />
        ))}
        <text className="chart-tick" x={LEFT_X} y={CATEGORY_Y} textAnchor="middle">Baseline</text>
        <text className="chart-tick" x={RIGHT_X} y={CATEGORY_Y} textAnchor="middle">Candidate</text>
      </svg>
      <p className="muted">{slopeSummary(pairs)}</p>
    </figure>
  );
}
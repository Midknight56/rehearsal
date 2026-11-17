// "People waiting, minute by minute": one bar per simulated minute, a playhead at the replay clock. The numbers come from
// waitingPerMinute (the sampler). The drawing is hidden from assistive technology; the sentence under it is its text alternative.
import type { ReactElement } from 'react';
import { waitingSummary } from '../../replay/waitingSeries';

const WIDTH = 480;
const HEIGHT = 120;
const PAD_TOP = 4;
const MINUTE_MS = 60_000;

export type ChartGeometry = {
  width: number;
  height: number;
  bars: { minute: number; people: number; x: number; y: number; width: number; height: number }[];
  playheadX: number;
};

/** Bars scale to the tallest minute; the playhead is the clock in minutes of bar width, clamped to the chart. */
export function chartGeometry(series: number[], clockMs: number): ChartGeometry {
  const peak = Math.max(1, ...series);
  const barWidth = WIDTH / Math.max(1, series.length);
  const usable = HEIGHT - PAD_TOP;
  const bars = series.map((people, minute) => {
    const height = (people / peak) * usable;
    return { minute, people, x: minute * barWidth, y: HEIGHT - height, width: barWidth, height };
  });
  const playheadX = Math.min(WIDTH, Math.max(0, (clockMs / MINUTE_MS) * barWidth));
  return { width: WIDTH, height: HEIGHT, bars, playheadX };
}

export function WaitingChart({ series, clockMs }: { series: number[]; clockMs: number }): ReactElement {
  const geometry = chartGeometry(series, clockMs);
  return (
    <figure className="chart waiting-chart" data-testid="waiting-chart">
      <figcaption>People waiting, minute by minute</figcaption>
      <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line className="chart-base" x1={0} x2={geometry.width} y1={geometry.height} y2={geometry.height} />
        {geometry.bars.map((bar) => (
          <rect
            key={bar.minute}
            data-testid="waiting-bar"
            data-minute={bar.minute}
            data-people={bar.people}
            className="chart-bar"
            x={bar.x}
            y={bar.y}
            width={Math.max(0.5, bar.width - 1)}
            height={bar.height}
          />
        ))}
        <line className="chart-playhead" data-testid="waiting-playhead" x1={geometry.playheadX} x2={geometry.playheadX} y1={0} y2={geometry.height} />
      </svg>
      <p className="muted">{waitingSummary(series)}</p>
    </figure>
  );
}
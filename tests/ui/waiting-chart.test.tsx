// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WaitingChart, chartGeometry } from '../../src/ui/game/WaitingChart';
import { waitingSummary } from '../../src/replay/waitingSeries';

afterEach(() => cleanup());

const SERIES = [0, 3, 14, 6, 0, 2];

describe('People waiting, minute by minute', () => {
  it('draws one bar per minute whose value and height equal the data', () => {
    render(<WaitingChart series={SERIES} clockMs={0} />);
    const bars = [...document.querySelectorAll('[data-testid="waiting-bar"]')];
    expect(bars).toHaveLength(SERIES.length);
    const geometry = chartGeometry(SERIES, 0);
    bars.forEach((bar, minute) => {
      expect(Number(bar.getAttribute('data-minute'))).toBe(minute);
      expect(Number(bar.getAttribute('data-people'))).toBe(SERIES[minute]);
      expect(Number(bar.getAttribute('height'))).toBeCloseTo(geometry.bars[minute]!.height, 6);
    });
    const tallest = Math.max(...bars.map((b) => Number(b.getAttribute('height'))));
    expect(Number(bars[2]!.getAttribute('height'))).toBe(tallest);
    expect(Number(bars[1]!.getAttribute('height')) / tallest).toBeCloseTo(3 / 14, 6);
    expect(Number(bars[0]!.getAttribute('height'))).toBe(0);
  });

  it('puts the playhead at the replay clock', () => {
    const { rerender } = render(<WaitingChart series={SERIES} clockMs={0} />);
    const x = () => Number(screen.getByTestId('waiting-playhead').getAttribute('x1'));
    expect(x()).toBe(0);
    rerender(<WaitingChart series={SERIES} clockMs={150_000} />);
    expect(x()).toBeCloseTo(chartGeometry(SERIES, 150_000).playheadX, 6);
    expect(x()).toBeCloseTo((2.5 / SERIES.length) * chartGeometry(SERIES, 0).width, 6);
    rerender(<WaitingChart series={SERIES} clockMs={99_999_999} />);
    expect(x()).toBe(chartGeometry(SERIES, 0).width);
  });

  it('has a caption and a text alternative written from the same numbers; the drawing itself is hidden from readers', () => {
    render(<WaitingChart series={SERIES} clockMs={0} />);
    expect(screen.getByText('People waiting, minute by minute')).toBeTruthy();
    expect(screen.getByText(waitingSummary(SERIES))).toBeTruthy();
    expect(document.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('[aria-live], [role="status"]')).toBeNull();
  });

  it('no bar for a series of nothing: the sentence says so', () => {
    render(<WaitingChart series={[0]} clockMs={0} />);
    expect(screen.getByText('Nobody is waiting at any simulated minute.')).toBeTruthy();
  });
});
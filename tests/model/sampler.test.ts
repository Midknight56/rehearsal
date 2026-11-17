import { describe, expect, it, vi } from 'vitest';
import { toDurationMs } from '../../src/domain/validate';
import { serviceDurationMs, triangular } from '../../src/simulation/sampling';

describe('row 5: triangular sampler and duration conversion', () => {
  it('triangular(u, 10, 20, 30) at u = 0.125, 0.5, 0.875 is 15, 20, 25', () => {
    expect(triangular(0.125, 10, 20, 30)).toBeCloseTo(15, 9);
    expect(triangular(0.5, 10, 20, 30)).toBeCloseTo(20, 9);
    expect(triangular(0.875, 10, 20, 30)).toBeCloseTo(25, 9);
  });

  it('a degenerate triangle returns its value', () => {
    expect(triangular(0.3, 7, 7, 7)).toBe(7);
  });

  it('toDurationMs rounds and never returns 0', () => {
    expect(toDurationMs(0.0004)).toBe(1);
    expect(toDurationMs(15)).toBe(15_000);
  });

  it('a constant service takes no draw', () => {
    const draw = vi.fn(() => 0.5);
    expect(serviceDurationMs({ kind: 'constant', seconds: 15 }, draw)).toBe(15_000);
    expect(draw).not.toHaveBeenCalled();
  });
});
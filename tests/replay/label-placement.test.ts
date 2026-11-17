import { describe, expect, it } from 'vitest';
import { boxAt, clampInto, placeLabels } from '../../src/replay/labelPlacement';

describe('label placement', () => {
  const canvas = { w: 100, h: 60 };

  it('clamps a box into the canvas', () => {
    expect(clampInto({ x: -5, y: 70 }, 20, 10, canvas)).toEqual({ x: 0, y: 50 });
    expect(clampInto({ x: 95, y: 0 }, 20, 10, canvas)).toEqual({ x: 80, y: 0 });
  });

  it('takes the first candidate that is clear of the markers and of earlier labels', () => {
    const marker = { left: 0, top: 20, right: 10, bottom: 30 };
    const spots = placeLabels(
      canvas,
      [marker],
      [
        { id: 'a', w: 20, h: 8, candidates: [{ x: 0, y: 20 }, { x: 12, y: 20 }] },
        { id: 'b', w: 20, h: 8, candidates: [{ x: 12, y: 20 }, { x: 12, y: 40 }] },
      ],
      1,
    );
    expect(spots.get('a')).toEqual({ x: 12, y: 20 });
    expect(spots.get('b')).toEqual({ x: 12, y: 40 });
  });

  it('drops an optional label that has no room and keeps a required one at its least overlapping spot', () => {
    const full = { left: 0, top: 0, right: 100, bottom: 60 };
    const spots = placeLabels(canvas, [full], [
      { id: 'must', w: 20, h: 8, candidates: [{ x: 10, y: 10 }] },
      { id: 'maybe', w: 20, h: 8, candidates: [{ x: 10, y: 10 }], optional: true },
    ], 1);
    expect(spots.get('must')).toEqual({ x: 10, y: 10 });
    expect(spots.get('maybe')).toBeNull();
    expect(boxAt({ x: 1, y: 2 }, 3, 4)).toEqual({ left: 1, top: 2, right: 4, bottom: 6 });
  });
});

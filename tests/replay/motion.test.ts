import { describe, expect, it } from 'vitest';
import { createCamera } from '../../src/replay/camera';
import { CAMERA_EASE_MS, GLIDE_MS, PULSE_MS, easeOutCubic, ghostSizePx, lerp, pulseScale } from '../../src/replay/easing';
import { createGlide } from '../../src/replay/glide';

// The motion of the design (Motion section of the handoff): display only, nothing here reads or changes the model.

describe('easing and the fixed durations', () => {
  it('uses the durations of the design', () => {
    expect(GLIDE_MS).toBe(120);
    expect(CAMERA_EASE_MS).toBe(400);
    expect(PULSE_MS).toBe(600);
  });

  it('easeOutCubic starts at 0, ends at exactly 1, is monotonic and fast at the start', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(2)).toBe(1);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    let last = 0;
    for (let i = 1; i <= 20; i += 1) {
      const v = easeOutCubic(i / 20);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('lerp is exact at both ends', () => {
    expect(lerp(3, 9, 0)).toBe(3);
    expect(lerp(3, 9, 1)).toBe(9);
    expect(lerp(3, 9, 0.5)).toBe(6);
  });
});

describe('the pulse of the followed ring: scale 1 to 1.25 to 1 in 600 ms', () => {
  it('is 1 at both ends, 1.25 at 300 ms, and 1 outside the pulse', () => {
    expect(pulseScale(0)).toBe(1);
    expect(pulseScale(300)).toBeCloseTo(1.25, 10);
    expect(pulseScale(600)).toBe(1);
    expect(pulseScale(5000)).toBe(1);
    expect(pulseScale(-10)).toBe(1);
  });

  it('never leaves [1, 1.25] and rises, then falls', () => {
    for (let ms = 0; ms <= 600; ms += 25) {
      const s = pulseScale(ms);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(1.25 + 1e-9);
    }
    expect(pulseScale(150)).toBeGreaterThan(pulseScale(50));
    expect(pulseScale(450)).toBeGreaterThan(pulseScale(550));
  });
});

describe('ghost size scales with the camera zoom', () => {
  it('is 26 px at the fitted view on a wide canvas and 14 px on a phone canvas', () => {
    expect(ghostSizePx({ canvasWidth: 1296, zoom: 1.5, fitZoom: 1.5 })).toBe(26);
    expect(ghostSizePx({ canvasWidth: 328, zoom: 0.5, fitZoom: 0.5 })).toBe(14);
  });

  it('grows with the zoom and stays inside 8 to 52 px', () => {
    expect(ghostSizePx({ canvasWidth: 1296, zoom: 3, fitZoom: 1.5 })).toBe(52);
    expect(ghostSizePx({ canvasWidth: 328, zoom: 1, fitZoom: 0.5 })).toBe(28);
    expect(ghostSizePx({ canvasWidth: 328, zoom: 0.001, fitZoom: 0.5 })).toBe(8);
  });
});

describe('the glide of a ghost between cells (display only)', () => {
  it('moves in a straight line at constant speed over 120 ms and ends exactly on the target', () => {
    const glide = createGlide();
    expect(glide.at('a', [0, 0], 0, { durationMs: 120, snap: false })).toEqual([0, 0]);
    // A jump of three cells starts a glide from where it was drawn.
    const p0 = glide.at('a', [3, 0], 1000, { durationMs: 120, snap: false });
    expect(p0).toEqual([0, 0]);
    expect(glide.at('a', [3, 0], 1030, { durationMs: 120, snap: false })[0]).toBeCloseTo(0.75, 10);
    expect(glide.at('a', [3, 0], 1060, { durationMs: 120, snap: false })[0]).toBeCloseTo(1.5, 10);
    expect(glide.at('a', [3, 0], 1120, { durationMs: 120, snap: false })).toEqual([3, 0]);
    expect(glide.active(1121)).toBe(false);
    expect(glide.at('a', [3, 0], 5000, { durationMs: 120, snap: false })).toEqual([3, 0]);
  });

  it('reports itself active only while a glide is running', () => {
    const glide = createGlide();
    glide.at('a', [0, 0], 0, { durationMs: 120, snap: false });
    expect(glide.active(0)).toBe(false);
    glide.at('a', [2, 2], 10, { durationMs: 120, snap: false });
    expect(glide.active(50)).toBe(true);
    expect(glide.active(129)).toBe(true);
    expect(glide.active(130)).toBe(false);
  });

  it('follows the live target while gliding, so a walker never ends behind it', () => {
    const glide = createGlide();
    glide.at('a', [0, 0], 0, { durationMs: 120, snap: false });
    glide.at('a', [3, 0], 10, { durationMs: 120, snap: false });
    expect(glide.at('a', [5, 0], 70, { durationMs: 120, snap: false })[0]).toBeCloseTo(2.5, 10);
    expect(glide.at('a', [5, 0], 130, { durationMs: 120, snap: false })).toEqual([5, 0]);
  });

  it('does not glide a small step (a walker moves a fraction of a cell per frame)', () => {
    const glide = createGlide();
    glide.at('a', [0, 0], 0, { durationMs: 120, snap: false });
    expect(glide.at('a', [0.3, 0], 16, { durationMs: 120, snap: false })).toEqual([0.3, 0]);
    expect(glide.active(17)).toBe(false);
  });

  it('snaps at once when scrubbing, whatever the distance', () => {
    const glide = createGlide();
    glide.at('a', [0, 0], 0, { durationMs: 120, snap: false });
    expect(glide.at('a', [30, 10], 5, { durationMs: 120, snap: true })).toEqual([30, 10]);
    expect(glide.active(6)).toBe(false);
  });

  it('keeps one state for each id and forgets them on clear', () => {
    const glide = createGlide();
    glide.at('a', [0, 0], 0, { durationMs: 120, snap: false });
    glide.at('b', [9, 9], 0, { durationMs: 120, snap: false });
    expect(glide.at('a', [4, 0], 10, { durationMs: 120, snap: false })).toEqual([0, 0]);
    expect(glide.at('b', [9, 9], 10, { durationMs: 120, snap: false })).toEqual([9, 9]);
    glide.clear();
    expect(glide.at('a', [20, 0], 20, { durationMs: 120, snap: false })).toEqual([20, 0]);
  });
});

describe('the camera eases 400 ms ease-out and snaps when asked', () => {
  const view = { width: 800, height: 600, cellPx: 16 };

  it('centerOn still moves at once', () => {
    const camera = createCamera(view);
    camera.centerOn([10, 5]);
    expect(camera.easing).toBe(false);
    const [x, y] = camera.toScreen([10, 5]);
    expect([x, y]).toEqual([400, 300]);
  });

  it('eases the centre and the zoom, fast first, and ends exactly on the target after 400 ms', () => {
    const camera = createCamera(view);
    camera.setZoom(1);
    camera.centerOn([0, 0]);
    camera.beginEase(1000, CAMERA_EASE_MS, 2);
    expect(camera.easing).toBe(true);
    camera.moveTo([10, 0], 1000);
    expect(camera.toScreen([0, 0])[0]).toBeCloseTo(400, 6);
    camera.moveTo([10, 0], 1200);
    // Half the time is more than half the way with an ease-out curve.
    const centreX = (): number => (400 - camera.toScreen([0, 0])[0]) / (16 * camera.zoom);
    expect(centreX()).toBeGreaterThan(5);
    expect(centreX()).toBeLessThan(10);
    expect(camera.zoom).toBeGreaterThan(1.5);
    camera.moveTo([10, 0], 1400);
    expect(camera.easing).toBe(false);
    expect(camera.zoom).toBe(2);
    expect(camera.toScreen([10, 0])).toEqual([400, 300]);
  });

  it('follows a moving target while easing, and ends on the target position', () => {
    const camera = createCamera(view);
    camera.centerOn([0, 0]);
    camera.beginEase(0, 400, 1);
    camera.moveTo([4, 0], 100);
    camera.moveTo([8, 0], 400);
    expect(camera.toScreen([8, 0])).toEqual([400, 300]);
  });

  it('with a zero duration it lands at once', () => {
    const camera = createCamera(view);
    camera.beginEase(0, 0, 3);
    camera.moveTo([7, 7], 0);
    expect(camera.easing).toBe(false);
    expect(camera.zoom).toBe(3);
    expect(camera.toScreen([7, 7])).toEqual([400, 300]);
  });
});

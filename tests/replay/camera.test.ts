import { describe, expect, it } from 'vitest';
import { createCamera } from '../../src/replay/camera';

describe('camera (requirement 7.1)', () => {
  it('centerOn puts the position at the viewport centre', () => {
    const camera = createCamera({ width: 800, height: 600, cellPx: 16 });
    camera.centerOn([12.5, 7]);
    const [x, y] = camera.toScreen([12.5, 7]);
    expect(Math.abs(x - 400)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(y - 300)).toBeLessThanOrEqual(0.5);
  });

  it('keeps the zoom inside [0.5, 4]', () => {
    const camera = createCamera({ width: 800, height: 600, cellPx: 16 });
    camera.setZoom(10);
    expect(camera.zoom).toBe(4);
    camera.setZoom(0.01);
    expect(camera.zoom).toBe(0.5);
  });
});

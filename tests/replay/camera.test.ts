import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkProperty } from '../ui/property';
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

describe('P12 follow (requirements 7.1 and 7.7)', () => {
  it('centerOn maps any position to the viewport centre within 0.5 px for any viewport and zoom in [0.5, 4]', async () => {
    const inputs = fc.record({
      width: fc.integer({ min: 100, max: 2000 }),
      height: fc.integer({ min: 100, max: 1400 }),
      cellPx: fc.integer({ min: 4, max: 48 }),
      zoom: fc.double({ min: 0.5, max: 4, noNaN: true }),
      x: fc.double({ min: -10, max: 90, noNaN: true }),
      y: fc.double({ min: -10, max: 90, noNaN: true }),
    });
    await checkProperty('P12 follow', inputs, ({ width, height, cellPx, zoom, x, y }) => {
      const camera = createCamera({ width, height, cellPx });
      camera.setZoom(zoom);
      camera.centerOn([x, y]);
      const [sx, sy] = camera.toScreen([x, y]);
      expect(Math.abs(sx - width / 2)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(sy - height / 2)).toBeLessThanOrEqual(0.5);
    });
  });
});
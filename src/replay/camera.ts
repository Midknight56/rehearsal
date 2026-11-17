// Follow camera, display state only (requirement 7.1, property P12). The camera is a centre in cell units and a zoom in
// [0.5, 4]; toScreen maps a cell position to viewport pixels. No tween: centerOn moves the centre at once, so reduced motion
// needs no special case. This file imports nothing from the engine folders (invariant I6).

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export type Camera = {
  zoom: number;
  setZoom(z: number): void;
  centerOn(position: [number, number]): void;
  /** Cell position to viewport pixels. */
  toScreen(position: [number, number]): [number, number];
};

export function createCamera(viewport: { width: number; height: number; cellPx: number }): Camera {
  let cx = viewport.width / (2 * viewport.cellPx);
  let cy = viewport.height / (2 * viewport.cellPx);
  const camera: Camera = {
    zoom: 1,
    setZoom(z) {
      camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(z) ? z : 1));
    },
    centerOn(position) {
      cx = position[0];
      cy = position[1];
    },
    toScreen(position) {
      const scale = viewport.cellPx * camera.zoom;
      return [(position[0] - cx) * scale + viewport.width / 2, (position[1] - cy) * scale + viewport.height / 2];
    },
  };
  return camera;
}
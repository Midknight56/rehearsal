// Follow camera, display state only (requirement 7.1, property P12). The camera is a centre in cell units and a zoom in
// [0.5, 4]; toScreen maps a cell position to viewport pixels. centerOn moves the centre at once. beginEase and moveTo give the
// eased move of the design (ease-out over a set time); under reduced motion the caller never begins an ease, so the camera
// snaps. This file imports nothing from the engine folders (invariant I6).
import { easeOutCubic, lerp } from './easing';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export type Camera = {
  zoom: number;
  /** True from beginEase until a moveTo at or after its end. */
  readonly easing: boolean;
  setZoom(z: number): void;
  /** The zoom that fits the whole floor in the canvas: it may be below the user's minimum, so a large floor on a phone is not cut off. */
  setFitZoom(z: number): void;
  centerOn(position: [number, number]): void;
  /** Starts an ease from the present centre and zoom to `toZoom`; the centre target is given to each moveTo. */
  beginEase(nowMs: number, durationMs: number, toZoom: number): void;
  /** Puts the centre on `position`, or, while an ease runs, part of the way there; ends the ease on time, exactly on target. */
  moveTo(position: [number, number], nowMs: number): void;
  /** Cell position to viewport pixels. */
  toScreen(position: [number, number]): [number, number];
};

type Ease = { startMs: number; durationMs: number; fromC: [number, number]; fromZoom: number; toZoom: number };

const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(z) ? z : 1));
const fitClamp = (z: number): number => Math.min(MAX_ZOOM, Math.max(0.05, Number.isFinite(z) ? z : 1));

export function createCamera(viewport: { width: number; height: number; cellPx: number }): Camera {
  let cx = viewport.width / (2 * viewport.cellPx);
  let cy = viewport.height / (2 * viewport.cellPx);
  let ease: Ease | null = null;
  const camera: Camera = {
    zoom: 1,
    get easing() {
      return ease !== null;
    },
    setZoom(z) {
      camera.zoom = clampZoom(z);
    },
    setFitZoom(z) {
      camera.zoom = fitClamp(z);
    },
    centerOn(position) {
      cx = position[0];
      cy = position[1];
    },
    beginEase(nowMs, durationMs, toZoom) {
      ease = { startMs: nowMs, durationMs, fromC: [cx, cy], fromZoom: camera.zoom, toZoom: fitClamp(toZoom) };
    },
    moveTo(position, nowMs) {
      if (ease === null) {
        camera.centerOn(position);
        return;
      }
      const t = ease.durationMs <= 0 ? 1 : (nowMs - ease.startMs) / ease.durationMs;
      if (t >= 1) {
        camera.zoom = ease.toZoom;
        ease = null;
        camera.centerOn(position);
        return;
      }
      const e = easeOutCubic(t);
      camera.zoom = lerp(ease.fromZoom, ease.toZoom, e);
      cx = lerp(ease.fromC[0], position[0], e);
      cy = lerp(ease.fromC[1], position[1], e);
    },
    toScreen(position) {
      const scale = viewport.cellPx * camera.zoom;
      return [(position[0] - cx) * scale + viewport.width / 2, (position[1] - cy) * scale + viewport.height / 2];
    },
  };
  return camera;
}

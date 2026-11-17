// The motion of the design, as pure functions of elapsed time. Display only: nothing here reads the trace or the model, and
// no file in the engine folders imports it.

/** One step of a ghost between cells at 1x. */
export const GLIDE_MS = 120;
/** The follow camera, ease-out. */
export const CAMERA_EASE_MS = 400;
/** The followed ring pulses once on selection. */
export const PULSE_MS = 600;
export const PULSE_PEAK = 1.25;

const clamp01 = (t: number): number => (Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0);

/** 0 at 0, exactly 1 at 1 and beyond, fast at the start. */
export function easeOutCubic(t: number): number {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** Scale of the followed ring `elapsedMs` after it was selected: 1 to 1.25 to 1 in 600 ms, then 1. */
export function pulseScale(elapsedMs: number): number {
  if (!(elapsedMs > 0) || elapsedMs >= PULSE_MS) return 1;
  return 1 + (PULSE_PEAK - 1) * Math.sin((Math.PI * elapsedMs) / PULSE_MS);
}

const DESKTOP_GHOST_PX = 26;
const PHONE_GHOST_PX = 14;
const PHONE_CANVAS_PX = 480;
const MIN_GHOST_PX = 8;
const MAX_GHOST_PX = 52;

/**
 * A ghost's width in px: 26 px on a desktop canvas and 14 px on a phone canvas when the whole floor is fitted, scaled with the
 * camera zoom (a zoomed camera draws larger ghosts), kept within 8 to 52 px.
 */
export function ghostSizePx(view: { canvasWidth: number; zoom: number; fitZoom: number }): number {
  const base = view.canvasWidth < PHONE_CANVAS_PX ? PHONE_GHOST_PX : DESKTOP_GHOST_PX;
  const scale = view.fitZoom > 0 ? view.zoom / view.fitZoom : 1;
  return Math.min(MAX_GHOST_PX, Math.max(MIN_GHOST_PX, Math.round(base * scale)));
}

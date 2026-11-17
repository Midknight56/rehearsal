// The game view behind GameViewHandle (requirements 6.1 to 6.9, 7.1, 7.2, 7.7). One PixiJS canvas draws what the sampler
// returns for the replay clock: sprites from a pool of 1,000, queue lines, badges for the attendees beyond the cap, the
// station markers and the follow and selection rings. Nothing here advances model state or calls the simulation.
//
// PixiJS 8.22.0 names used, and used only in this file (read from node_modules/pixi.js/lib, version 8.22.0):
//   new Application() then `await app.init({ width, height, resolution, autoDensity, antialias, backgroundAlpha, preference, autoStart: false })`;
//   `app.canvas`, `app.stage`, `app.renderer.resolution`, `app.renderer.resize(w, h)`, `app.render()`;
//   `app.ticker.add(fn)`, `app.ticker.remove(fn)`, `app.ticker.start()`, `app.ticker.stop()`, `app.ticker.started`;
//   `app.destroy({ removeView: true }, { children: true })`;
//   `new Container()`, `new Graphics()` with `clear()`, `rect()`, `circle()`, `moveTo()`, `lineTo()`, `fill({ color, alpha })`, `stroke({ width, color, alpha })`;
//   `new Text({ text, style: { fontSize, fill } })`, `roundRect()`, `circle()`, `stroke({ width, color, alpha, texture, textureSpace: 'global' })` with a canvas tile from `Texture.from(canvas)`
//   whose `source.style.addressMode` is 'repeat' (the chalk texture on strokes only).
// The ticker's own deltaMS is not used: the clock advances by the real time between two frames measured here, capped at 250 ms,
// so a ticker that was stopped (hidden tab, pause) never adds the time it was stopped.
import type { Application, Graphics, Text, Texture } from 'pixi.js';
import type { Scenario } from '../domain/scenario';
import type { Trace } from '../simulation/trace';
import { badgeLines } from './badges';
import { MAX_ZOOM, MIN_ZOOM, createCamera, type Camera } from './camera';
import { CAMERA_EASE_MS, GLIDE_MS, PULSE_MS, ghostSizePx, pulseScale } from './easing';
import { createGlide } from './glide';
import { createReplayCore, type Hit, type LoadInput, type ReplayCore } from './core';
import { failed } from './fallback';
import { ghostKey, lookOf, splitLayers } from './ghost';
import { createPool, type Pool } from './pool';
import { queueColour, queueSlot } from './queueLine';
import { sampleAt, type AttendeeSample, type Sample } from './sampler';
import { longestWaitMs, waitColour, waitedMsAt } from './waitRamp';

export type { Hit } from './core';

export type GameViewOptions = {
  container: HTMLElement; reducedMotion: boolean; test: boolean; dpr: number;
  /** Read at every moment motion is decided (a camera ease, the pulse), so the Motion toggle works without a restart; `reducedMotion` is the value at creation. */
  isReducedMotion?: () => boolean;
};
export type GameViewDebug = {
  tickerRunning: boolean; resolution: number; clockMs: number; playing: boolean; speed: number; follow: string | null;
  spritesDrawn: number; spritesPooled: number; aggregatedAttendees: number; ghostLoaded: boolean; framesLast2s: number;
  rendererStatus: 'ready' | 'unavailable' | 'destroyed';
  /** Test aid: the ghost width in px at the current zoom, the followed ring's pulse scale, whether the camera or a glide is moving, and whether strokes carry the chalk texture. */
  motion?: { ghostPx: number; ringScale: number; cameraEasing: boolean; glideActive: boolean; chalkTexture: boolean; zoom: number; fitZoom: number };
  /** Test aid: canvas-relative CSS px of the entrance, the exit and the stations; see buildHandle. */
  projection?: Record<string, unknown> | null;
  /** Test aid: canvas size and the bounds of every visible label; see buildHandle. */
  labelBounds?: Record<string, unknown>;
};
export interface GameViewHandle {
  load(input: { trace: Trace; layout: Scenario['layout']; stations: Scenario['stations']; label: string; endMs?: number }): void;
  play(): void;
  pause(): void;
  setSpeed(s: 1 | 4 | 16): void;
  step(delta: 1000 | -1000): void;
  seek(ms: number): void;
  follow(attendeeId: string | null): void;
  select(target: Hit | null): void;
  setGhost(trace: Trace | null, stations?: Scenario['stations']): void;
  onHit(cb: (hit: Hit) => void): () => void;
  onClock(cb: (ms: number, playing: boolean) => void): () => void;
  onFollowEnd(cb: (id: string, exitedAtMs: number) => void): () => void;
  sampleNow(): Sample;
  debug(): GameViewDebug;
  destroy(): void;
}
export type SamplerOnly = Pick<GameViewHandle, 'load' | 'seek' | 'step' | 'sampleNow' | 'onClock'>;
export type CreateGameViewResult =
  | { ok: true; handle: GameViewHandle }
  | { ok: false; reason: 'init-failed' | 'no-context' | 'forced'; message: string; sampler: SamplerOnly };

export const SPRITE_CAP = 1000;
export const SPRITE_CAP_WITH_GHOST = 500;
const CELL_PX = 16;

/**
 * The canvas height for a container width. With the floor's size the canvas takes the floor's proportions, so the fitted floor
 * fills it (1,296 px wide gives 778 px for a 40 by 24 floor; 328 px wide gives 197 px); the height stays between 120 and 800 px,
 * and a floor too tall for that is as wide as its height allows. Without a floor, a short strip on a phone and up to 600 px on
 * a wide screen. Drawing only.
 */
export function viewHeightFor(width: number, layout?: { cols: number; rows: number }): number {
  if (layout !== undefined && layout.cols > 0 && layout.rows > 0) return Math.min(800, Math.max(120, Math.round((width * layout.rows) / layout.cols)));
  return width < 480 ? Math.max(160, Math.round(width * 0.58)) : Math.min(600, Math.max(420, Math.round(width * 0.46)));
}
const MAX_FRAME_MS = 250;

const COLOUR = { floor: 0x1b2e28, line: 0xf2efe6, ink: 0xf2efe6, muted: 0xb9c7be, blocked: 0x5e7a6e, candidate: 0x9fd8b4, board: 0x233b33, boardDeep: 0x1b2e28, focus: 0xf2d377, lane: 0xff9a3d } as const;
// Chalk strokes: 2 to 3 px, with a rough noise texture on the strokes only (never on text).
const WALL_PX = 3;
const STROKE_PX = 2.5;
const PATH_DOT_PX = 2;
const PATH_DOT_GAP_PX = 7;
const MAX_PATH_LABELS = 24;
const LANE_ALPHA = 0.09;
const EYES_FROM_PX = 18;
const GHOST_LOOK = lookOf('baseline');
const CANDIDATE_LOOK = lookOf('candidate');

let forced = false;
/** Test hook (task 11): makes the next createGameView report `forced`, as `?renderer=off` does in the test build. */
export function forceRendererFailure(on: boolean): void {
  forced = on;
}

function hasGraphicsContext(): boolean {
  try {
    const probe = document.createElement('canvas');
    return probe.getContext('webgl2') !== null || probe.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

export async function createGameView(opts: GameViewOptions): Promise<CreateGameViewResult> {
  const settings = { autoplay: !opts.reducedMotion };
  const core = createReplayCore(settings);
  const fail = (reason: 'init-failed' | 'no-context' | 'forced', message: string): CreateGameViewResult => {
    settings.autoplay = false; // no ticker exists to advance the clock
    return failed(core, reason, message);
  };

  if (forced || (opts.test && new URLSearchParams(window.location.search).get('renderer') === 'off')) {
    return fail('forced', 'The renderer was switched off for this test.');
  }
  if (!hasGraphicsContext()) return fail('no-context', 'This browser offers no graphics context.');

  let PIXI: typeof import('pixi.js');
  let app: Application;
  const width0 = Math.max(240, opts.container.clientWidth || 640);
  try {
    PIXI = await import('pixi.js');
    app = new PIXI.Application();
    await app.init({
      width: width0,
      height: viewHeightFor(width0),
      resolution: Math.min(opts.dpr, 2),
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      preference: 'webgl',
      autoStart: false,
    });
  } catch (error) {
    return fail('init-failed', error instanceof Error ? error.message : 'The renderer could not start.');
  }
  return { ok: true, handle: buildHandle(PIXI, app, core, opts) };
}

/** A 64 px tile of white noise with holes, drawn on a canvas once: the rough texture of a chalk stroke. A fixed sequence, no random state. */
function makeChalkTexture(PIXI: typeof import('pixi.js')): Texture | null {
  try {
    const tile = document.createElement('canvas');
    tile.width = 64;
    tile.height = 64;
    const context = tile.getContext('2d');
    if (context === null) return null;
    const image = context.createImageData(64, 64);
    let seed = 20251117;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 64 * 64; i += 1) {
      image.data[i * 4] = 255;
      image.data[i * 4 + 1] = 255;
      image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = next() < 0.05 ? 0 : Math.round(205 + 50 * next());
    }
    context.putImageData(image, 0, 0);
    const texture = PIXI.Texture.from(tile);
    texture.source.style.addressMode = 'repeat';
    return texture;
  } catch {
    return null;
  }
}

function buildHandle(PIXI: typeof import('pixi.js'), app: Application, core: ReplayCore, opts: GameViewOptions): GameViewHandle {
  const canvas = app.canvas;
  opts.container.appendChild(canvas);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Replay of the simulated run. The timeline and result tables hold every number.');
  const reducedNow = (): boolean => (opts.isReducedMotion === undefined ? opts.reducedMotion : opts.isReducedMotion());

  const layers = {
    floor: new PIXI.Graphics(),
    ghostQueues: new PIXI.Container(),
    ghost: new PIXI.Container(),
    queues: new PIXI.Graphics(),
    people: new PIXI.Container(),
    badges: new PIXI.Container(),
    overlay: new PIXI.Graphics(),
    labels: new PIXI.Container(),
  };
  for (const layer of [layers.floor, layers.ghostQueues, layers.ghost, layers.queues, layers.people, layers.badges, layers.overlay, layers.labels]) app.stage.addChild(layer);

  const chalk = makeChalkTexture(PIXI);
  /** A chalk stroke: textured when the texture exists, plain otherwise. Text is never drawn with it. */
  const chalkStroke = (width: number, color: number, alpha = 1) =>
    chalk === null ? { width, color, alpha } : { width, color, alpha, texture: chalk, textureSpace: 'global' as const };

  let destroyed = false;
  let width = app.screen.width;
  let viewHeight = app.screen.height;
  let camera: Camera = createCamera({ width, height: viewHeight, cellPx: CELL_PX });
  let fitZoom = 1;
  let fitCentre: [number, number] = [0, 0];
  const glide = createGlide();
  let snapNext = true;
  let pulseStartMs: number | null = null;
  let ringScale = 1;
  let ghostPx = 0;
  let pool: Pool<Graphics> | null = null;
  const sprites: Graphics[] = [];
  let builtFor: LoadInput | null = null;
  let stationLabels = new Map<string, Text>();
  let badgeTexts = new Map<string, Text>();
  let ghostBadgeTexts = new Map<string, Text>();
  let pathLabels: { text: Text; cells: [number, number][] }[] = [];
  const look = new Map<Graphics, string>();
  let gateLabels: Text[] = [];
  const followLabel = new PIXI.Text({ text: '', style: { fontSize: 11, fill: COLOUR.ink, fontFamily: '"DM Mono", ui-monospace, monospace', fontWeight: '500' } });
  followLabel.visible = false;
  layers.labels.addChild(followLabel);
  let spritesDrawn = 0;
  let wasFollowing = false;
  let aggregatedAttendees = 0;
  const screenOf = new Map<string, [number, number]>();
  const frames: number[] = [];
  let lastFrameAt: number | null = null;

  const makeText = (text: string, size: number): Text => {
    const t = new PIXI.Text({ text, style: { fontSize: size, fill: COLOUR.ink, fontFamily: '"Schibsted Grotesk", system-ui, sans-serif', fontWeight: '600' } });
    t.visible = false;
    return t;
  };

  /**
   * The candidate layer is a ghost (rounded top, eyes when large enough) drawn white and tinted per frame with its wait colour;
   * the baseline layer is translucent, hatched and dashed-outlined, in the baseline hue.
   */
  function paint(g: Graphics, role: 'candidate' | 'baseline', eyes = false): void {
    const key = role === 'candidate' ? (eyes ? 'candidate-eyes' : 'candidate') : 'baseline';
    if (look.get(g) === key) return;
    g.clear();
    if (role === 'candidate') {
      // 12 units wide, 13.44 tall: corner radius 6 on the top, 2.4 on the bottom, as the design draws a guest.
      g.moveTo(-6, 4.32).lineTo(-6, -0.72).arc(0, -0.72, 6, Math.PI, 2 * Math.PI).lineTo(6, 4.32).quadraticCurveTo(6, 6.72, 3.6, 6.72).lineTo(-3.6, 6.72).quadraticCurveTo(-6, 6.72, -6, 4.32).closePath();
      g.fill({ color: 0xffffff, alpha: CANDIDATE_LOOK.alpha });
      if (eyes) {
        g.circle(-2.3, -1.2, 1.4).fill({ color: COLOUR.boardDeep });
        g.circle(2.3, -1.2, 1.4).fill({ color: COLOUR.boardDeep });
      }
    } else {
      g.tint = 0xffffff;
      g.circle(0, 0, 6).fill({ color: GHOST_LOOK.colour, alpha: GHOST_LOOK.alpha });
      for (const y of [-3, 0, 3]) {
        const half = Math.sqrt(36 - y * y);
        g.moveTo(-half, y).lineTo(half, y);
      }
      g.stroke({ width: 1, color: GHOST_LOOK.colour, alpha: 0.9 });
      for (let i = 0; i < 8; i += 1) {
        const a0 = (i * Math.PI) / 4;
        g.moveTo(6 * Math.cos(a0), 6 * Math.sin(a0)).arc(0, 0, 6, a0, a0 + Math.PI / 8);
      }
      g.stroke({ width: 1.5, color: GHOST_LOOK.colour });
    }
    look.set(g, key);
  }
  function ensurePool(): void {
    if (pool !== null) return;
    pool = createPool<Graphics>(SPRITE_CAP, () => {
      const g = new PIXI.Graphics();
      paint(g, 'candidate');
      g.visible = false;
      layers.people.addChild(g);
      sprites.push(g);
      return g;
    });
  }

  /** The whole floor in the canvas: the zoom that makes the longer side meet the canvas edge, and the floor's centre. */
  function computeFit(input: LoadInput): void {
    fitZoom = Math.min(MAX_ZOOM, Math.max(0.05, Math.min(width / (input.layout.cols * CELL_PX), viewHeight / (input.layout.rows * CELL_PX))));
    fitCentre = [input.layout.cols / 2, input.layout.rows / 2];
  }
  function fitCamera(input: LoadInput): void {
    camera = createCamera({ width, height: viewHeight, cellPx: CELL_PX });
    computeFit(input);
    camera.setFitZoom(fitZoom);
    camera.centerOn(fitCentre);
  }
  /** Follow ended: the whole floor again, eased over 400 ms, or at once under reduced motion. */
  function releaseCamera(input: LoadInput, nowMs: number): void {
    if (reducedNow()) {
      fitCamera(input);
      return;
    }
    computeFit(input);
    camera.beginEase(nowMs, CAMERA_EASE_MS, fitZoom);
  }

  /** A new load: every sprite goes back to the pool, the station labels and badges are rebuilt, the canvas takes the floor's proportions, the camera is fitted. */
  function buildScene(input: LoadInput): void {
    ensurePool();
    (pool as Pool<Graphics>).releaseAll();
    for (const g of sprites) g.visible = false;
    spritesDrawn = 0;
    aggregatedAttendees = 0;
    glide.clear();
    snapNext = true;
    pulseStartMs = null;
    for (const t of [...stationLabels.values(), ...badgeTexts.values(), ...ghostBadgeTexts.values(), ...gateLabels, ...pathLabels.map((p) => p.text)]) t.destroy();
    stationLabels = new Map(input.stations.map((s) => [s.id, makeText(s.label, 11)]));
    badgeTexts = new Map([...input.stations.map((s) => s.id), 'entrance'].map((id) => [id, makeText('', 11)]));
    ghostBadgeTexts = new Map([...input.stations.map((s) => s.id), 'entrance'].map((id) => [id, makeText('', 11)]));
    gateLabels = [makeText('In', 10), makeText('Out', 10)];
    // Walking paths carry their distance: one label for each path the trace walks (the first 24 at most).
    const walked = [...(core.state().index?.paths.values() ?? [])].filter((p) => p.cells.length >= 2).slice(0, MAX_PATH_LABELS);
    pathLabels = walked.map((p) => {
      const text = makeText(`${String(Math.round(p.distanceM * 10) / 10)} m`, 10);
      text.style.fill = COLOUR.muted;
      return { text, cells: p.cells as [number, number][] };
    });
    layers.labels.removeChildren();
    layers.labels.addChild(followLabel);
    layers.badges.removeChildren();
    for (const t of [...stationLabels.values(), ...gateLabels, ...pathLabels.map((p) => p.text)]) layers.labels.addChild(t);
    for (const t of [...badgeTexts.values(), ...ghostBadgeTexts.values()]) layers.badges.addChild(t);
    const nextHeight = viewHeightFor(width, input.layout);
    if (nextHeight !== viewHeight) {
      viewHeight = nextHeight;
      app.renderer.resize(width, viewHeight);
    }
    fitCamera(input);
    builtFor = input;
  }

  const screen = (x: number, y: number): [number, number] => camera.toScreen([x, y]);

  /** A label's top left corner moved the least that puts the whole label inside the canvas (a label wider than the canvas starts at 0). */
  const keepInside = (t: Text, x: number, y: number): [number, number] => [
    Math.max(0, Math.min(x, width - t.width)),
    Math.max(0, Math.min(y, viewHeight - t.height)),
  ];

  /** Dots 2 px across along a polyline in canvas px, one every 7 px. */
  function dotted(g: Graphics, points: [number, number][]): void {
    let carry = PATH_DOT_GAP_PX / 2;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const [ax, ay] = points[i] as [number, number];
      const [bx, by] = points[i + 1] as [number, number];
      const length = Math.hypot(bx - ax, by - ay);
      if (length === 0) continue;
      for (let d = carry; d <= length; d += PATH_DOT_GAP_PX) g.circle(ax + ((bx - ax) * d) / length, ay + ((by - ay) * d) / length, PATH_DOT_PX / 2);
      carry = ((carry - length) % PATH_DOT_GAP_PX + PATH_DOT_GAP_PX) % PATH_DOT_GAP_PX;
    }
    g.fill({ color: COLOUR.ink, alpha: 0.65 });
  }

  function drawFloor(input: LoadInput, cellScreen: number, sample: Sample): void {
    const { layout, stations } = input;
    const g = layers.floor;
    g.clear();
    const [x0, y0] = screen(0, 0);
    const floorW = layout.cols * cellScreen;
    const floorH = layout.rows * cellScreen;
    g.rect(x0, y0, floorW, floorH).fill({ color: COLOUR.floor });
    for (let x = 0; x <= layout.cols; x += 1) {
      const [sx, sy] = screen(x, 0);
      g.moveTo(sx, sy).lineTo(sx, sy + floorH);
    }
    for (let y = 0; y <= layout.rows; y += 1) {
      const [sx, sy] = screen(0, y);
      g.moveTo(sx, sy).lineTo(sx + floorW, sy);
    }
    g.stroke({ width: 1, color: COLOUR.line, alpha: 0.07 });

    // The line lane: a 9% pumpkin band behind each queue, as many rows as the queue has now (one when it is empty).
    for (const s of stations) {
      const rows = Math.max(1, Math.ceil((sample.perStation[s.id]?.waiting ?? 0) / 10));
      const [lx, ly] = screen(s.cell[0] + 1, s.cell[1]);
      const right = Math.min(layout.cols, s.cell[0] + 1 + 9 * 0.7 + 1);
      const bandW = Math.max(0, (right - (s.cell[0] + 1)) * cellScreen);
      if (bandW > 0) g.roundRect(lx, ly, bandW, ((rows - 1) * 0.7 + 1) * cellScreen, Math.min(14, cellScreen * 0.35)).fill({ color: COLOUR.lane, alpha: LANE_ALPHA });
    }

    // Walking paths: 2 px dotted chalk.
    for (const p of pathLabels) dotted(g, p.cells.map((c) => screen(c[0] + 0.5, c[1] + 0.5)));

    // Walls: the border of the floor, and the edges of blocked cells that face open floor.
    const blocked = new Set(layout.blockedCells.map((c) => `${c[0]},${c[1]}`));
    for (const [bx, by] of layout.blockedCells) {
      const [sx, sy] = screen(bx, by);
      g.rect(sx, sy, cellScreen, cellScreen).fill({ color: COLOUR.ink, alpha: 0.1 });
    }
    for (const [bx, by] of layout.blockedCells) {
      const [sx, sy] = screen(bx, by);
      if (by > 0 && !blocked.has(`${bx},${by - 1}`)) g.moveTo(sx, sy).lineTo(sx + cellScreen, sy);
      if (by < layout.rows - 1 && !blocked.has(`${bx},${by + 1}`)) g.moveTo(sx, sy + cellScreen).lineTo(sx + cellScreen, sy + cellScreen);
      if (bx > 0 && !blocked.has(`${bx - 1},${by}`)) g.moveTo(sx, sy).lineTo(sx, sy + cellScreen);
      if (bx < layout.cols - 1 && !blocked.has(`${bx + 1},${by}`)) g.moveTo(sx + cellScreen, sy).lineTo(sx + cellScreen, sy + cellScreen);
    }
    g.stroke(chalkStroke(STROKE_PX, COLOUR.ink));
    g.rect(x0 + WALL_PX / 2, y0 + WALL_PX / 2, floorW - WALL_PX, floorH - WALL_PX).stroke(chalkStroke(WALL_PX, COLOUR.ink));

    // The In and Out doors.
    for (const [cell, label] of [[layout.entrance, 0], [layout.exit, 1]] as const) {
      const [sx, sy] = screen(cell[0], cell[1]);
      g.rect(sx, sy, cellScreen, cellScreen).fill({ color: COLOUR.board }).stroke(chalkStroke(STROKE_PX, COLOUR.ink));
      const t = gateLabels[label];
      if (t !== undefined) {
        t.visible = true;
        t.position.set(...keepInside(t, sx + 2, sy + 2));
      }
    }
    // Stations: a 10% chalk fill, a chalk outline, the name above.
    for (const s of stations) {
      const [sx, sy] = screen(s.cell[0], s.cell[1]);
      g.rect(sx, sy, cellScreen, cellScreen).fill({ color: COLOUR.ink, alpha: 0.1 }).stroke(chalkStroke(STROKE_PX, COLOUR.ink));
      const t = stationLabels.get(s.id);
      if (t !== undefined) {
        t.visible = true;
        t.position.set(...keepInside(t, sx, sy - 14));
      }
    }
    // Distances beside the dotted paths.
    for (const p of pathLabels) {
      const mid = p.cells[Math.floor(p.cells.length / 2)] as [number, number];
      const [mx, my] = screen(mid[0] + 0.5, mid[1] + 0.5);
      p.text.visible = true;
      p.text.position.set(...keepInside(p.text, mx - p.text.width / 2, my - p.text.height - 3));
    }
  }

  function spritePosition(stations: Scenario['stations'], a: AttendeeSample): [number, number] {
    if (a.phase === 'waiting' && a.stationId !== undefined && a.queueIndex !== undefined) {
      const station = stations.find((s) => s.id === a.stationId);
      if (station !== undefined) {
        const slot = queueSlot(station.cell, a.queueIndex);
        return [slot[0] + 0.5, slot[1] + 0.5];
      }
    }
    if (a.phase === 'in-service') return [a.position[0] + 0.25 + 0.1 * ((a.server ?? 0) % 5), a.position[1] + 0.5];
    return [a.position[0] + 0.5, a.position[1] + 0.5];
  }

  let maxWaitCache: { index: unknown; ms: number } | null = null;
  /** The longest wait of the loaded run, the far end of the wait ramp; computed once per loaded trace. */
  function maxWaitFor(index: Parameters<typeof longestWaitMs>[0] | null): number {
    if (index === null) return 0;
    if (maxWaitCache === null || maxWaitCache.index !== index) maxWaitCache = { index, ms: longestWaitMs(index) };
    return maxWaitCache.ms;
  }

  const pulsing = (nowMs: number): boolean => pulseStartMs !== null && nowMs - pulseStartMs < PULSE_MS;

  function draw(): void {
    const state = core.state();
    const input = state.input;
    if (input === null || state.index === null) {
      layers.floor.clear();
      layers.queues.clear();
      layers.overlay.clear();
      return;
    }
    if (builtFor !== input) buildScene(input);
    const now = performance.now();
    const clock = state.clock;
    const sample = sampleAt(state.index, clock.ms);
    const ghostSample = state.ghost === null ? null : sampleAt(state.ghost, clock.ms);
    const split = splitLayers(sample, ghostSample, state.ghost === null ? SPRITE_CAP : SPRITE_CAP_WITH_GHOST);
    const { drawn, aggregated } = split.candidate;

    // Where each drawn ghost is shown, in cells: where the sampler puts it at the replay clock, with a short linear glide when it
    // jumps (a queue moving up, a step of the clock). A scrub snaps. The glide ends exactly on the sampled place.
    const snap = snapNext;
    snapNext = false;
    const glideMs = clock.playing ? GLIDE_MS / clock.speed : GLIDE_MS;
    const shown = new Map<string, [number, number]>();
    for (const a of drawn) shown.set(a.id, glide.at(a.id, spritePosition(input.stations, a), now, { durationMs: glideMs, snap }));

    // The camera moves only while Follow is on or an ease is running; when follow ends (released, or the attendee exited) the whole floor is fitted again.
    const following = state.follow !== null;
    if (!following && wasFollowing) releaseCamera(input, now);
    wasFollowing = following;
    if (following) {
      const followed = shown.get(state.follow as string) ?? ((): [number, number] | undefined => {
        const a = sample.attendees.find((x) => x.id === state.follow);
        return a === undefined ? undefined : spritePosition(input.stations, a);
      })();
      if (followed !== undefined) camera.moveTo(followed, now);
    } else if (camera.easing) {
      camera.moveTo(fitCentre, now);
    }
    const cellScreen = CELL_PX * camera.zoom;
    drawFloor(input, cellScreen, sample);

    // Queue lines: one bar per row of slots beside each station, coloured by the waiting count (simulated waiting only).
    layers.queues.clear();
    for (const station of input.stations) {
      const waiting = sample.perStation[station.id]?.waiting ?? 0;
      for (let first = 0; first < waiting; first += 10) {
        const last = Math.min(waiting - 1, first + 9);
        const a = queueSlot(station.cell, first);
        const b = queueSlot(station.cell, last);
        const [ax, ay] = screen(a[0] + 0.5, a[1] + 0.5);
        const [bx, by] = screen(b[0] + 0.5, b[1] + 0.5);
        layers.queues.moveTo(ax, ay).lineTo(bx, by).stroke({ width: Math.max(3, cellScreen * 0.5), color: queueColour(waiting), alpha: 0.55, cap: 'round' });
      }
    }

    // People: the drawn ids take pooled slots; everything else is hidden.
    // One pool of 1,000 slots serves both layers (at most 500 + 500 with a ghost), so the sprite budget never rises.
    const ghostDrawn = split.baseline.drawn;
    const slots = (pool as Pool<Graphics>).sync([...drawn.map((a) => a.id), ...ghostDrawn.map((a) => ghostKey(a.id))]);
    for (const g of sprites) g.visible = false;
    screenOf.clear();
    // A ghost is 12 units wide: 26 px on a desktop floor and 14 px on a phone floor when the whole floor is fitted, larger as the
    // camera zooms in. Eyes only when it is large enough to show them.
    const size = ghostSizePx({ canvasWidth: width, zoom: camera.zoom, fitZoom });
    ghostPx = size;
    const scale = size / 12;
    const eyes = size >= EYES_FROM_PX;
    const maxWait = maxWaitFor(state.index);
    // The baseline is translucent and dashed-outlined, so an overlap with a candidate sprite stays readable.
    const ghostStations = state.ghostStations ?? input.stations;
    for (const a of ghostDrawn) {
      const g = slots.get(ghostKey(a.id));
      if (g === undefined) continue;
      paint(g, 'baseline');
      g.tint = 0xffffff;
      const [px, py] = spritePosition(ghostStations, a);
      const [sx, sy] = screen(px, py);
      g.position.set(sx, sy);
      g.scale.set(Math.max(0.25, (cellScreen * 0.3) / 6));
      g.visible = true;
    }
    for (const a of drawn) {
      const g = slots.get(a.id);
      if (g === undefined) continue;
      paint(g, 'candidate', eyes);
      g.tint = waitColour(state.index === null ? 0 : waitedMsAt(state.index, a.id, clock.ms), maxWait);
      const [px, py] = shown.get(a.id) as [number, number];
      const [sx, sy] = screen(px, py);
      g.position.set(sx, sy);
      g.scale.set(scale);
      g.visible = true;
      screenOf.set(a.id, [sx, sy]);
    }
    spritesDrawn = slots.size;

    // Badges for the attendees beyond the cap.
    aggregatedAttendees = aggregated.reduce((n, g) => n + g.waiting + g.inService + g.walking, 0);
    for (const t of [...badgeTexts.values(), ...ghostBadgeTexts.values()]) t.visible = false;
    const placeBadges = (lines: typeof aggregated, texts: Map<string, Text>, stations: Scenario['stations'], prefix: string, drop: number): void => {
      for (const badge of badgeLines(lines)) {
        const t = texts.get(badge.stationId);
        if (t === undefined) continue;
        const cell = badge.stationId === 'entrance' ? input.layout.entrance : stations.find((s) => s.id === badge.stationId)?.cell;
        if (cell === undefined) continue;
        const text = prefix + badge.lines.join('  ');
        if (t.text !== text) t.text = text;
        const [sx, sy] = screen(cell[0], cell[1] + 1);
        t.position.set(sx, sy + 2 + drop);
        t.visible = true;
      }
    };
    placeBadges(aggregated, badgeTexts, input.stations, '', 0);
    placeBadges(split.baseline.aggregated, ghostBadgeTexts, ghostStations, 'Baseline ', 13);

    // Rings for the selected attendee or station and for the followed attendee.
    const o = layers.overlay;
    o.clear();
    const sel = state.selected;
    if (sel !== null && sel.kind === 'attendee') {
      const at = screenOf.get(sel.id);
      if (at !== undefined) o.circle(at[0], at[1], Math.max(6, cellScreen * 0.45)).stroke({ width: 2, color: COLOUR.focus });
    } else if (sel !== null) {
      const station = input.stations.find((s) => s.id === sel.id);
      if (station !== undefined) {
        const [sx, sy] = screen(station.cell[0], station.cell[1]);
        o.rect(sx - 2, sy - 2, cellScreen + 4, cellScreen + 4).stroke({ width: 3, color: COLOUR.focus });
      }
    }
    followLabel.visible = false;
    ringScale = pulseStartMs === null ? 1 : pulseScale(now - pulseStartMs);
    if (state.follow !== null) {
      const at = screenOf.get(state.follow);
      if (at !== undefined) {
        // A board-coloured gap, then a chalk ring (pulsing once on selection), and the id in chalk above it.
        const ring = Math.max(9, size * 0.8) * ringScale;
        o.circle(at[0], at[1], ring).stroke({ width: 4, color: COLOUR.board });
        o.circle(at[0], at[1], ring + 3).stroke({ width: 2, color: COLOUR.ink });
        if (followLabel.text !== state.follow) followLabel.text = state.follow;
        followLabel.position.set(...keepInside(followLabel, at[0] - followLabel.width / 2, at[1] - ring - 3 - followLabel.height - 2));
        followLabel.visible = true;
      }
    }
  }

  const shouldRun = (): boolean => {
    const state = core.state();
    if (destroyed || document.visibilityState === 'hidden' || state.index === null) return false;
    const now = performance.now();
    return state.clock.playing || state.follow !== null || camera.easing || glide.active(now) || pulsing(now);
  };

  function syncTicker(): void {
    if (destroyed) return;
    // A frame while the ticker is stopped, so a pause, a step or a seek shows at once; the frame may start a glide or an ease.
    if (!shouldRun() && document.visibilityState !== 'hidden') {
      draw();
      app.render();
    }
    const run = shouldRun();
    if (run && !app.ticker.started) {
      lastFrameAt = null;
      app.ticker.start();
    } else if (!run && app.ticker.started) {
      app.ticker.stop();
      lastFrameAt = null;
    }
  }

  const onTick = (): void => {
    const now = performance.now();
    const delta = lastFrameAt === null ? 0 : Math.min(now - lastFrameAt, MAX_FRAME_MS);
    lastFrameAt = now;
    frames.push(now);
    core.tick(delta, now);
    draw();
    if (!shouldRun()) syncTicker();
  };
  app.ticker.add(onTick);

  const unsubscribe = core.onChange(syncTicker);
  const onVisibility = (): void => syncTicker();
  const onResize = (): void => {
    const next = Math.max(240, opts.container.clientWidth || width);
    if (next === width) return;
    width = next;
    const input = core.state().input;
    viewHeight = viewHeightFor(width, input === null ? undefined : input.layout);
    app.renderer.resize(width, viewHeight);
    if (input !== null) fitCamera(input);
    snapNext = true;
    syncTicker();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);

  const onPointerDown = (e: PointerEvent): void => {
    const input = core.state().input;
    if (input === null) return;
    const box = canvas.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const reach = Math.max(8, CELL_PX * camera.zoom * 0.4);
    let best: { id: string; d: number } | null = null;
    for (const [id, [sx, sy]] of screenOf) {
      const d = Math.hypot(sx - x, sy - y);
      if (d <= reach && (best === null || d < best.d)) best = { id, d };
    }
    if (best !== null) return core.emitHit({ kind: 'attendee', id: best.id });
    const cellScreen = CELL_PX * camera.zoom;
    for (const s of input.stations) {
      const [sx, sy] = screen(s.cell[0], s.cell[1]);
      if (x >= sx && x <= sx + cellScreen && y >= sy && y <= sy + cellScreen) return core.emitHit({ kind: 'station', id: s.id });
    }
  };
  canvas.addEventListener('pointerdown', onPointerDown);

  /** Test aid: the canvas size, the floor's rectangle and the canvas position in CSS px of the centre of the entrance, the exit and every station cell. */
  const projection = (input: LoadInput | null): Record<string, unknown> | null => {
    if (input === null) return null;
    const at = (cell: readonly number[]): [number, number] => screen((cell[0] as number) + 0.5, (cell[1] as number) + 0.5);
    const [fl, ft] = screen(0, 0);
    const [fr, fb] = screen(input.layout.cols, input.layout.rows);
    return {
      canvas: { width, height: viewHeight },
      cellPx: CELL_PX * camera.zoom,
      floor: { left: fl, top: ft, right: fr, bottom: fb },
      entrance: at(input.layout.entrance),
      exit: at(input.layout.exit),
      stations: Object.fromEntries(input.stations.map((s) => [s.id, at(s.cell)])),
    };
  };

  /** Test aid: the canvas size and the bounds, in canvas CSS px, of every visible station label and of the entrance and exit labels. */
  const labelBounds = (): Record<string, unknown> => ({
    canvas: { width, height: viewHeight },
    labels: [...stationLabels.values(), ...gateLabels]
      .filter((t) => t.visible)
      .map((t) => ({ text: t.text, left: t.x, top: t.y, right: t.x + t.width, bottom: t.y + t.height })),
    pathLabels: pathLabels
      .filter((p) => p.text.visible)
      .map((p) => ({ text: p.text.text, left: p.text.x, top: p.text.y, right: p.text.x + p.text.width, bottom: p.text.y + p.text.height })),
  });

  const guard = (): void => {
    if (destroyed) throw new Error('Game view destroyed');
  };

  return {
    load: (input) => core.load(input),
    play: () => core.play(),
    pause: () => core.pause(),
    setSpeed: (s) => core.setSpeed(s),
    step: (d) => core.step(d),
    seek(ms) {
      snapNext = true;
      core.seek(ms);
    },
    follow(id) {
      core.follow(id);
      const input = core.state().input;
      const now = performance.now();
      if (core.state().follow !== null) {
        const target = Math.max(camera.zoom, 2);
        if (reducedNow()) {
          camera.setZoom(target);
          pulseStartMs = null;
        } else {
          camera.beginEase(now, CAMERA_EASE_MS, target);
          pulseStartMs = now;
        }
        wasFollowing = true;
        syncTicker();
      } else if (input !== null && wasFollowing) {
        // Released before any frame saw Follow: the whole floor again.
        releaseCamera(input, now);
        wasFollowing = false;
        pulseStartMs = null;
        syncTicker();
      } else {
        pulseStartMs = null;
      }
    },
    select: (t) => core.select(t),
    setGhost: (trace, stations) => core.setGhost(trace, stations),
    onHit: (cb) => core.onHit(cb),
    onClock: (cb) => core.onClock(cb),
    onFollowEnd: (cb) => core.onFollowEnd(cb),
    sampleNow: () => core.sampleNow(),
    debug() {
      guard();
      const state = core.state();
      const cut = performance.now() - 2000;
      while (frames.length > 0 && (frames[0] as number) < cut) frames.shift();
      const now = performance.now();
      return {
        tickerRunning: app.ticker.started,
        resolution: app.renderer.resolution,
        clockMs: state.clock.ms,
        playing: state.clock.playing,
        speed: state.clock.speed,
        follow: state.follow,
        spritesDrawn,
        spritesPooled: pool?.allocated ?? 0,
        aggregatedAttendees,
        ghostLoaded: state.ghost !== null,
        framesLast2s: frames.length,
        rendererStatus: 'ready',
        motion: { ghostPx, ringScale, cameraEasing: camera.easing, glideActive: glide.active(now), chalkTexture: chalk !== null, zoom: camera.zoom, fitZoom },
        projection: projection(state.input),
        labelBounds: labelBounds(),
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      app.ticker.stop();
      app.ticker.remove(onTick);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      app.destroy({ removeView: true }, { children: true });
    },
  };
}

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
//   `new Text({ text, style: { fontSize, fill } })`.
// The ticker's own deltaMS is not used: the clock advances by the real time between two frames measured here, capped at 250 ms,
// so a ticker that was stopped (hidden tab, pause) never adds the time it was stopped.
import type { Application, Graphics, Text } from 'pixi.js';
import type { Scenario } from '../domain/scenario';
import type { Trace } from '../simulation/trace';
import { badgeLines } from './badges';
import { createCamera, type Camera } from './camera';
import { createReplayCore, type Hit, type LoadInput, type ReplayCore } from './core';
import { failed } from './fallback';
import { createPool, type Pool } from './pool';
import { queueColour, queueSlot } from './queueLine';
import { sampleAt, visibleSet, type AttendeeSample, type Sample } from './sampler';

export type { Hit } from './core';

export type GameViewOptions = { container: HTMLElement; reducedMotion: boolean; test: boolean; dpr: number };
export type GameViewDebug = {
  tickerRunning: boolean; resolution: number; clockMs: number; playing: boolean; speed: number; follow: string | null;
  spritesDrawn: number; spritesPooled: number; aggregatedAttendees: number; ghostLoaded: boolean; framesLast2s: number;
  rendererStatus: 'ready' | 'unavailable' | 'destroyed';
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
  setGhost(trace: Trace | null): void;
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
const VIEW_HEIGHT = 420;
const MAX_FRAME_MS = 250;

const COLOUR = { floor: 0x151f33, line: 0x2b3a57, ink: 0xeef2f8, blocked: 0x3b4a68, candidate: 0x22d3ee, board: 0x0b1220, focus: 0xfde047 } as const;

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
  const width0 = Math.max(320, opts.container.clientWidth || 640);
  try {
    PIXI = await import('pixi.js');
    app = new PIXI.Application();
    await app.init({
      width: width0,
      height: VIEW_HEIGHT,
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

function buildHandle(PIXI: typeof import('pixi.js'), app: Application, core: ReplayCore, opts: GameViewOptions): GameViewHandle {
  const canvas = app.canvas;
  opts.container.appendChild(canvas);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Replay of the simulated run. The timeline and result tables hold every number.');

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

  let destroyed = false;
  let width = app.screen.width;
  let camera: Camera = createCamera({ width, height: VIEW_HEIGHT, cellPx: CELL_PX });
  let pool: Pool<Graphics> | null = null;
  const sprites: Graphics[] = [];
  let builtFor: LoadInput | null = null;
  let stationLabels = new Map<string, Text>();
  let badgeTexts = new Map<string, Text>();
  let gateLabels: Text[] = [];
  let spritesDrawn = 0;
  let aggregatedAttendees = 0;
  const screenOf = new Map<string, [number, number]>();
  const frames: number[] = [];
  let lastFrameAt: number | null = null;

  const makeText = (text: string, size: number): Text => {
    const t = new PIXI.Text({ text, style: { fontSize: size, fill: COLOUR.ink } });
    t.visible = false;
    return t;
  };

  function ensurePool(): void {
    if (pool !== null) return;
    pool = createPool<Graphics>(SPRITE_CAP, () => {
      const g = new PIXI.Graphics().circle(0, 0, 6).fill({ color: COLOUR.candidate }).stroke({ width: 1.5, color: COLOUR.board });
      g.visible = false;
      layers.people.addChild(g);
      sprites.push(g);
      return g;
    });
  }

  function fitCamera(input: LoadInput): void {
    camera = createCamera({ width, height: VIEW_HEIGHT, cellPx: CELL_PX });
    camera.setZoom(Math.min(width / (input.layout.cols * CELL_PX), VIEW_HEIGHT / (input.layout.rows * CELL_PX)));
    camera.centerOn([input.layout.cols / 2, input.layout.rows / 2]);
  }

  /** A new load: every sprite goes back to the pool, the station labels and badges are rebuilt, the camera is fitted. */
  function buildScene(input: LoadInput): void {
    ensurePool();
    (pool as Pool<Graphics>).releaseAll();
    for (const g of sprites) g.visible = false;
    spritesDrawn = 0;
    aggregatedAttendees = 0;
    for (const t of [...stationLabels.values(), ...badgeTexts.values(), ...gateLabels]) t.destroy();
    stationLabels = new Map(input.stations.map((s) => [s.id, makeText(s.label, 11)]));
    badgeTexts = new Map([...input.stations.map((s) => s.id), 'entrance'].map((id) => [id, makeText('', 11)]));
    gateLabels = [makeText('In', 10), makeText('Out', 10)];
    layers.labels.removeChildren();
    layers.badges.removeChildren();
    for (const t of [...stationLabels.values(), ...gateLabels]) layers.labels.addChild(t);
    for (const t of badgeTexts.values()) layers.badges.addChild(t);
    fitCamera(input);
    builtFor = input;
  }

  const screen = (x: number, y: number): [number, number] => camera.toScreen([x, y]);

  function drawFloor(input: LoadInput, cellScreen: number): void {
    const { layout, stations } = input;
    const g = layers.floor;
    g.clear();
    const [x0, y0] = screen(0, 0);
    g.rect(x0, y0, layout.cols * cellScreen, layout.rows * cellScreen).fill({ color: COLOUR.floor });
    for (let x = 0; x <= layout.cols; x += 1) {
      const [sx, sy] = screen(x, 0);
      g.moveTo(sx, sy).lineTo(sx, sy + layout.rows * cellScreen);
    }
    for (let y = 0; y <= layout.rows; y += 1) {
      const [sx, sy] = screen(0, y);
      g.moveTo(sx, sy).lineTo(sx + layout.cols * cellScreen, sy);
    }
    g.stroke({ width: 1, color: COLOUR.line, alpha: 0.6 });
    for (const [bx, by] of layout.blockedCells) {
      const [sx, sy] = screen(bx, by);
      g.rect(sx, sy, cellScreen, cellScreen).fill({ color: COLOUR.blocked });
      g.moveTo(sx, sy).lineTo(sx + cellScreen, sy + cellScreen).moveTo(sx + cellScreen, sy).lineTo(sx, sy + cellScreen).stroke({ width: 1, color: COLOUR.ink, alpha: 0.5 });
    }
    for (const [cell, label] of [[layout.entrance, 0], [layout.exit, 1]] as const) {
      const [sx, sy] = screen(cell[0], cell[1]);
      g.rect(sx, sy, cellScreen, cellScreen).stroke({ width: 2, color: COLOUR.ink });
      const t = gateLabels[label];
      if (t !== undefined) {
        t.visible = true;
        t.position.set(sx + 2, sy + 2);
      }
    }
    for (const s of stations) {
      const [sx, sy] = screen(s.cell[0], s.cell[1]);
      g.rect(sx, sy, cellScreen, cellScreen).fill({ color: COLOUR.candidate, alpha: 0.3 }).stroke({ width: 2, color: COLOUR.candidate });
      const t = stationLabels.get(s.id);
      if (t !== undefined) {
        t.visible = true;
        t.position.set(sx, sy - 14);
      }
    }
  }

  function spritePosition(input: LoadInput, a: AttendeeSample): [number, number] {
    if (a.phase === 'waiting' && a.stationId !== undefined && a.queueIndex !== undefined) {
      const station = input.stations.find((s) => s.id === a.stationId);
      if (station !== undefined) {
        const slot = queueSlot(station.cell, a.queueIndex);
        return [slot[0] + 0.5, slot[1] + 0.5];
      }
    }
    if (a.phase === 'in-service') return [a.position[0] + 0.25 + 0.1 * ((a.server ?? 0) % 5), a.position[1] + 0.5];
    return [a.position[0] + 0.5, a.position[1] + 0.5];
  }

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
    const clock = state.clock;
    const sample = sampleAt(state.index, clock.ms);
    const cap = state.ghost === null ? SPRITE_CAP : SPRITE_CAP_WITH_GHOST;
    const { drawn, aggregated } = visibleSet(sample, cap);

    if (state.follow !== null) {
      const followed = sample.attendees.find((a) => a.id === state.follow);
      if (followed !== undefined) {
        const [fx, fy] = spritePosition(input, followed);
        camera.centerOn([fx, fy]);
      }
    }
    const cellScreen = CELL_PX * camera.zoom;
    drawFloor(input, cellScreen);

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
    const slots = (pool as Pool<Graphics>).sync(drawn.map((a) => a.id));
    for (const g of sprites) g.visible = false;
    screenOf.clear();
    const radius = Math.max(0.25, (cellScreen * 0.3) / 6);
    for (const a of drawn) {
      const g = slots.get(a.id);
      if (g === undefined) continue;
      const [px, py] = spritePosition(input, a);
      const [sx, sy] = screen(px, py);
      g.position.set(sx, sy);
      g.scale.set(radius);
      g.visible = true;
      screenOf.set(a.id, [sx, sy]);
    }
    spritesDrawn = slots.size;

    // Badges for the attendees beyond the cap.
    aggregatedAttendees = aggregated.reduce((n, g) => n + g.waiting + g.inService + g.walking, 0);
    for (const t of badgeTexts.values()) t.visible = false;
    for (const badge of badgeLines(aggregated)) {
      const t = badgeTexts.get(badge.stationId);
      if (t === undefined) continue;
      const cell = badge.stationId === 'entrance' ? input.layout.entrance : input.stations.find((s) => s.id === badge.stationId)?.cell;
      if (cell === undefined) continue;
      const text = badge.lines.join('  ');
      if (t.text !== text) t.text = text;
      const [sx, sy] = screen(cell[0], cell[1] + 1);
      t.position.set(sx, sy + 2);
      t.visible = true;
    }

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
    if (state.follow !== null) {
      const at = screenOf.get(state.follow);
      if (at !== undefined) o.circle(at[0], at[1], Math.max(9, cellScreen * 0.6)).stroke({ width: 2, color: COLOUR.ink, alpha: 0.9 });
    }
  }

  const shouldRun = (): boolean => {
    const state = core.state();
    return !destroyed && document.visibilityState !== 'hidden' && state.index !== null && (state.clock.playing || state.follow !== null);
  };

  function syncTicker(): void {
    if (destroyed) return;
    const run = shouldRun();
    if (run && !app.ticker.started) {
      lastFrameAt = null;
      app.ticker.start();
    } else if (!run && app.ticker.started) {
      app.ticker.stop();
      lastFrameAt = null;
    }
    if (!run && document.visibilityState !== 'hidden') {
      draw();
      app.render();
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
    const next = Math.max(320, opts.container.clientWidth || width);
    if (next === width) return;
    width = next;
    app.renderer.resize(width, VIEW_HEIGHT);
    const input = core.state().input;
    if (input !== null) fitCamera(input);
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

  const guard = (): void => {
    if (destroyed) throw new Error('Game view destroyed');
  };

  return {
    load: (input) => core.load(input),
    play: () => core.play(),
    pause: () => core.pause(),
    setSpeed: (s) => core.setSpeed(s),
    step: (d) => core.step(d),
    seek: (ms) => core.seek(ms),
    follow(id) {
      core.follow(id);
      if (core.state().follow !== null) camera.setZoom(Math.max(camera.zoom, 2));
    },
    select: (t) => core.select(t),
    setGhost: (trace) => core.setGhost(trace),
    onHit: (cb) => core.onHit(cb),
    onClock: (cb) => core.onClock(cb),
    onFollowEnd: (cb) => core.onFollowEnd(cb),
    sampleNow: () => core.sampleNow(),
    debug() {
      guard();
      const state = core.state();
      const cut = performance.now() - 2000;
      while (frames.length > 0 && (frames[0] as number) < cut) frames.shift();
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

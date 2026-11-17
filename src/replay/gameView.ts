// The game view behind GameViewHandle (task 10.3). Task 1 writes the types and the signature.
import type { Scenario } from '../domain/scenario';
import type { Trace } from '../simulation/trace';
import type { Sample } from './sampler';

export type GameViewOptions = { container: HTMLElement; reducedMotion: boolean; test: boolean; dpr: number };
export type GameViewDebug = {
  tickerRunning: boolean; resolution: number; clockMs: number; playing: boolean; speed: number; follow: string | null;
  spritesDrawn: number; spritesPooled: number; aggregatedAttendees: number; ghostLoaded: boolean; framesLast2s: number;
  rendererStatus: 'ready' | 'unavailable' | 'destroyed';
};
export type Hit = { kind: 'attendee'; id: string } | { kind: 'station'; id: string };
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

export function createGameView(_opts: GameViewOptions): Promise<CreateGameViewResult> {
  throw new Error('not implemented: createGameView');
}

// The game view handle of the page, for the test hook only (window.__rehearsal.gameView()). The panel registers its handle
// when the canvas starts and a stand-in that reports `unavailable` when it does not, and clears it on unmount.
import type { GameViewDebug, GameViewHandle } from '../../replay/gameView';

type Registered = Pick<GameViewHandle, 'debug'> & Partial<GameViewHandle>;
let current: Registered | null = null;

export function registerView(view: Registered | null): void {
  current = view;
}

export function registeredView(): Registered {
  if (current === null) throw new Error('No game view is mounted.');
  return current;
}

export function unavailableView(): Registered {
  const debug: GameViewDebug = {
    tickerRunning: false, resolution: 0, clockMs: 0, playing: false, speed: 1, follow: null, spritesDrawn: 0, spritesPooled: 0,
    aggregatedAttendees: 0, ghostLoaded: false, framesLast2s: 0, rendererStatus: 'unavailable',
  };
  return { debug: () => debug };
}

const restartListeners = new Set<() => void>();

/** The panel restarts its view when asked (the test hook's forceRendererFailure(true)). */
export function onRestartRequest(cb: () => void): () => void {
  restartListeners.add(cb);
  return () => {
    restartListeners.delete(cb);
  };
}

export function requestRestart(): void {
  for (const cb of [...restartListeners]) cb();
}
